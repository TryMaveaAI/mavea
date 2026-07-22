// ask/ask.ts — "chat the document; it answers by lighting up." The exploded document's full text is
// already in memory (the same per-page corpus the grounding gate used), so answering a question costs
// no re-extraction and ONE model call. The model answers strictly from that text and returns verbatim
// span anchors; every span is re-verified against the real page (groundedPageOf) before it can show,
// so the answer can only point at sentences that genuinely exist — never a paraphrase dressed as a
// quote. When the document doesn't cover the question AND web search is on, ONE more call reaches
// outside for a single fact whose citation must survive the same verify gate as veracity (gate.ts).
//
// Cost shape: doc-only answer = 1 call (free, local grounding). Reaching outside = 1 search + 1 call,
// and ONLY when the document falls short and the user enabled web search. Never a per-claim fan-out.
import type { ModelConfig } from '../../../types/mavea';
import type { SearchProviderId } from '../../search/types';
import { getAdapter } from '../../providers';
import { getSearchProvider, searchQuery } from '../../search';
import { gateCitation, type Evidence } from '../veracity/gate';
import { groundedPageOf } from '../grounding';
import type { AnswerSpan, AskAnswer, AskCoverage, OutsideFact } from './types';

/** Everything an ask needs: the per-document page corpus to ground against, the model, and the user's
 *  web-search settings (the same shape Prism already receives). Search is optional and off by default. */
export interface AskContext {
  /** Per-document page text — `corpus[doc][page-1]`. The same text the explode grounded claims against. */
  corpus: readonly (readonly string[])[];
  cfg: ModelConfig;
  /** True when the world holds more than one document (so the prompt + spans carry a doc index). */
  multiDoc: boolean;
  /** Web-grounding settings from Live settings. When off (the default), the answer stays doc-only. */
  search?: { enabled: boolean; providerId: SearchProviderId; apiKey?: string };
  signal?: AbortSignal;
}

/** Prompt-size budget for the corpus we hand the model (chars). A large pile is locally pre-filtered
 *  to the pages most relevant to the question, so the one call stays cheap on weak hardware. */
const CORPUS_BUDGET = 14000;
const PER_PAGE = 1500;
/** Never show more anchors than the eye can follow — the strongest few carry the answer. */
const MAX_SPANS = 8;

export interface PageRef {
  doc: number;
  page: number;
  text: string;
}

/** Flatten the corpus to non-empty, length-capped pages. */
function allPages(corpus: AskContext['corpus']): PageRef[] {
  const out: PageRef[] = [];
  corpus.forEach((pages, doc) =>
    pages.forEach((text, i) => {
      const t = text.trim();
      if (t) out.push({ doc, page: i + 1, text: t.slice(0, PER_PAGE) });
    }),
  );
  return out;
}

/**
 * Pick the pages to send the model. A small corpus goes whole, in reading order. A large one is
 * ranked by keyword overlap with the question (a free, local retrieval — no model, no network) and
 * trimmed to the budget, then restored to reading order so the markers read naturally. Always keeps a
 * handful of pages even when nothing matches, so a vaguely-worded question still has context.
 */
export function selectPages(
  corpus: AskContext['corpus'],
  question: string,
  budget = CORPUS_BUDGET,
): PageRef[] {
  const pages = allPages(corpus);
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  if (total <= budget) return pages;

  const terms = Array.from(new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []));
  const score = (p: PageRef): number => {
    const hay = p.text.toLowerCase();
    return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
  };
  const ranked = pages
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.p.doc - b.p.doc || a.p.page - b.p.page);

  const picked: PageRef[] = [];
  let used = 0;
  for (const { p } of ranked) {
    if (used + p.text.length > budget && picked.length >= 6) break;
    picked.push(p);
    used += p.text.length;
    if (used >= budget) break;
  }
  return picked.sort((a, b) => a.doc - b.doc || a.page - b.page);
}

