// world/explode.ts — the ONE model call that builds a living world, and the second that EVOLVES it.
// Neither rides an ordinary turn: a turn only OFFERS a world (a card carrying the question), and
// the explode below runs when the reader opens it, so nobody is billed for a world they never see.
// why/explode.ts's shape throughout: a frozen implicit-cached system prompt, a tiny templated JSON
// schema (so the model emits OUR shape, not the canvas schema), thinking 'minimal', size gated by
// the measured speed tier, and the result GROUNDED by coerceWorldSpec against the same corpus — the
// model proposes, the corpus disposes. The world adds three things the why web has no room for: a
// per-node time series, a one-level breakdown into children, and stable slug ids the follow-up call
// echoes back, which is what lets a second turn land ON the standing world instead of replacing it.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers/index';
import { speedTierFor } from '../speed';
import { cacheGet, cachePut, rippleCacheKey } from '../ripple/cache';
import type { EvidenceCorpus } from '../ground/evidence';
import { coerceWorldSpec, mapOntoWorld, mappedFraction } from './validate';
import { WORLD_DOMAINS } from './types';
import type { WorldSpec } from './types';

const HONESTY = `HARD HONESTY RULES:
- A node "value", a series point, or an edge "weight" (a 0..1 share of the outcome it explains) may ONLY be given when you can quote it VERBATIM from SOURCES — put that exact sentence in "quote" and set "tier":"T2" (or "T1" if it came from the user's own attached data). The weights of the edges INTO the outcome should sum to ≤ 1.
- If a cause, link, or figure comes from general knowledge with NO source sentence, set "tier":"T0" and OMIT value/weight/series/quote. Never invent a number, a percentage, or a citation.
- If SOURCES carries no quotable sentence, this world is an ILLUSTRATIVE explanation from general knowledge. Say so with "provenance":{"illustrative":true}, and give a node a "value"/"unit" or a "series" ONLY where the figure is genuinely well known — textbook, round, the kind a specialist would recognise — and mark those "tier":"T3" with NO "quote". Never a citation, never a made-up precision, and never a "weight": how much of an outcome one link explains is a measurement, and there is nothing here to measure it.
- Every point of a "series" needs its OWN verbatim quote containing that point's digits. A series you cannot quote point-by-point must be omitted entirely, never smoothed or estimated.
- "sign" is 1 (reinforces) or -1 (dampens). "role" is "root" | "mechanism" | "outcome". "depth" grows from roots (0) to the outcome. Edges may only join TOP-LEVEL nodes — "children" are a breakdown of one node, never causal actors.
- Node "id" is a short stable slug of the label (lowercase, hyphens: "cheap-credit"), because a later turn has to be able to name the same node again.
- "date" is WHEN a cause happened, as a plain string: a year ("1986"), an ISO date ("1986-01-28"), or an ISO timestamp. Give one for every node you can place in time, even in an all-T0 world with no numbers anywhere, because it is what lets the reader lay the same causes out on a timeline. Omit it only when you would be guessing at the year. Where a source sentence states the date, make that the node's "quote" — a date the sources back is shown as established, and one only you know is shown as your own.
- "domain" is the sphere a node belongs to, one of: economy | policy | technology | science | environment | society | health | conflict. It is a description, not a claim, so it needs no source — but OMIT it when no single sphere fits, and never stretch one to cover a node.`;

const SHAPE = `Shape: {"title":"the question, verbatim","outcomeId":"<id of the outcome node>","nodes":[{"id":"","label":"","role":"","depth":0,"domain":"","date":"1986-01-28","tier":"T0","value":0,"unit":"","quote":"","detail":"","series":{"tier":"T0","unit":"","points":[{"t":"2008","value":0,"quote":""}]},"children":[{"id":"","label":"","tier":"T0"}]}],"edges":[{"from":"","to":"","verb":"","weight":0,"sign":1,"tier":"T0","quote":"","relation":""}],"provenance":{"illustrative":false}}`;

const WORLD_SYSTEM = `You are Mavéa's causal world-builder. Given a causal question and SOURCES, build the web that explains it: root causes → mechanisms → the outcome, each node carrying whatever the sources actually prove about it. Return ONLY compact JSON, no prose.

${HONESTY}
${SHAPE}`;

