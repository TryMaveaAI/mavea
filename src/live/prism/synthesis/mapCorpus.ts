// synthesis/mapCorpus.ts — the frugal, staged ingest that turns a pile of sources into one settled
// Synthesis World. The naïve path (one explode call per source + one giant cross-compare over every
// claim) breaks at 100 sources on both call count and prompt size. Instead this is a LOCAL-MAP /
// MODEL-REDUCE pipeline: pure code extracts, digests, retrieves, grounds, and pairs; the model is
// reduced to a few bounded, batched calls whose prompts never grow with the whole corpus.
//
//   0 Extract (0 calls)            reuse Prism's client-side extractors → per-source page text
//   1 Digest (0 calls)             a cheap keyphrase digest per source
//   2 Theme reduce + facets (1)    one call over digests → the theme taxonomy + expected-facet checklist
//   3 Claim extraction (⌈N/B⌉)     batched; each source fed only its locally-retrieved slice, grounded
//                                  verbatim against its FULL text (the guarantee holds on a slice input)
//   4 Adjudicate A+C (1)           local candidates → one call → gated contradictions + consensus
//   5 Gaps (0)                     pure absence scan over the model's facet checklist
//
// Total ≈ 1 + ⌈N/B⌉ + 1 calls — ~11 for 100 sources vs ~101 naïve, and O(N/B). Never throws.
import type { Attachment } from '../../attachments';
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { isOffice, isText } from '../../attachments';
import { extractPdfPages } from '../extractPdf';
import { extractOfficeOffMain, extractTextOffMain } from '../extractClientDocument';
import { groundClaimsOffMain } from '../groundOffMain';
import { normalizePdfText } from '../grounding';
import { termSet, topTerms, leadSentences, numberOfFamily, citationLabel } from './corpus';
import { crossSourceCandidates, connectedComponents, type ClaimLite } from './candidates';
import { adjudicate } from './compare';
import { buildGaps, parseFacets } from './gaps';
import { distinctSourceCount, passesConsensus } from './gate';
import { extractJsonObject, asString, asArray } from './json';
import type { Claim, ClaimKind, ClaimRole, Thread } from '../types';
import type { ConsensusCluster, CorpusSource, CorpusSpec, ExpectedFacet, Theme } from './types';

/** How many sources' claims we extract per batched model call. Keeps each Stage-3 prompt bounded while
 *  minimizing the number of calls (12 → 9 calls for 100 sources). */
const BATCH_SIZE = 8;
/** Per-source char budget for the locally-retrieved slice we send in Stage 3. Generous enough that the
 *  model sees the substance of each source (a thin slice starves claim extraction — a long article
 *  yields only 1-2 claims, too few to form cross-source relations). Batched prompts stay well within a
 *  modern model's context; the retrieval still ranks the most on-theme pages first. */
const SLICE_BUDGET = 5000;
/** How many concurrent extractions to run — small, so a weak machine isn't swamped by 100 at once. */
const EXTRACT_CONCURRENCY = 6;

export interface MapCorpusOptions {
  /** Injected per-source page text (tests/back-compat) — skips client-side extraction when provided. */
  pagesOverride?: readonly (readonly string[])[];
  /** Progress for the staged bloom UI ("Reading 100 sources…", "Finding themes…"). */
  onProgress?: (stage: string) => void;
  batchSize?: number;
}

export interface MapCorpusResult {
  spec: CorpusSpec | null;
  error?: string;
  /** Per-source page text the claims were grounded against, retained for corpus Ask (no re-extraction). */
  corpus?: string[][];
  /** The surviving source attachments in `claim.source` order — so the shared Prism source panels can
   *  render each real page (PDF render / text) for a clicked claim. */
  sourcesAtt?: Attachment[];
  /** How many model calls the ingest actually made — asserted by the call-budget test. */
  callCount: number;
  /** Claims the model proposed before grounding (so the UI's "N read · M grounded · K dropped" line is
   *  honest for a corpus too, not just single-doc Prism). */
  proposed: number;
  /** Non-shipping diagnostics for tuning (facet checklist size, candidate pairs, claims per source). */
  debug?: {
    facetCount: number;
    candidatePairs: number;
    agreements: number;
    claimsBySource: number[];
  };
}