/** Render the selected pages as a prompt body the model can cite by [doc · page] / [page] marker. */
function corpusPrompt(pages: readonly PageRef[], multiDoc: boolean): string {
  const body = pages
    .map((p) => `[${multiDoc ? `doc ${p.doc} · ` : ''}page ${p.page}]\n${p.text}`)
    .join('\n\n');
  return `DOCUMENT TEXT (cite "doc"/"page" by these markers):\n${body}`;
}

const ASK_SYSTEM =
  'You answer a question strictly from the document text provided, quoting verbatim, and return strict ' +
  'JSON only. You never use outside knowledge and never invent a quote, page, or fact — when the ' +
  'document does not address the question you say so plainly.';

function askPrompt(question: string, pages: readonly PageRef[], multiDoc: boolean): string {
  return `${corpusPrompt(pages, multiDoc)}

QUESTION: ${question}

Return ONLY a JSON object (no prose, no fences):
{
  "answer": "a direct, concise answer (1-3 sentences) drawn STRICTLY from the document text above",
  "coverage": "full|partial|none",
  "spans": [ { ${multiDoc ? '"doc": 0, ' : ''}"page": 3, "quote": "the exact sentence(s) from that page that support the answer, copied VERBATIM" } ]
}

Rules:
- Use ONLY the document text above. Do NOT use outside knowledge.
- Every "quote" MUST be copied character-for-character from the page it sits on (it is verified against
  the real page text — anything not found verbatim is dropped, so copy exactly: no paraphrase, no "[...]").
- ${multiDoc ? '"doc" and "page" identify where the quote is (from the [doc · page] markers).' : '"page" is the page the quote is on (from the [page] markers).'}
- "coverage": "full" if the document fully answers the question; "partial" if it answers only part;
  "none" if the document does not address it at all.
- If the document does NOT address the question, set "coverage":"none", give a brief honest answer
  ("the document doesn't cover this"), and return "spans": [].`;
}

/** Pull the first balanced top-level JSON object out of a possibly-noisy model response. */
function extractJsonObject(raw: string | object): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw);
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
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
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asCoverage(v: unknown): AskCoverage {
  const c = String(v ?? '')
    .toLowerCase()
    .trim();
  return c === 'full' || c === 'partial' || c === 'none' ? c : 'partial';
}

/**
 * Verify each proposed span against the real corpus and keep only the grounded ones. A span quotes a
 * sentence the model claims is on a page; groundedPageOf re-finds where that quote VERBATIM lives in
 * that document (tolerating a page-number drift, dropping it entirely if it appears nowhere). The doc
 * index is clamped into range. De-duplicated by (doc, page, quote); capped. Pure + deterministic.
 */