const EVOLVE_SYSTEM = `You are Mavéa's causal world-builder, EXTENDING a world that already exists. The user asked a follow-up about the SAME web. Return ONLY compact JSON, no prose.

ECHO THE IDS: every node you re-describe MUST reuse its EXISTING id, verbatim, from the roster you are given — that is the only way your answer lands on the world the user is looking at. Only a genuinely new cause gets a new slug id. Re-state "title" exactly as given.
A DELTA, NOT A WORLD: return ONLY the nodes the follow-up actually touches, and only the edges you are adding — every node you leave out keeps exactly what it already has. Re-listing the unchanged web wastes the reader's money and risks overwriting facts that are already proven.
Answer the follow-up by ENRICHING the nodes it is about (add a "series", a "children" breakdown, a "detail" sentence, a missing edge) — do not rebuild the web from scratch and do not rename anything.

${HONESTY}
${SHAPE}`;

const RECEIPT_ITEM = {
  type: 'object',
  properties: {
    quote: { type: 'string' },
    url: { type: 'string' },
    host: { type: 'string' },
    date: { type: 'string' },
  },
  required: ['quote'],
};
const SERIES_POINT_ITEM = {
  type: 'object',
  properties: {
    t: { type: 'string' },
    value: { type: 'number' },
    quote: { type: 'string' },
  },
  required: ['t', 'value'],
};
const SERIES_ITEM = {
  type: 'object',
  properties: {
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    unit: { type: 'string' },
    quote: { type: 'string' },
    points: { type: 'array', items: SERIES_POINT_ITEM },
  },
  required: ['tier', 'points'],
};
const CHILD_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    domain: { type: 'string', enum: [...WORLD_DOMAINS] },
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    value: { type: 'number' },
    unit: { type: 'string' },
    quote: { type: 'string' },
  },
  required: ['id', 'label'],
};
const NODE_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    role: { type: 'string', enum: ['root', 'mechanism', 'outcome'] },
    depth: { type: 'number' },
    domain: { type: 'string', enum: [...WORLD_DOMAINS] },
    // A plain string, not the {t, until} object the contract also accepts: asked for as a nested
    // object, models simply never emitted one (verified against a live turn — every node came back
    // with a domain and not one with a date). coerceDate takes either form, so the gate loses
    // nothing and the model is asked for the shape it actually writes.
    date: { type: 'string' },
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    value: { type: 'number' },
    unit: { type: 'string' },
    quote: { type: 'string' },
    detail: { type: 'string' },
    series: SERIES_ITEM,
    children: { type: 'array', items: CHILD_ITEM },
  },
  required: ['id', 'label', 'role'],
};
const EDGE_ITEM = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    verb: { type: 'string' },
    weight: { type: 'number' },
    sign: { type: 'number' },
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    quote: { type: 'string' },
    relation: { type: 'string' },
    receipts: { type: 'array', items: RECEIPT_ITEM },
    counter: RECEIPT_ITEM,
  },
  required: ['from', 'to', 'sign'],
};
const WORLD_FORMAT = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    outcomeId: { type: 'string' },
    nodes: { type: 'array', minItems: 2, items: NODE_ITEM },
    edges: { type: 'array', items: EDGE_ITEM },
    provenance: { type: 'object', properties: { illustrative: { type: 'boolean' } } },
  },
  required: ['title', 'nodes', 'edges'],
};

/** How much of a world this model is asked for, and the token ceiling that fits it. `nodeCap` is
 *  the real size control; the budget is DERIVED from it (~300 tok/node — a grounded world node
 *  carries its quote, an optional receipted series and up to CHILD_CAP children, so it costs
 *  roughly double a bare why node) so a full world never truncates mid-JSON, which would lose the
 *  whole structure AND leave nothing cached, making a retry re-pay. Caps stay under validate's
 *  NODE_CAP of 16 — asking for more than the gate keeps is spending tokens on dropped nodes. */
/** What a node costs to write, by whether its figures need receipts.
 *
 *  A GROUNDED node carries its quote, an optional receipted series and up to CHILD_CAP children, so
 *  it runs roughly double a bare why node — and `QUOTE_MAX` is 240 characters, so a node with a
 *  value quote plus a four-point series is carrying five quotes. The quotes ARE the budget.
 *
 *  An illustrative node carries none of them: same fields, same detail, no verbatim sentences. It
 *  cannot cost what a five-quote node costs, and this is the whole reason a sourceless world can be
 *  bigger for the same money rather than more expensive. */
const TOKENS_PER_GROUNDED_NODE = 300;
const TOKENS_PER_ILLUSTRATIVE_NODE = 140;

