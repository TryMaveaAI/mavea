// modelRefine.ts — lean direct model calls for mindshape extraction/refinement.
// Calls getAdapter(provider).generate() directly — NOT generateLive — so no search, memory,
// arcs, or repair happen. Two calls:
//   • settle (once, at speech-end): full transcript → the complete shape + center + unsaid + themes.
//   • patch (during listening): new speech + a COMPACT prior (ids+labels, no quotes) → only the
//     DELTA (new atoms/links). The delta is a fraction of re-emitting the whole shape each time,
//     so the live map stays rich without the token waste. Merge happens client-side in useMindShape.
// The system prompt is the frozen "how to think" (implicit-cached); the exact output shape lives
// in each message so the system never varies (max cache hit) and settle/patch can't contradict it.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers/index';
import { validateMindShape, validateMindShapePatch } from './validate';
import type { MindShapeSpec, MindShapePatch } from './types';

// Headroom for the full shape: atom count isn't capped (the transcript itself isn't truncated either),
// so a longer or richer conversation legitimately surfaces more than the ~8 atoms the old 1400 was
// sized for — and a truncated settle silently drops the shape update rather than mis-drawing it.
const SETTLE_MAX_TOKENS = 2000; // headroom for ~12-14 atoms w/ quotes + links + clusters + unsaid
const PATCH_MAX_TOKENS = 350; // a delta is tiny; the low cap is also a fail-cheap rail vs a runaway full dump

// ── Structured-output schemas (the adapters' `format` override) ───────────────
// Without an explicit schema, a constrained-decoding adapter would force its DEFAULT (canvas)
// schema onto us. We hand it the mindshape shape so the model emits valid {center, atoms,
// links, clusters, unsaid} instead of canvas JSON. Adapters on their free-form path
// (Gemini/Anthropic/OpenAI) ignore `format` and keep working as before.
const ATOM_KINDS = [
  'person',
  'option',
  'want',
  'fear',
  'constraint',
  'tradeoff',
  'contradiction',
  'open_loop',
  'action',
  'value',
  'question',
];
const ATOM_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ATOM_KINDS },
    label: { type: 'string' },
    quote: { type: 'string' },
    status: { type: 'string' },
    confidence: { type: 'string' },
    weight: { type: 'number' },
  },
  required: ['id', 'kind', 'label', 'quote'],
};
const LINK_ITEM = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    kind: { type: 'string', enum: ['supports', 'tensions', 'depends_on', 'same_thread', 'blocks'] },
    label: { type: 'string' },
  },
  required: ['from', 'to', 'kind'],
};
const CLUSTER_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    atomIds: { type: 'array', items: { type: 'string' } },
    weight: { type: 'number' },
  },
  required: ['id', 'label', 'atomIds'],
};
const SETTLE_FORMAT = {
  type: 'object',
  properties: {
    center: { type: 'string' },
    title: { type: 'string' },
    atoms: { type: 'array', minItems: 1, items: ATOM_ITEM },
    links: { type: 'array', items: LINK_ITEM },
    clusters: { type: 'array', items: CLUSTER_ITEM },
    unsaid: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        why: { type: 'string' },
        confidence: { type: 'string' },
      },
    },
  },
  required: ['center', 'atoms'],
};
const PATCH_FORMAT = {
  type: 'object',
  properties: {
    add: { type: 'array', items: ATOM_ITEM },
    addLinks: { type: 'array', items: LINK_ITEM },
  },
};

/** The stable system prompt (implicit-cached by Gemini, ephemeral-cached on Anthropic — never
 *  varies between calls in a session). It teaches the extraction; each message names the schema. */
const MINDSHAPE_SYSTEM = `You are Mavéa, a listening companion that mirrors the shape of thought. A person has been thinking aloud — sometimes weighing a personal decision (wants, fears, options), sometimes exploring a subject they're curious about (questions, threads, sub-topics). Extract the structure of their thinking into a "mindshape" — NOT to give advice, judge, or add ideas not present in their words.

Find WHAT IS ACTUALLY THERE and WHAT CONNECTS OR PULLS AGAINST WHAT. Choose the kind that genuinely fits each atom — never default everything to one kind.

ATOM KINDS:
- question: a subject, topic, or thing they are curious about or want to understand — the DEFAULT for exploratory/learning thinking ("how cars reshaped cities", "what came before the wheel")
- option: a concrete path, sub-area, or choice they are considering
- action: a concrete step they could take or are taking
- want: a genuine desire or goal, stated as wanting something — NOT a topic they are merely exploring
- fear: what worries or scares them
- constraint: a real limitation (time, money, geography, commitment, obligation)
- tradeoff: a genuine cost-benefit tension in a single choice
- open_loop: an unresolved question or loose thread they keep circling but haven't answered
- value: a principle that matters to them (only when explicitly stated)
- person: a real person mentioned by name or relationship

Pick deliberately: a subject of curiosity is a question, a sub-area or path is an option, an unknown they circle is an open_loop; reserve want for an actual stated desire. A map where every atom is the same kind is wrong — make the kinds reflect the real variety in what they said.

LINK KINDS:
- tensions: what genuinely conflicts or pulls against what — THE HERO LINK
- supports: one thing enables or justifies another
- depends_on: one thing requires another
- same_thread: two atoms about the same underlying issue

LABELS:
Each atom's label is a short, plain-language sentence that sums up the idea in the person's own framing — a reader skimming only the labels should grasp the whole shape of the thinking. Write "Cars gave us freedom but reshaped cities around them", NOT a bare noun ("cars") or a filler prefix ("information on cars") or a category. ≤80 chars.

CLUSTERS:
Group the atoms into 2–5 themes that EMERGED from what they actually said. Name each theme in THEIR words and specifics — "the move to Seattle", "Maya and her school", "Dad getting older", "is it the right time" — NEVER an abstract category like "People", "Options", "Worries", "Constraints", or "Trade-offs". A theme must contain at least one atom (list its atom ids). Do not invent a theme to fill a slot — only name what is genuinely there. The themes are how the map is organized, so they must read as this person's own thoughts, not a generic form.

HARD RULES:
1. Every atom MUST have a real quote — verbatim words from the transcript. No quote → no atom.
2. center = the inferred hidden question driving everything. Be SPECIFIC, not generic. ≤90 chars.
3. unsaid = ONE thing they kept circling but never said directly. Write its label as one complete plain-language sentence; confidence MUST be "maybe". label ≤120 chars, why ≤120 chars.
4. Find at least one tensions link if there is genuine conflict in the words.
5. NEVER use clinical/diagnostic language: trauma, PTSD, depression, anxiety disorder, attachment style, narcissism, codependency, dissociation, hypervigilance, personality disorder.
6. NEVER invent motives or interpretations beyond what the words contain.
7. label ≤80 chars (a short summarizing sentence, per LABELS above), quote ≤120 chars (verbatim from the transcript). cluster label ≤32 chars, content-specific.

Reply with ONLY compact JSON — no prose, no markdown fences. The exact fields are given with each request.`;