export function groundSpans(raw: unknown, corpus: AskContext['corpus']): AnswerSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: AnswerSpan[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const quote = asString(r.quote).trim();
    if (!quote) continue;
    const docRaw = Number(r.doc);
    const doc = Number.isInteger(docRaw) && docRaw >= 0 && docRaw < corpus.length ? docRaw : 0;
    const pages = corpus[doc];
    if (!pages || pages.length === 0) continue;
    const claimedPage = Number.isInteger(Number(r.page)) ? Number(r.page) : undefined;
    const page = groundedPageOf(quote, pages, claimedPage);
    if (page === 0) continue; // not verbatim anywhere in this document → drop (never show)
    const key = `${doc}:${page}:${quote.replace(/\s+/g, ' ').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ doc, page, quote });
    if (out.length >= MAX_SPANS) break;
  }
  return out;
}

/**
 * Find the LONGEST contiguous word-run of `quote` that appears verbatim on some page (word-aligned,
 * ≥ `minLen` chars). A smaller model often paraphrases a word or two of its cited sentence; the whole
 * quote then fails the strict gate even though most of it is real text. This rescues the anchor by
 * highlighting the largest genuinely-verbatim sub-span — so the highlight stays honest (real page text),
 * just a subset of what the model claimed. Pure. Longest windows are tried first.
 */
function longestVerbatimRun(
  quote: string,
  pages: readonly string[],
  minLen = 24,
): { page: number; run: string } | null {
  const words = quote.split(/\s+/).filter(Boolean);
  for (let len = words.length; len >= 1; len -= 1) {
    for (let start = 0; start + len <= words.length; start += 1) {
      const run = words.slice(start, start + len).join(' ');
      if (run.length < minLen) continue;
      const page = groundedPageOf(run, pages);
      if (page > 0) return { page, run };
    }
  }
  return null;
}

/**
 * Lenient span recovery: for each span the model proposed, keep the longest verbatim run of its quote
 * on the document it names (clamped). Used only when strict grounding found nothing yet the model
 * clearly answered — so a correct answer is anchored to real text instead of being thrown away. Every
 * recovered span is still verbatim on its page; nothing is invented. De-duplicated; capped.
 */
export function recoverSpans(raw: unknown, corpus: AskContext['corpus']): AnswerSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: AnswerSpan[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const quote = asString(r.quote).trim();
    if (!quote) continue;
    const docRaw = Number(r.doc);
    const doc = Number.isInteger(docRaw) && docRaw >= 0 && docRaw < corpus.length ? docRaw : 0;
    const pages = corpus[doc];
    if (!pages || pages.length === 0) continue;
    const found = longestVerbatimRun(quote, pages);
    if (!found) continue;
    const key = `${doc}:${found.page}:${found.run.replace(/\s+/g, ' ').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ doc, page: found.page, quote: found.run });
    if (out.length >= MAX_SPANS) break;
  }
  return out;
}

/** Resolve the search backend, mirroring veracity: a keyed provider with no key falls back to free
 *  Wikipedia, so reaching outside never silently fails to authenticate. */
function resolveProvider(id: SearchProviderId | undefined, apiKey: string | undefined) {
  const p = getSearchProvider(id);
  return p.needsKey && !apiKey ? getSearchProvider('wikipedia') : p;
}

const OUTSIDE_SYSTEM =
  'You answer a question using ONLY the web-search snippets given to you, copy one citation verbatim, ' +
  'and return strict JSON. You never invent a source, URL, or quote; if the snippets do not answer the ' +
  'question you return an empty fact.';

function outsidePrompt(question: string, evidence: readonly Evidence[]): string {
  const lines = evidence.map((e) => `  - "${e.title}": ${e.snippet} (${e.url})`).join('\n');
  return `The document being read does NOT cover this question. Using ONLY the web-search snippets below
(that is all you have — no full pages), answer it.

QUESTION: ${question}

SOURCES:
${lines}

Return ONLY JSON (no prose):
{ "fact": "a one-sentence answer from the sources", "citationQuote": "copied VERBATIM from ONE snippet above", "citationUrl": "that snippet's URL, copied exactly" }

Rules:
- Use ONLY the snippets above. Never invent a source, URL, or quote.
- "citationQuote" MUST be word-for-word from one snippet's text, and "citationUrl" MUST be that snippet's URL.
- If the snippets do not actually answer the question, return { "fact": "", "citationQuote": "", "citationUrl": "" }.`;
}

/** Reach outside the document for a single, citation-gated fact. Returns undefined unless the search
 *  found something AND the model's citation survived the verify gate (verbatim in a real snippet). */
