// ask/repoAsk.ts — "ask anything about this repo/PR; it answers by grounding." Ported from Prism's
// Ask It (src/live/prism/ask/ask.ts): the same one-call retrieval-then-ground shape, aimed at a
// repository instead of a document. The corpus is everything Ripple already holds in memory — the
// ShipModel's own facts, the curriculum, cached lesson bodies, the retained diff text — plus, when a
// repo is connected, up to a few more files picked by free local keyword retrieval over the file
// tree and fetched through the read-only gateway. ONE model call answers; every citation is then
// verbatim-gated against the real file text or the diff — a citation that can't be verified is kept
// but labeled `unpinned`, never silently trusted and never silently dropped.
import { getAdapter } from '../../providers';
import type { ModelConfig } from '../../../types/mavea';
import { isVerbatimOnPage } from '../../ground/verbatim';
import { parseLooseJson } from '../../ground/json';
import { fetchFileContents } from '../ingest/githubBrowser';
import type { Altitude, LessonDetail, ShipModel } from '../model';
import type { AskCoverage, RepoAskAnswer, RepoCitation } from './types';

/** At most this many NEW files are fetched per question — retrieval stays cheap even on a huge repo. */
const MAX_RETRIEVED_FILES = 3;
/** Each fetched file is trimmed to this many characters before it enters the prompt. */
const FILE_CHARS = 3000;
/** The retained diff is trimmed to this many characters — plenty for the model, bounded for cost. */
const DIFF_CHARS = 6000;
/** Defensive caps so a very large repo's facts can't blow the prompt up on their own. */
const MAX_CHANGES = 40;
const MAX_NODES = 40;
const MAX_MODULES = 30;
const MAX_RISKS = 12;
/** Never show more citations than the eye can follow — the strongest few carry the answer. */
const MAX_CITATIONS = 6;

/** Everything a repo ask needs. `fileCache` is owned by the caller (typically the thread hook) and
 *  mutated in place as retrieval fetches new files, so re-asking about a file already seen this
 *  session never re-fetches it. */
export interface RepoAskContext {
  model: ShipModel;
  cfg: ModelConfig;
  altitude: Altitude;
  /** The raw diff text Ripple is holding, verbatim — both extra context and a citation source. */
  diffText?: string;
  /** owner/repo, so retrieval can reach the read-only gateway. Undefined → retrieval stays off,
   *  the corpus is just the in-memory facts + diff (a worked example, or a diff-only session). */
  repo?: string;
  gitRef?: string;
  /** The full file tree from the repo explore, for local keyword ranking. Empty/undefined → no
   *  candidates to retrieve from. */
  treePaths?: readonly string[];
  /** Deep lesson bodies already written this session (course title + lesson title, joined by
   *  `lessonKey`), so an already-generated lesson becomes free context instead of a re-fetch. */
  lessonDetails?: ReadonlyMap<string, LessonDetail>;
  /** Session-scoped cache of already-fetched file contents, keyed by path. Read AND written here. */
  fileCache: Map<string, string>;
  signal?: AbortSignal;
}

/** The key `lessonDetails` is indexed by — whoever populates the cache (the overlay wrapping its
 *  `loadLessonDetail`) must use the same key so a written lesson shows up in the corpus. */
export function lessonKey(courseTitle: string, lessonTitle: string): string {
  return `${courseTitle}::${lessonTitle}`;
}

/**
 * Rank a repo's file tree by keyword overlap with the question — the same free, local retrieval
 * technique Prism's Ask It uses (selectPages), applied to PATHS rather than extracted text, since
 * none of these files have been fetched yet. A path scores by how many of the question's meaningful
 * words (≥4 chars) it contains, case-insensitively, anywhere in the string; ties keep the tree's own
 * order (shallower/likelier files first). Returns [] when nothing matches — a vague question doesn't
 * grab arbitrary files out of a large repo. Pure, deterministic.
 */
