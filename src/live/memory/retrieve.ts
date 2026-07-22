// retrieve.ts — choose the ORDER in which memory cards are considered for injection on THIS turn.
// Query-conditioned ranking by a composite score, all pure local math (no embeddings, no model, no
// network) so it runs in microseconds on the weakest hardware and adds nothing to the answer cost:
//
//   score = relevance × recency × importance
//
//   relevance  — lexical overlap of the question with the card (keyword, BM25-lite), plus a small
//                floor so a fresh background fact still surfaces even with no word overlap;
//   recency    — exponential decay whose half-life lengthens with reinforcement (Ebbinghaus: a
//                fact the user keeps restating fades slower);
//   importance — trust tier (a grounded fact outweighs a guess) lifted slightly by reinforcement.
//
// Retrieval is READ-ONLY: it never writes the store, so generating an answer costs no storage I/O.
// Trust framing (fact vs "unconfirmed") and the char budget are applied by buildMemoryContext.
import type { MemoryNode } from './store';
import { isFactSource } from './store';
import { overlap, tokenSet } from './text';

const DAY = 86_400_000;
/** Base half-life: a fact loses half its recency weight after ~2 months of no restatement. */
const HALF_LIFE_DAYS = 60;
/** Each reinforcement (a restatement) extends the half-life, so well-worn facts persist. */
const REINFORCE_BONUS_DAYS = 20;
/** Relevance floor so a recent, grounded fact with no lexical overlap still has a voice. */
const RELEVANCE_FLOOR = 0.15;

function recencyWeight(node: MemoryNode, now: number): number {
  const ageDays = Math.max(0, (now - node.updatedAt) / DAY);
  const halfLife = HALF_LIFE_DAYS + (node.uses ?? 0) * REINFORCE_BONUS_DAYS;
  return Math.pow(0.5, ageDays / halfLife);
}

function importanceWeight(node: MemoryNode): number {
  const base = isFactSource(node.source) ? 1 : 0.5; // a grounded fact outweighs a guess
  const reinforced = 1 + Math.min(node.uses ?? 0, 5) * 0.1; // capped so it can't dominate
  return base * reinforced;
}

/** Composite relevance×recency×importance score of one card against the tokenised question. */
export function scoreNode(node: MemoryNode, queryTokens: Set<string>, now: number): number {
  const rel = overlap(queryTokens, tokenSet(`${node.concept} ${node.body}`));
  const relevance = RELEVANCE_FLOOR + (1 - RELEVANCE_FLOOR) * rel;
  return relevance * recencyWeight(node, now) * importanceWeight(node);
}

/**
 * Order memory cards for injection on this turn, most useful first. The result is fed to
 * buildMemoryContext, which keeps grounded facts ahead of unconfirmed guesses and trims to the
 * char budget — so a relevant correction or stated fact wins a scarce slot over a stale guess.
 */
export function rankForInjection(
  nodes: readonly MemoryNode[],
  userText: string,
  now = Date.now(),
): MemoryNode[] {
  const q = tokenSet(userText);
  return [...nodes].sort((a, b) => scoreNode(b, q, now) - scoreNode(a, q, now));
}

/** Concrete hints a learned lesson contributes to the answer loop. */
export interface ProceduralHints {
  /** Block types to favour / damp in the weighted draw (from ink corrections / stated form). */
  prefer: string[];
  avoid: string[];
  /** A learned answer depth for this kind of ask. */
  depth?: 'tight' | 'standard' | 'deep';
  /** The user corrected a figure like this before → double-check numbers. */
  verify: boolean;
}

const DEPTH_WORDS: [RegExp, 'tight' | 'standard' | 'deep'][] = [
  [/\b(brief|short|concise|quick|tl;?dr|one-?liner|just the|bullets?)\b/i, 'tight'],
  [/\b(deep|detailed|thorough|in-?depth|comprehensive|exhaustive)\b/i, 'deep'],
];

function parseDepth(body: string): 'tight' | 'standard' | 'deep' | undefined {
  for (const [re, d] of DEPTH_WORDS) if (re.test(body)) return d;
  return undefined;
}