/** Full-transcript settle call — used at speech end and in the eval. Produces the clean final
 *  shape including center + unsaid + clusters. */
function settleMessage(transcript: string): string {
  return `TRANSCRIPT:
${transcript.trim()}

Extract the full mindshape. Reply as compact JSON on ONE line (no whitespace, no markdown):
{"center":"...","title":"...","atoms":[{"id":"...","kind":"...","label":"...","quote":"...","status":"stable","confidence":"said","weight":1}],"links":[{"from":"...","to":"...","kind":"tensions","label":"..."}],"clusters":[{"id":"...","label":"...","atomIds":["..."],"weight":1}],"unsaid":{"label":"...","why":"...","confidence":"maybe"}}`;
}

/** A compact view of the existing map for patch context — ids + kind + label only. The quotes
 *  (the bulky part) stay client-side; the model only needs this much to reuse ids and not dup. */
function compactPrior(prior: MindShapeSpec): string {
  return JSON.stringify({
    atoms: prior.atoms.map((a) => ({ id: a.id, k: a.kind, l: a.label })),
    links: prior.links.map((l) => [l.from, l.to, l.kind]),
  });
}

/** Incremental patch call — used during live listening. Sends the new speech + a compact prior,
 *  and asks for ONLY the delta the new speech adds. */
function patchMessage(delta: string, prior: MindShapeSpec): string {
  return `NEW SPEECH (since last update):
${delta.trim()}

ALREADY ON THE MAP — reuse these ids, do NOT renumber or restate them:
${compactPrior(prior)}

Return ONLY what the NEW speech ADDS, as compact JSON on ONE line (no whitespace, no markdown):
{"add":[{"id":"...","kind":"...","label":"...","quote":"...","status":"stable","confidence":"said","weight":1}],"addLinks":[{"from":"...","to":"...","kind":"tensions","label":"..."}]}
Only genuinely new atoms (each needs a verbatim quote from the NEW speech). Reuse an existing id only to update that exact atom. Omit "add" or "addLinks" when empty. Do NOT restate unchanged atoms, and do NOT include center, unsaid, clusters, or title — those come at settle.`;
}

/** Shared raw model call. Returns the raw response, or null on abort/network/JSON failure.
 *  `format` is the structured-output schema (ignored by free-form adapters). */
async function callModel(
  user: string,
  maxTokens: number,
  format: object,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<string | object | null> {
  try {
    const adapter = getAdapter(cfg.provider);
    const result = await adapter.generate(
      {
        system: MINDSHAPE_SYSTEM,
        history: [],
        user,
        maxTokens,
        thinkingLevel: 'minimal',
        format,
        signal,
      },
      cfg,
      // No delta handler — we need the complete JSON object, not streaming fragments.
    );
    if (signal?.aborted) return null;
    return result.raw;
  } catch {
    return null;
  }
}

/** Settle: full transcript → the complete, grounded MindShapeSpec (center + unsaid + clusters).
 *  Never throws; returns null on failure or an unsalvageable shape. */
export async function settleMindShape(
  transcript: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<MindShapeSpec | null> {
  const raw = await callModel(
    settleMessage(transcript),
    SETTLE_MAX_TOKENS,
    SETTLE_FORMAT,
    cfg,
    signal,
  );
  if (raw === null) return null;
  return validateMindShape(raw, transcript);
}

/** Patch: new speech + compact prior → the DELTA (new atoms/links), grounded against the full
 *  accumulated transcript. Never throws; returns null on failure or an empty delta. */
export async function patchMindShape(
  delta: string,
  prior: MindShapeSpec,
  fullTranscript: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<MindShapePatch | null> {
  const raw = await callModel(
    patchMessage(delta, prior),
    PATCH_MAX_TOKENS,
    PATCH_FORMAT,
    cfg,
    signal,
  );
  if (raw === null) return null;
  return validateMindShapePatch(raw, fullTranscript);
}
