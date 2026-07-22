// schema.ts — the canonical JSON Schema for a Live response. Always used by Anthropic
// (output_config.format:json_schema, validating its final text — see anthropic.ts); used by
// OpenAI/Grok ONLY on a search turn, where json_object mode is rejected outright alongside
// the web_search tool (see openaiResponsesCompatible.ts) — their ordinary turns stay on loose
// JSON mode. Gemini never uses this schema — a strict schema makes it take the trivially-valid
// path and emit empty `props:{}` (see gemini.ts).
// The block-type enum is CAPABILITY-TIERED: pass the set the engine exposes for the
// connected model (base 8 for local, +cousins for frontier) so the sampler never
// rejects a valid frontier block.
//
// Design choice: `blocks[].props` is an OPEN object on purpose. We do NOT encode
// strict per-type prop schemas here because (a) provider schema dialects disagree
// on oneOf/discriminated unions, and (b) validateLiveResponse already coerces props
// per type. So constrained decoding guarantees the *structure* (valid JSON,
// narration-first, type ∈ the exposed set, 2–5 blocks) — the single biggest
// accuracy win — and the validator owns prop correctness.
// Import from the dependency-free leaf, NOT liveSchema — a provider adapter must not pull the
// ~580-entry catalog into the eager Live-mount chunk just to know the base block-type enum.
import { ALLOWED_BLOCK_TYPES } from '../../engine/blockTypes';
import type { AskComplexity } from '../select/complexity';

/** The base (small/local) block-type enum. */
export const BLOCK_TYPE_ENUM: string[] = [...ALLOWED_BLOCK_TYPES];

/** Canonical JSON Schema for the given exposed block types. `narration` is listed
 *  FIRST so models stream it first.
 *
 *  `complexity` sizes the floor: a 'brief' ask (the user explicitly asked for something
 *  short — "just tell me", "tl;dr") gets `minItems: 1`, so the SCHEMA can't force padding
 *  onto an answer the prompt is separately telling the model to keep tight. Every richer
 *  ask keeps the 3-block floor (a lone card reads as a broken canvas). */
export function liveJsonSchema(
  types: readonly string[] = BLOCK_TYPE_ENUM,
  complexity?: AskComplexity,
) {
  return {
    type: 'object',
    properties: {
      narration: {
        type: 'string',
        description: 'ONE warm spoken sentence. Emit this FIRST so it can be spoken immediately.',
      },
      title: { type: 'string', description: 'A short headline for the answer.' },
      sub: { type: 'string', description: 'One short supporting line.' },
      blocks: {
        type: 'array',
        minItems: complexity === 'brief' ? 1 : 3,
        // Room to fill a large screen — the prompt asks for a viewport-aware count.
        maxItems: 18,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...types] },
            props: { type: 'object', description: 'Fields for this block type.' },
          },
          required: ['type', 'props'],
        },
      },
      // Optional: the rare "worth tracking live" judgement. Listed (but never required) so a
      // constrained sampler is allowed to emit it; the prompt governs when, and it stays absent
      // on the vast majority of turns.
      track: {
        type: 'object',
        description: 'OMIT unless this answer is a rare ongoing metric worth a living dashboard.',
        properties: {
          score: { type: 'number', description: '0–100: how worth-tracking-over-time this is.' },
          reason: { type: 'string', description: 'Short why, e.g. "weekly burn rate, ongoing".' },
        },
        required: ['score', 'reason'],
      },
      // Optional: real citations for a grounded (web-search) turn — see the CITE YOUR SOURCES
      // prompt line in generateLive.ts. Listed here so schema-constrained adapters (Anthropic
      // always, OpenAI/Grok on a search turn) don't guide the model away from a field the
      // schema itself never mentioned — an undeclared field was silently disappearing under
      // schema guidance even though the prompt asked for it (confirmed against a live search
      // turn that grounded correctly but emitted no sources).
      sources: {
        type: 'array',
        description:
          'OMIT unless this turn used web-search results. Real source URLs actually relied on — never invented.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['title', 'url'],
        },
      },
    },
    required: ['narration', 'title', 'sub', 'blocks'],
  };
}