/** How much of a world this model is asked for, and the token ceiling that fits it.
 *
 *  `nodeCap` is the real size control; the budget is DERIVED from it so a full world never truncates
 *  mid-JSON, which would lose the whole structure AND leave nothing cached, making a retry re-pay.
 *  Caps stay under validate's NODE_CAP of 16 — asking for more than the gate keeps is spending
 *  tokens on dropped nodes — and never above 12, which is the size the layouts are art-directed for.
 *
 *  Where nothing can be quoted, the CEILING is held and the cap is raised to fill it instead. A slow
 *  tier went from five nodes to ten inside the same 1,900 tokens, which is the difference between
 *  three cards in a row and something worth opening. Nobody pays more; the words that used to go on
 *  fabricated citations go on causes. */
function budgetFor(model: string, quotable: boolean): { maxTokens: number; nodeCap: number } {
  const capByTier: Record<string, number> = { slow: 5, standard: 8 }; // 'fast' → the 12 default
  const grounded = capByTier[speedTierFor(model)] ?? 12;
  const ceiling = 400 + grounded * TOKENS_PER_GROUNDED_NODE;
  if (quotable) return { maxTokens: ceiling, nodeCap: grounded };
  const nodeCap = Math.min(12, Math.floor((ceiling - 400) / TOKENS_PER_ILLUSTRATIVE_NODE));
  return { maxTokens: ceiling, nodeCap: Math.max(grounded, nodeCap) };
}

const SOURCES_EMPTY =
  '(none — build this from general knowledge, as an ILLUSTRATIVE world: set provenance.illustrative, and give a figure only where it is genuinely well known, at "tier":"T3" with no quote)';

function sourcesBlock(corpus: EvidenceCorpus): string {
  return corpus.text.trim() ? corpus.text.trim().slice(0, 6000) : SOURCES_EMPTY;
}

/** The closing instruction, branched on whether anything in SOURCES can actually be quoted.
 *
 *  The distinction is not empty-versus-not. A model's native grounding returns a bare URL and a
 *  title, so the corpus arrives NON-empty — a list of headlines — and every figure proposed against
 *  it fails the verbatim gate. Asking for quotes there spends output tokens on citations the gate
 *  then deletes, and leaves the reader a shape with the numbers silently removed. Where nothing can
 *  be quoted, the honest register is illustrative: well-known figures, marked as such, behind the
 *  banner the surface already draws.
 *
 *  It lives in the USER message, which is per-call anyway — the system prompt is implicitly cached
 *  and branching it would create a second entry. (Its honesty rules did have to change once, to
 *  admit the illustrative register at all.) */
function closingAsk(corpus: EvidenceCorpus, nodeCap: number): string {
  const figures = corpus.quotable
    ? 'Quote SOURCES verbatim for any number, series point or weight; otherwise T0 with no numbers.'
    : 'Nothing here can be quoted, so this is an ILLUSTRATIVE world: set "provenance":{"illustrative":true}, and give a "value" or a "series" only where the figure is genuinely well known, at "tier":"T3" with no quote. No weights.';
  return `Build the causal world (${nodeCap} nodes max). ${figures} DATE every cause you can place in time — a year is enough, and this is not a number needing a source. Give every cause a "domain" from the list where one sphere really fits, a "relation" on every edge, and a one-line "detail" saying what it did. Reply as compact JSON on one line.`;
}

function explodeMessage(question: string, corpus: EvidenceCorpus, nodeCap: number): string {
  return `QUESTION: ${question.trim()}

SOURCES:
${sourcesBlock(corpus)}

${closingAsk(corpus, nodeCap)}`;
}

/** The roster the follow-up call has to echo: every top-level node's id and label, so the model
 *  can name the standing world's nodes instead of inventing parallel ones. */
function rosterOf(prior: WorldSpec): string {
  return prior.nodes.map((n) => `${n.id} = ${n.label}`).join('\n');
}

function evolveMessage(
  prior: WorldSpec,
  ask: string,
  corpus: EvidenceCorpus,
  nodeCap: number,
): string {
  return `TITLE (re-state verbatim): ${prior.title}

EXISTING NODES — reuse these ids exactly:
${rosterOf(prior)}

FOLLOW-UP: ${ask.trim()}

SOURCES:
${sourcesBlock(corpus)}

Answer the follow-up on THIS world with a DELTA — only the nodes it changes (${nodeCap} nodes max, existing ids echoed), never the whole web again. Quote SOURCES verbatim for any number, series point or weight; otherwise T0 with no numbers. DATE every cause you can place in time — a year is enough, and this is not a number needing a source. Reply as compact JSON on one line.`;
}

/** One format-constrained call, coerced against the corpus. Null on any failure — a world is
 *  always optional garnish on a turn, never the turn itself. */