export function rankRepoFiles(
  treePaths: readonly string[],
  question: string,
  exclude: ReadonlySet<string> = new Set(),
  max = MAX_RETRIEVED_FILES,
): string[] {
  const terms = Array.from(new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []));
  if (terms.length === 0) return [];
  const scored = treePaths
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !exclude.has(p))
    .map(({ p, i }) => {
      const hay = p.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { p, i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, max).map((x) => x.p);
}

/** Fetch the ranked, not-yet-cached files and merge them into `ctx.fileCache`. Best-effort: a failed
 *  fetch just leaves that path out of the cache — never throws, never blocks the rest of the ask. */
async function retrieveFiles(ctx: RepoAskContext, question: string): Promise<void> {
  if (!ctx.repo || !ctx.treePaths?.length) return;
  const picks = rankRepoFiles(ctx.treePaths, question, new Set(ctx.fileCache.keys()));
  if (picks.length === 0) return;
  const results = await Promise.all(
    picks.map((path) =>
      fetchFileContents(path, ctx.gitRef, ctx.repo).catch(() => ({ ok: false as const })),
    ),
  );
  if (ctx.signal?.aborted) return;
  results.forEach((r, i) => {
    if (r.ok && r.content) ctx.fileCache.set(picks[i]!, r.content.slice(0, FILE_CHARS));
  });
}

/** Render the ShipModel's own facts as prompt text — the PR summary/risks, each change's intent/why,
 *  each node's contract/problem/fix, each module's purpose/explain, and the curriculum (with any
 *  already-written lesson bodies folded in). Bounded per section so a very large repo can't blow the
 *  prompt up on its own. */
function factsBlock(model: ShipModel, lessonDetails?: ReadonlyMap<string, LessonDetail>): string {
  const parts: string[] = [];
  const pr = model.pr;
  parts.push(`REPO: ${pr.repo}${pr.title ? ` — ${pr.title}` : ''}`);
  if (pr.summary) parts.push(`SUMMARY: ${pr.summary}`);
  if (pr.risks.length) {
    parts.push(
      `RISKS:\n${pr.risks
        .slice(0, MAX_RISKS)
        .map((r) => `- [${r.level}] ${r.text}`)
        .join('\n')}`,
    );
  }
  if (model.changes.length) {
    parts.push(
      `CHANGES (${model.changes.length}):\n${model.changes
        .slice(0, MAX_CHANGES)
        .map((c) => `- ${c.file} [${c.kind}/${c.risk}]: ${c.intent}${c.why ? ` — ${c.why}` : ''}`)
        .join('\n')}`,
    );
  }
  if (model.nodes.length) {
    parts.push(
      `SYSTEM NODES (${model.nodes.length}):\n${model.nodes
        .slice(0, MAX_NODES)
        .map((n) => {
          const bits = [n.contract, n.problem, n.fix].filter(Boolean).join(' | ');
          return `- ${n.label}${n.sub ? ` (${n.sub})` : ''}${bits ? `: ${bits}` : ''}`;
        })
        .join('\n')}`,
    );
  }
  if (model.modules.length) {
    parts.push(
      `MODULES (${model.modules.length}):\n${model.modules
        .slice(0, MAX_MODULES)
        .map((m) => `- ${m.name}: ${[m.purpose, m.explain].filter(Boolean).join(' ')}`.trim())
        .join('\n')}`,
    );
  }
  if (model.courses?.length) {
    parts.push(
      `COURSES:\n${model.courses
        .map((c) => {
          const lessons = c.lessons
            .map((l) => {
              const cached = lessonDetails?.get(lessonKey(c.title, l.title));
              const extra = cached ? ` — ${cached.overview.slice(0, 240)}` : '';
              return `  · ${l.title}: ${l.goal}${extra}`;
            })
            .join('\n');
          return `- ${c.title}${c.subtitle ? ` — ${c.subtitle}` : ''}\n${lessons}`;
        })
        .join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

const ASK_SYSTEM =
  'You answer a question about a code repository / pull request strictly from the material given — ' +
  'the grounded facts, the diff, and any real file excerpts — quoting verbatim when you cite a file, ' +
  'and return strict JSON only. You never invent a file, quote, or fact; when the material does not ' +
  'address the question you say so plainly.';

/** How the answer's depth/jargon should adjust by altitude — injected into the prompt so the SAME
 *  question genuinely reads differently at each level, not just a cosmetic label. */
const ALTITUDE_GUIDANCE: Record<Altitude, string> = {
  newgrad:
    'Answer for someone brand-new to this codebase: spell out jargon, orient them, connect the dots explicitly. A little more length is fine if it teaches.',
  working:
    'Answer for an engineer with a few years of experience who knows the codebase’s shape but not this specific area: be direct, skip the basics, name the real mechanism.',
  principal:
    'Answer for a principal engineer: get straight to the crux and the tradeoffs. Skip orientation entirely.',
};

function askPrompt(
  question: string,
  altitude: Altitude,
  facts: string,
  diffText: string,
  files: ReadonlyMap<string, string>,
): string {
  const blocks = [`REPO FACTS:\n${facts || '(nothing gathered yet)'}`];
  if (diffText) blocks.push(`DIFF:\n${diffText.slice(0, DIFF_CHARS)}`);
  if (files.size > 0) {
    const body = Array.from(files.entries())
      .map(([f, text]) => `FILE ${f}:\n${text}`)
      .join('\n\n');
    blocks.push(`FILE EXCERPTS:\n${body}`);
  }
  return `${blocks.join('\n\n')}

${ALTITUDE_GUIDANCE[altitude]}

QUESTION: ${question}

Return ONLY a JSON object (no prose, no fences):
{
  "answer": "a direct answer drawn STRICTLY from the material above, at the depth the guidance above asks for",
  "coverage": "full|partial|none",
  "citations": [ { "file": "the real path this came from", "quote": "the exact text copied VERBATIM from that file's excerpt or the diff" } ]
}

Rules:
- Use ONLY the material above. Never invent a file, fact, or quote.
- Every "quote" MUST be copied character-for-character from the named file's excerpt or the diff (it
  is verified before it can show as grounded — anything not found verbatim is still shown, but
  labeled honestly rather than presented as a real quote).
- "coverage": "full" if the material fully answers the question; "partial" if only part of it does;
  "none" if the material doesn't address it at all.
- If nothing above addresses the question, set "coverage":"none", give a brief honest answer saying
  so, and return "citations": [].`;
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
 * Gate every proposed citation: a quote that appears verbatim (after the same normalize-and-match
 * Prism's document gate uses) in the named file's fetched text OR the diff is kept as grounded; one
 * that doesn't is STILL kept, but flagged `unpinned` — an honest "couldn't verify this" rather than
 * either silently trusting an invented quote or silently discarding a real answer. De-duplicated by
 * (file, quote); capped. Pure, deterministic.
 */
export function gateCitations(
  raw: unknown,
  files: ReadonlyMap<string, string>,
  diffText: string,
): RepoCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: RepoCitation[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const file = asString(r.file).trim();
    const quote = asString(r.quote).trim();
    if (!quote) continue;
    const key = `${file}:${quote.replace(/\s+/g, ' ').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fileText = file ? files.get(file) : undefined;
    const grounded =
      (!!fileText && isVerbatimOnPage(quote, fileText)) ||
      (!!diffText && isVerbatimOnPage(quote, diffText));
    out.push(grounded ? { file, quote } : { file, quote, unpinned: true });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

/**
 * Answer one question about the repo/PR Ripple is showing. Retrieval fetches a few more files first
 * (best-effort, skipped when there's no connected repo); one model call answers from everything
 * gathered; every citation is then gated. Never throws — a model/network failure surfaces as an
 * honest empty answer, never a fabrication.
 */
export async function askRepo(question: string, ctx: RepoAskContext): Promise<RepoAskAnswer> {
  const q = question.trim();
  if (!q) return { text: '', coverage: 'none', citations: [] };

  await retrieveFiles(ctx, q).catch(() => undefined);
  if (ctx.signal?.aborted) return { text: '', coverage: 'none', citations: [] };

  const facts = factsBlock(ctx.model, ctx.lessonDetails);
  const diffText = ctx.diffText ?? '';

  let raw: string | object;
  try {
    const res = await getAdapter(ctx.cfg.provider).generate(
      {
        system: ASK_SYSTEM,
        history: [],
        user: askPrompt(q, ctx.altitude, facts, diffText, ctx.fileCache),
        maxTokens: 1000,
        temperature: 0,
        format: null, // free-form JSON — parsed defensively below
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      ctx.cfg,
    );
    raw = res.raw;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { text: '', coverage: 'none', citations: [] };
    }
    return { text: 'Couldn’t reach the model just now.', coverage: 'none', citations: [] };
  }
  if (ctx.signal?.aborted) return { text: '', coverage: 'none', citations: [] };

  const obj = parseLooseJson(raw) as Record<string, unknown> | null;
  const answer = asString(obj?.answer).trim();
  const coverage = asCoverage(obj?.coverage);
  const citations = gateCitations(obj?.citations, ctx.fileCache, diffText);

  if (!answer) {
    return { text: 'I couldn’t find this addressed in the repo.', coverage: 'none', citations: [] };
  }
  return { text: answer, coverage, citations };
}