// ── Stage 0: extraction ───────────────────────────────────────────────────────────────────────────
interface Extracted {
  att: Attachment;
  pages: string[];
  kind: CorpusSource['kind'];
  slideImages?: { data: string; mime: string }[];
}

function fileStem(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').trim();
  return base.length > 40 ? `${base.slice(0, 39).trimEnd()}…` : base || 'Source';
}

async function extractOne(att: Attachment, override?: readonly string[]): Promise<Extracted> {
  if (override) return { att, pages: override.slice(), kind: 'text' };
  try {
    if (isOffice(att)) {
      const res = await extractOfficeOffMain(att);
      if (res.pages && res.pages.length > 0) return { att, pages: res.pages, kind: 'office' };
      // An image-only deck has no groundable text — deferred to the vision path (Phase 4); skip for now.
      return { att, pages: [], kind: 'image-deck' };
    }
    if (isText(att)) return { att, pages: (await extractTextOffMain(att)) ?? [], kind: 'text' };
    return { att, pages: (await extractPdfPages(att)) ?? [], kind: 'pdf' };
  } catch {
    return { att, pages: [], kind: 'pdf' };
  }
}

/** Run `fn` over items with a bounded concurrency, preserving order — so 100 sources don't all decode
 *  at once on a weak machine. */
async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Model-call plumbing ───────────────────────────────────────────────────────────────────────────
/** One JSON model call, defensively parsed; never throws (returns null on any failure). */
async function callJson(
  cfg: ModelConfig,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'prism-corpus-themes',
        system,
        history: [],
        user,
        maxTokens,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    return extractJsonObject(out.raw);
  } catch {
    return null;
  }
}

/** One model call that returns the RAW text (never parsed here), so a truncation-tolerant parser can
 *  salvage complete objects even when the JSON is cut off. Never throws (returns '' on failure). */
async function callRaw(
  cfg: ModelConfig,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'prism-corpus-synthesis',
        system,
        history: [],
        user,
        maxTokens,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    return typeof out.raw === 'string' ? out.raw : JSON.stringify(out.raw);
  } catch {
    return '';
  }
}

// ── Stage 2: theme reduce + expected-facet checklist ──────────────────────────────────────────────
const THEME_SYSTEM =
  'You organize a corpus of sources into a small set of themes and list the facets a complete treatment ' +
  'would cover, returning strict JSON only. You never claim a facet is present or absent — you only ' +
  'name what to expect and the words it would appear under.';

function themePrompt(
  digests: readonly { label: string; terms: string[]; lead: string[] }[],
): string {
  const body = digests
    .map((d, i) => `[${i}] ${d.label}\n  terms: ${d.terms.join(', ')}\n  "${d.lead.join(' ')}"`)
    .join('\n');
  return `Below are short digests of ${digests.length} sources in one corpus (top terms + a lead line each).

${body}

Return ONLY a JSON object (no prose, no fences):
{
  "themes": ["Efficacy", "Safety", "Cost", "Adoption"],
  "facets": [ { "label": "Pediatric population", "theme": "Safety",
    "surfaceForms": ["pediatric","paediatric","children","under 18"], "rationale": "why a full treatment would cover it" } ]
}

Rules:
- "themes": 3-7 broad topics that span the corpus (NOT one per source) — the map's regions.
- "facets": the sub-topics a COMPLETE treatment of these themes would address. For each, give 3-8
  surface forms — the exact words/synonyms it would appear under IF a source covered it (so absence can
  be checked literally). "theme" must be one of "themes". Do NOT say whether any source covers it.
- Base everything on the digests above — do not invent facets unrelated to this corpus.`;
}

// ── Stage 3: batched claim extraction ─────────────────────────────────────────────────────────────
const CLAIM_SYSTEM =
  'You extract grounded, verbatim-quoted claims from sources and tag each with a theme, returning ' +
  'strict JSON only. Every quote must be copied character-for-character from the source text.';