async function callWorld(
  system: string,
  user: string,
  cfg: ModelConfig,
  maxTokens: number,
  corpus: EvidenceCorpus,
  signal?: AbortSignal,
): Promise<WorldSpec | null> {
  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'world-evolve',
        system,
        history: [],
        user,
        maxTokens,
        thinkingLevel: 'minimal',
        format: WORLD_FORMAT,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch {
    return null;
  }
  if (signal?.aborted) return null;
  return coerceWorldSpec(raw, corpus);
}

/** Worlds built in THIS session, and the ones still building, under the persistent cache's own
 *  key. The IndexedDB cache survives reloads but is asynchronous and absent in private mode — this
 *  is what makes a re-open, a second reader of the same card, and a replay share ONE call. A
 *  failure is never memoised: a reader who retries after a rate limit must get a real attempt. */
const built = new Map<string, Promise<WorldSpec | null>>();
/** Bounded, because a long session can open many worlds and each one holds a whole web. Evicting
 *  the least-recently-built costs at most one rebuild of a world nobody has looked at in a while —
 *  and only when the persistent cache misses too. */
export const BUILT_CAP = 16;

/** The identity of a world: the question it answers and the corpus it was grounded in.
 *  NUL-separated (not a space) because `question` and `corpus` are each unbounded text, so a
 *  plain-space join lets a word shift across the boundary between two different (question, corpus)
 *  pairs produce the identical identity string — NUL can't occur in either field, so it can't. */
function worldKey(question: string, corpus: EvidenceCorpus, cfg: ModelConfig): string {
  return rippleCacheKey(`world:${question}\0${corpus.text}`, cfg.provider);
}

/**
 * Explode a causal question into a grounded living world, or null on failure. `corpus` is the
 * parked evidence (attachments + whatever sources the turn already had); pass EMPTY_CORPUS for a
 * from-knowledge world, which correctly comes back all-T0 (qualitative, no numbers).
 *
 * This is THE call a living answer costs, and it runs only when a reader opens one — so it is
 * cached twice over: in-session by `built`, across sessions by the ripple cache.
 */
export function explodeWorld(
  question: string,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WorldSpec | null> {
  const key = worldKey(question, corpus, cfg);
  const already = built.get(key);
  if (already) return already;
  const run = buildWorld(key, question, corpus, cfg, signal);
  built.set(key, run);
  while (built.size > BUILT_CAP) {
    const oldest = built.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    built.delete(oldest);
  }
  void run.then(
    (world) => {
      if (!world) built.delete(key);
    },
    () => built.delete(key),
  );
  return run;
}

async function buildWorld(
  key: string,
  question: string,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WorldSpec | null> {
  try {
    const cached = await cacheGet<WorldSpec>(key);
    if (cached) return cached;
  } catch {
    /* cache miss / no IDB — proceed */
  }

  const { maxTokens, nodeCap } = budgetFor(cfg.model ?? cfg.provider, corpus.quotable);
  const world = await callWorld(
    WORLD_SYSTEM,
    explodeMessage(question, corpus, nodeCap),
    cfg,
    maxTokens,
    corpus,
    signal,
  );
  if (world) {
    try {
      await cachePut(key, world);
    } catch {
      /* best-effort */
    }
  }
  return world;
}

/** Below this share of the incoming turn landing on the standing world, the follow-up is about a
 *  different subject and its payload is DISCARDED — a partly-wrong morph of a world the user is
 *  reading is worse than no morph at all. */
const MIN_MAPPED = 0.5;

/**
 * Evolve the standing world with a follow-up ask: one call that gets the existing id roster and
 * must echo it, coerced against the corpus and then MAPPED onto `prior` (which pins the title, the
 * outcome and every grounded fact the follow-up didn't improve on). Returns null — leaving the
 * world exactly as it was — when the call fails or too little of it mapped to trust the merge.
 *
 * Deliberately NOT cached: the result is a function of the whole standing world, and a cache key
 * cheap enough to compute (title + id roster) would not distinguish two worlds that share their
 * structure but not their receipts — a stale hit would put another turn's evidence on screen.
 */
export async function evolveWorld(
  prior: WorldSpec,
  ask: string,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WorldSpec | null> {
  const { maxTokens, nodeCap } = budgetFor(cfg.model ?? cfg.provider, corpus.quotable);
  const incoming = await callWorld(
    EVOLVE_SYSTEM,
    evolveMessage(prior, ask, corpus, nodeCap),
    cfg,
    maxTokens,
    corpus,
    signal,
  );
  if (!incoming) return null;
  if (mappedFraction(prior, incoming) < MIN_MAPPED) return null;
  return mapOntoWorld(prior, incoming);
}

/** Exposed for the budget test: the arithmetic is the argument, so it is worth pinning. */
export const __budgetForTest = budgetFor;