async function reachOutside(question: string, ctx: AskContext): Promise<OutsideFact | undefined> {
  if (!ctx.search?.enabled) return undefined;
  const provider = resolveProvider(ctx.search.providerId, ctx.search.apiKey);
  let results;
  try {
    results = await provider.search(searchQuery(question), {
      apiKey: ctx.search.apiKey,
      limit: 5,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
  } catch {
    return undefined; // search never throws, but never let a stray rejection escape
  }
  if (results.length === 0) return undefined;
  const evidence: Evidence[] = results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
  }));

  let raw: string | object;
  try {
    const res = await getAdapter(ctx.cfg.provider).generate(
      {
        system: OUTSIDE_SYSTEM,
        history: [],
        user: outsidePrompt(question, evidence),
        maxTokens: 500,
        temperature: 0,
        format: null,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      ctx.cfg,
    );
    raw = res.raw;
  } catch {
    return undefined;
  }

  const obj = extractJsonObject(raw);
  const fact = asString(obj?.fact).trim();
  if (!fact) return undefined;
  const citation = gateCitation(
    { citationQuote: asString(obj?.citationQuote), citationUrl: asString(obj?.citationUrl) },
    evidence,
  );
  if (!citation) return undefined; // a fact we can't cite to a real snippet is not shown
  return { fact, citation };
}

/**
 * Answer one question of the exploded document(s). The document is answered first (one grounded call);
 * if it doesn't fully cover the question and web search is on, one outside fact is fetched and gated.
 * Never throws — a model/network failure surfaces as an honest empty answer, never a fabrication.
 */
export async function askDocument(question: string, ctx: AskContext): Promise<AskAnswer> {
  const q = question.trim();
  if (!q) return { text: '', spans: [], coverage: 'none' };

  const pages = selectPages(ctx.corpus, q);
  let modelAnswer = '';
  let modelCoverage: AskCoverage = 'none';
  let spans: AnswerSpan[] = [];
  let rawSpans: unknown = null;

  if (pages.length > 0) {
    try {
      const res = await getAdapter(ctx.cfg.provider).generate(
        {
          system: ASK_SYSTEM,
          history: [],
          user: askPrompt(q, pages, ctx.multiDoc),
          // Up to MAX_SPANS (8) verbatim anchors, and "sentence(s)" means a span can run past one
          // sentence — a well-covered question with several substantive spans could crowd the old 900,
          // truncating the JSON and losing the answer AND every span, not just the last one.
          maxTokens: 1400,
          temperature: 0,
          format: null,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        },
        ctx.cfg,
      );
      const obj = extractJsonObject(res.raw);
      modelAnswer = asString(obj?.answer).trim();
      modelCoverage = asCoverage(obj?.coverage);
      rawSpans = obj?.spans ?? null;
      spans = groundSpans(rawSpans, ctx.corpus);
    } catch {
      // doc call failed — fall through to the outside path (honest, never fabricated)
    }
  }

  // The document's verdict follows the GROUNDED evidence, not the model's say-so. But when strict
  // grounding pinned nothing WHILE the model clearly answered from the retrieved pages, first recover
  // the longest verbatim run of its quote — a small model routinely paraphrases a word or two, and the
  // old code then mislabelled a correct answer "not in the document". If even that fails, we STILL do
  // not claim the document is silent (it isn't): we keep the answer and flag it `unpinned`, so the panel
  // shows an honest "found it, couldn't highlight the exact line" — never a false absence.
  let unpinned = false;
  if (
    spans.length === 0 &&
    modelAnswer &&
    (modelCoverage === 'full' || modelCoverage === 'partial')
  ) {
    spans = recoverSpans(rawSpans, ctx.corpus);
    if (spans.length === 0) unpinned = true;
  }

  let coverage: AskCoverage;
  let text: string;
  if (spans.length > 0) {
    coverage = modelCoverage === 'none' ? 'partial' : modelCoverage;
    text = modelAnswer;
  } else if (unpinned) {
    // Answered from the document, but no line could be verified verbatim — honest, not absent.
    coverage = modelCoverage;
    text = modelAnswer;
  } else {
    coverage = 'none';
    text = '';
  }

  const outside = coverage === 'full' ? undefined : await reachOutside(q, ctx);

  // A doc-grounded line that turned out to also need the world stays "partial"; pure-outside stays "none".
  if (!text && !outside) text = "I couldn't find this addressed in the document.";
  return {
    text,
    spans,
    coverage,
    ...(unpinned ? { unpinned } : {}),
    ...(outside ? { outside } : {}),
  };
}