/** Retrieve the slice of a source most relevant to the corpus themes, so a batched prompt stays small
 *  while still surfacing each source's on-theme claims. Ranks pages by overlap with the theme terms,
 *  keeps the reading order, trims to the budget. A small source goes whole. */
function retrieveSlice(
  pages: readonly string[],
  themeTerms: ReadonlySet<string>,
  budget: number,
): string {
  const total = pages.reduce((n, p) => n + p.length, 0);
  const marked = pages.map((t, i) => ({ i, t, s: overlap(t, themeTerms) }));
  const ranked = total <= budget ? marked : marked.slice().sort((a, b) => b.s - a.s || a.i - b.i);
  const picked: { i: number; t: string }[] = [];
  let used = 0;
  for (const m of ranked) {
    picked.push({ i: m.i, t: m.t });
    used += m.t.length;
    if (used >= budget && picked.length >= 2) break;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map(
      (p) => `[p.${p.i + 1}]\n${p.t.slice(0, Math.max(400, Math.round(budget / picked.length)))}`,
    )
    .join('\n\n');
}

function overlap(text: string, terms: ReadonlySet<string>): number {
  const hay = text.toLowerCase();
  let n = 0;
  for (const t of terms) if (hay.includes(t)) n += 1;
  return n;
}

function claimBatchPrompt(
  batch: readonly { source: number; label: string; slice: string }[],
  themes: readonly string[],
): string {
  const body = batch.map((b) => `=== source ${b.source} — ${b.label} ===\n${b.slice}`).join('\n\n');
  return `Themes for this corpus (tag every claim with exactly one): ${themes.join(' | ')}

Extract the most important claims from each source below. Copy each "quote" VERBATIM from that source's
text (it is verified word-for-word — anything not found is dropped). Cite the "page" from its [p.N]
marker, and the "source" number from its heading.

${body}

Return ONLY a JSON object (no prose, no fences):
{ "claims": [ { "source": 0, "quote": "verbatim phrase (6-160 chars)", "page": 3,
  "theme": "one of the themes above", "kind": "forecast|stat|finding|risk|definition|method|diagram",
  "title": "a 3-7 word headline", "role": "load-bearing|supporting|context",
  "ask": "a short follow-up question" } ] }

Rules:
- Copy quotes character-for-character from the text above; never paraphrase or round.
- "theme" MUST be one of: ${themes.join(', ')}.
- Extract 6-12 DISTINCT claims from EACH source — cover its different facets (definition, mechanism,
  specific findings and numbers, health effects, risks, evidence quality), not just the opening lines.
  Favor specific, checkable statements — especially ones with a number, a finding, or a direct claim
  another source might agree or disagree with. Mark only a few "load-bearing".`;
}

const KINDS = new Set<ClaimKind>([
  'forecast',
  'stat',
  'finding',
  'risk',
  'definition',
  'method',
  'diagram',
]);
const ROLES = new Set<ClaimRole>(['load-bearing', 'supporting', 'context']);
function asKind(s: unknown): ClaimKind {
  const k = asString(s).toLowerCase();
  return KINDS.has(k as ClaimKind) ? (k as ClaimKind) : 'finding';
}
function asRole(s: unknown): ClaimRole {
  const r = asString(s).toLowerCase().trim();
  return ROLES.has(r as ClaimRole) ? (r as ClaimRole) : 'supporting';
}

interface RawClaim {
  source: number;
  quote: string;
  page: number;
  theme: string;
  kind: ClaimKind;
  title: string;
  role: ClaimRole;
  ask: string;
}

function coerceClaim(r: Record<string, unknown>): RawClaim | null {
  const quote = asString(r.quote);
  const page = Number(r.page);
  const source = Number(r.source);
  if (!quote || !Number.isInteger(page) || !Number.isInteger(source)) return null;
  return {
    source,
    quote,
    page,
    theme: asString(r.theme).trim(),
    kind: asKind(r.kind),
    title: asString(r.title).trim() || quote.slice(0, 40),
    role: asRole(r.role),
    ask: asString(r.ask).trim() || 'What does this mean?',
  };
}

/**
 * Parse the batch response into claims, TOLERANT OF TRUNCATION. A rich batch can push the model past
 * its output cap, cutting the JSON mid-array — a strict parse then yields zero claims and the whole
 * batch is lost. So: try the clean parse first; if it comes back empty, salvage every complete claim
 * object out of the raw text by scanning for balanced `{…}` blocks that carry a "quote" (the final,
 * incomplete object is simply skipped). A cutoff now costs one claim, never the batch.
 */
function parseBatchClaims(raw: string): RawClaim[] {
  const obj = extractJsonObject(raw);
  const arr = obj && Array.isArray(obj.claims) ? (obj.claims as unknown[]) : null;
  if (arr && arr.length) {
    const clean = arr
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(coerceClaim)
      .filter((c): c is RawClaim => c !== null);
    if (clean.length) return clean;
  }
  return salvageClaims(raw);
}

/** Pull every complete, balanced `{…}` object carrying a "quote" out of a possibly-truncated response
 *  and coerce each to a claim. String-aware brace matching; a trailing incomplete object is dropped. */
function salvageClaims(text: string): RawClaim[] {
  const out: RawClaim[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break; // truncated tail — no complete object remains
    const sub = text.slice(i, end + 1);
    if (sub.includes('"quote"')) {
      try {
        const claim = coerceClaim(JSON.parse(sub) as Record<string, unknown>);
        if (claim) {
          out.push(claim);
          i = end; // consume this object, keep scanning after it
        }
      } catch {
        /* a wrapper object (e.g. {"claims":[…]}) that doesn't parse as a claim — fall through */
      }
    }
  }
  return out;
}

/** Split into batches of `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
  return out;
}

/** The number of model calls the pipeline plans for `n` sources at batch size `b` — the budget bound
 *  (theme reduce + ⌈n/b⌉ claim batches + one adjudication). Exposed for the call-budget test. */
export function plannedCallCount(n: number, b = BATCH_SIZE): number {
  return 1 + Math.ceil(n / Math.max(1, b)) + 1;
}

// ── The pipeline ──────────────────────────────────────────────────────────────────────────────────
export async function mapCorpus(
  attachments: readonly Attachment[],
  cfg: ModelConfig,
  signal?: AbortSignal,
  opts: MapCorpusOptions = {},
): Promise<MapCorpusResult> {
  const { pagesOverride, onProgress, batchSize = BATCH_SIZE } = opts;
  let callCount = 0;

  // Stage 0 — extract text, keep only sources with groundable text (a corpus is text-first at scale).
  onProgress?.(`Reading ${attachments.length} sources…`);
  const extracted = await pool(attachments, EXTRACT_CONCURRENCY, (att, i) =>
    extractOne(att, pagesOverride?.[i]),
  );
  const kept = extracted.filter((e) => e.pages.length > 0);
  if (kept.length === 0) {
    return {
      spec: null,
      error: 'No readable text could be extracted from these sources.',
      callCount,
      proposed: 0,
    };
  }

  const sources: CorpusSource[] = kept.map((e, i) => ({
    id: `s${i}`,
    fileName: e.att.name,
    kind: e.kind,
    pageCount: e.pages.length,
    label: citationLabel(e.pages.join(' ')) || fileStem(e.att.name),
    ...(e.slideImages ? { slideImages: e.slideImages } : {}),
  }));
  const corpus: string[][] = kept.map((e) => e.pages);

  // Stage 1 — a cheap keyphrase digest per source.
  const digests = kept.map((e, i) => {
    const text = e.pages.join(' ');
    return { label: sources[i].label, terms: topTerms(text, 12), lead: leadSentences(text, 2) };
  });

  // Stage 2 — theme reduce + expected-facet checklist (one call). The facet checklist is what Stage 5's
  // gap scan checks absence against, so its size should track corpus BREADTH — a 100-source corpus
  // spans far more sub-topics than a 10-source one, and a fixed cap would starve the checklist (and
  // silently under-report gaps) right as the corpus gets large enough for gaps to matter most.
  onProgress?.('Finding themes…');
  const themeTokens = Math.min(4096, Math.max(1600, 900 + digests.length * 45));
  const themeObj = await callJson(cfg, THEME_SYSTEM, themePrompt(digests), themeTokens, signal);
  callCount += 1;
  const themeNames = dedupeThemes(asArray(themeObj, 'themes').map(asString));
  const themeSet = new Set(themeNames);
  const facets = parseFacets(asArray(themeObj, 'facets'));
  const facetTheme = new Map<string, string>();
  for (const raw of asArray(themeObj, 'facets')) {
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      const label = asString(r.label).trim();
      const theme = asString(r.theme).trim();
      if (label && themeSet.has(theme)) facetTheme.set(label, theme);
    }
  }
  const fallbackTheme = themeNames[0] ?? 'Findings';
  if (themeNames.length === 0) themeNames.push(fallbackTheme);

  // Stage 3 — batched, grounded claim extraction. Each source is fed its locally-retrieved slice; every
  // quote is grounded verbatim against that source's FULL pages, so a slice input never weakens truth.
  onProgress?.('Mapping claims…');
  const themeTerms = termSet(themeNames.join(' '));
  const prepared = kept.map((e, i) => ({
    source: i,
    label: sources[i].label,
    slice: retrieveSlice(e.pages, themeTerms, SLICE_BUDGET),
  }));
  const claims: Claim[] = [];
  let proposed = 0;
  for (const batch of batches(prepared, batchSize)) {
    const raw = await callRaw(
      cfg,
      CLAIM_SYSTEM,
      claimBatchPrompt(batch, themeNames),
      // Room for ~12 claims/source at ~60 tokens each, capped so one call never runs away. Smaller
      // batches (BATCH_SIZE) keep this within the cap so the JSON isn't truncated mid-array.
      Math.min(8192, 1500 + batch.length * 850),
      signal,
    );
    callCount += 1;
    const rawClaims = parseBatchClaims(raw);
    proposed += rawClaims.length;
    // Ground per source against its full page text (the grounding gate is unchanged, just batched).
    for (const b of batch) {
      const forSource = rawClaims.filter((c) => c.source === b.source);
      const grounded = await groundClaimsOffMain(forSource, corpus[b.source]);
      grounded.forEach((c, k) => {
        const region = themeSet.has(c.theme) ? c.theme : fallbackTheme;
        claims.push({
          id: `s${b.source}c${k}`,
          quote: c.quote,
          page: c.page,
          kind: c.kind,
          title: c.title,
          ask: c.ask,
          role: c.role,
          region,
          source: b.source,
        });
      });
    }
  }
  if (claims.length === 0) {
    return {
      spec: null,
      error: 'No claims could be grounded across these sources.',
      callCount,
      corpus,
      proposed,
    };
  }

  // Stage 4 — candidates → one adjudication call → gated contradictions + consensus.
  onProgress?.('Finding contradictions…');
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const sourceOf = new Map(claims.map((c) => [c.id, c.source]));
  const lites: ClaimLite[] = claims.map((c) => ({
    id: c.id,
    source: c.source,
    text: `${c.title}. ${c.quote}`,
  }));
  const pairs = crossSourceCandidates(lites);
  const { contradictions, agreements } = await adjudicate(pairs, {
    claimById,
    corpus,
    cfg,
    signal,
  });
  if (pairs.length > 0) callCount += 1; // adjudicate only calls the model when there are pairs

  const consensus = buildConsensus(agreements, claimById, sourceOf, kept.length);

  // Stage 5 — gaps (pure absence scan over the model's facet checklist; no call).
  const perSourceNorm = corpus.map((pages) => normalizePdfText(pages.join(' ')));
  const gaps = buildGaps(
    facets,
    perSourceNorm,
    (f: ExpectedFacet) => facetTheme.get(f.label) ?? '',
  );

  // ── Assemble ──
  const themes = buildThemes(themeNames, claims);
  const threads: Thread[] = [
    ...contradictions.map((x) => ({ a: x.a, b: x.b, relation: x.relation, crossDoc: true })),
    ...agreements.map((e) => ({ a: e.a, b: e.b, relation: 'agrees' as const, crossDoc: true })),
  ];
  const consensusSources = new Set<number>();
  for (const c of consensus)
    for (const id of c.memberClaimIds) {
      const s = sourceOf.get(id);
      if (s !== undefined) consensusSources.add(s);
    }
  const spec: CorpusSpec = {
    sources,
    themes,
    claims,
    threads,
    contradictions,
    gaps,
    consensus,
    counts: {
      contradictions: contradictions.length,
      gaps: gaps.length,
      consensus: consensusSources.size,
    },
    pageCount: sources.reduce((n, s) => n + s.pageCount, 0),
  };
  // One pass over the claims rather than a rescan per source: a corpus is N sources by M claims,
  // and rescanning turns a debug counter into the most expensive line in the map.
  const claimsBySource = sources.map(() => 0);
  for (const c of claims) if (claimsBySource[c.source] !== undefined) claimsBySource[c.source] += 1;
  return {
    spec,
    corpus,
    sourcesAtt: kept.map((e) => e.att),
    callCount,
    proposed,
    debug: {
      facetCount: facets.length,
      candidatePairs: pairs.length,
      agreements: agreements.length,
      claimsBySource,
    },
  };
}