// Map a stated FORMAT preference (free text the model wrote) to the block types it implies. Only
// well-known format words map; an unrecognised preference adds nothing (safe). Advisory — these
// boost the weighted draw, never pin, so a mismatched format request can't force a wrong block.
const FORM_TYPES: [RegExp, string[]][] = [
  [/\b(tables?|tabular|spreadsheets?|grids?)\b/i, ['compare', 'datatable']],
  [/\b(bullets?|bulleted|lists?|checklists?)\b/i, ['list']],
  [/\b(timelines?|chronolog)/i, ['timeline']],
  [/\b(bars?|ranking|ranked)\b/i, ['bars']],
  [/\b(charts?|graphs?|plots?|trend lines?)\b/i, ['chart']],
  [/\b(compar|versus|pros and cons|trade-?offs?)/i, ['compare']],
  [/\b(breakdowns?|split|composition|pie|donut)\b/i, ['breakdown', 'donut']],
];

function formToBlockTypes(body: string): string[] {
  const out = new Set<string>();
  for (const [re, types] of FORM_TYPES) if (re.test(body)) for (const t of types) out.add(t);
  return [...out];
}

/**
 * Read the procedural lessons that apply to THIS turn into concrete answer-loop hints. A stated
 * preference (`preferences.*`) always applies; a correction applies when its subject bears on the
 * question. Only lessons the USER grounded (or with a positive track record) may steer component
 * choice — a low-confidence inference never does. The depth/verify hints are low-risk (prompt-only)
 * and are read whenever present.
 */
export function proceduralHints(nodes: readonly MemoryNode[], userText: string): ProceduralHints {
  const q = tokenSet(userText);
  const prefer = new Set<string>();
  const avoid = new Set<string>();
  let depth: 'tight' | 'standard' | 'deep' | undefined;
  let verify = false;

  for (const n of nodes) {
    const isPref = n.concept === 'preferences' || n.concept.startsWith('preferences.');
    const isProc = n.kind === 'procedural';
    if (!isPref && !isProc) continue;
    // Global preferences always apply; a correction applies when its subject/body bears on the ask.
    const relevant = isPref || overlap(q, tokenSet(`${n.concept} ${n.body}`)) > 0;
    if (!relevant) continue;

    // Steering component choice is provenance-gated: ONLY a user-grounded lesson (corrections, ink,
    // a stated form — all fact-source) may bias the draw, and fact-source short-circuits so a
    // correction never loses its steering as it accrues losses. A fresh MODEL-inferred guess gets
    // NO standing to steer — it must first earn a positive track record (>0 wins). We don't credit
    // noisy "wins" today, so inferred steering stays dormant by design. verify/depth are prompt-only
    // (low risk) and always read.
    const wins = n.wins ?? 0;
    const losses = n.losses ?? 0;
    const trusted = isFactSource(n.source) || (wins > 0 && wins / (wins + losses) >= 0.5);
    if (trusted) {
      for (const t of n.prefer ?? []) prefer.add(t);
      for (const t of n.avoid ?? []) avoid.add(t);
      // A stated FORMAT preference ("prefers tables") is free text the model wrote — map it to the
      // concrete block types it implies so it actually steers the draw, not just the prompt.
      if (n.concept.startsWith('preferences.form'))
        for (const t of formToBlockTypes(n.body)) prefer.add(t);
    }
    if (n.verify) verify = true;
    const d =
      n.depth ?? (n.concept.startsWith('preferences.depth') ? parseDepth(n.body) : undefined);
    if (d) depth = d;
  }

  return { prefer: [...prefer], avoid: [...avoid], depth, verify };
}

/** The PERSONAL FIT prompt line derived from learned hints — a depth the user tends to prefer and
 *  whether to double-check figures they've corrected before. Shared by the live turn (generateLive)
 *  AND the eval (runMemory) so the eval can never measure a stale prompt. Empty when there is no
 *  learned signal — advisory, never invented. */
export function personalFitLine(hints: ProceduralHints): string {
  if (!hints.depth && !hints.verify) return '';
  const parts = [
    hints.depth
      ? `this user tends to prefer ${
          hints.depth === 'tight'
            ? 'brief, tightly-scoped'
            : hints.depth === 'deep'
              ? 'deep, detailed'
              : 'standard-depth'
        } answers`
      : '',
    hints.verify
      ? 'they have corrected figures like this before, so double-check any numbers before stating them'
      : '',
  ].filter(Boolean);
  return `PERSONAL FIT — ${parts.join('; ')}.`;
}