/** Dedupe theme names case-insensitively, keep first-seen casing, cap to a sane region count. */
function dedupeThemes(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 8) break;
  }
  return out;
}

/** Build the theme list with counts, in the model's order, keeping only themes that hold ≥1 claim. */
function buildThemes(themeNames: readonly string[], claims: readonly Claim[]): Theme[] {
  const byTheme = new Map<string, { sources: Set<number>; count: number }>();
  for (const c of claims) {
    const t = byTheme.get(c.region) ?? { sources: new Set<number>(), count: 0 };
    t.sources.add(c.source);
    t.count += 1;
    byTheme.set(c.region, t);
  }
  // Themes in the model's order first, then any fallback themes that received claims.
  const ordered = [...themeNames, ...[...byTheme.keys()].filter((k) => !themeNames.includes(k))];
  const out: Theme[] = [];
  for (const name of ordered) {
    const t = byTheme.get(name);
    if (!t) continue;
    out.push({ id: name, name, sourceCount: t.sources.size, claimCount: t.count });
  }
  return out;
}

/** Cluster agreeing edges into consensus, keep only clusters spanning ≥2 sources, count distinct
 *  sources, pick a marked-paraphrase proposition, and compute a numeric agreement band when present. */
function buildConsensus(
  agreements: readonly { a: string; b: string; point: string }[],
  claimById: ReadonlyMap<string, Claim>,
  sourceOf: ReadonlyMap<string, number>,
  corpusSize: number,
): ConsensusCluster[] {
  const clusters = connectedComponents(agreements.map((e) => ({ a: e.a, b: e.b })));
  const out: ConsensusCluster[] = [];
  let cId = 0;
  for (const members of clusters) {
    const sourceCount = distinctSourceCount(members, sourceOf);
    if (!passesConsensus(sourceCount)) continue;
    // proposition: the point from an agreement edge whose members are in this cluster.
    const memberSet = new Set(members);
    const edge = agreements.find((e) => memberSet.has(e.a) && memberSet.has(e.b) && e.point);
    const first = claimById.get(members[0]);
    out.push({
      id: `c${cId}`,
      theme: first?.region ?? '',
      proposition: edge?.point || first?.title || 'Sources agree',
      memberClaimIds: members,
      sourceCount,
      corpusSize,
      ...bandOf(members, claimById),
    });
    cId += 1;
  }
  return out;
}

/** A numeric agreement band across a cluster's members, on the first unit family ≥2 members share. */
function bandOf(
  members: readonly string[],
  claimById: ReadonlyMap<string, Claim>,
): { band?: { unit: string; min: number; max: number } } {
  for (const family of ['pct', 'money', 'dose', 'count']) {
    const vals: number[] = [];
    let unit = '';
    for (const id of members) {
      const c = claimById.get(id);
      const num = c && numberOfFamily(c.quote, family);
      if (num) {
        vals.push(num.value);
        unit = unit || num.unit;
      }
    }
    if (vals.length >= 2) {
      return { band: { unit, min: Math.min(...vals), max: Math.max(...vals) } };
    }
  }
  return {};
}
