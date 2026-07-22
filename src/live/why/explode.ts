// why/explode.ts — the ONE model call. A "why" question + a grounding corpus (the user's attached text
// and/or fetched search snippets) → a causal DAG. Modeled on modelRefine.ts: a frozen implicit-cached
// system, a tiny templated schema (so a local model emits OUR shape, not the canvas schema), thinking
// 'minimal', size gated by the measured speed tier. The output is GROUNDED by coerceWhyDag against the
// same corpus — the model proposes, the corpus disposes; nothing numeric survives without a real quote.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers/index';
import { speedTierFor } from '../speed';
import { cacheGet, cachePut, rippleCacheKey } from '../ripple/cache';
import { coerceWhyDag } from './validate';
import type { WhyDag } from './types';

const WHY_SYSTEM = `You are Mavéa's causal explainer. Given a "why" question and SOURCES, build a causal web: root causes → mechanisms → the outcome. Return ONLY compact JSON, no prose.

HARD HONESTY RULES:
- A node's numeric "value" or an edge's "weight" (a 0..1 share of the outcome it explains) may ONLY be given when you can quote it VERBATIM from SOURCES — put that exact sentence in "quote" and set "tier":"T2" (or "T1" if it came from the user's own attached data). weights of the edges INTO the outcome should sum to ≤ 1.
- If a cause or link comes from general knowledge with NO source sentence, set "tier":"T0" and OMIT value/weight/quote. Never invent a number, a percentage, or a citation.
- If SOURCES is empty, EVERY node and edge is "T0" with no numbers — a qualitative structure only.
- "sign" is 1 (reinforces) or -1 (dampens). "role" is "root" | "mechanism" | "outcome". "depth" grows from roots (0) to the outcome.
Shape: {"center":"the question","outcomeId":"<id of the outcome node>","nodes":[{"id":"","label":"","role":"","depth":0,"tier":"T0","value":0,"unit":"","quote":""}],"edges":[{"from":"","to":"","verb":"","weight":0,"sign":1,"tier":"T0","quote":""}],"provenance":{"illustrative":false}}`;

const NODE_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    role: { type: 'string', enum: ['root', 'mechanism', 'outcome'] },
    depth: { type: 'number' },
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    value: { type: 'number' },
    unit: { type: 'string' },
    quote: { type: 'string' },
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
  },
  required: ['from', 'to', 'sign'],
};
const WHY_FORMAT = {
  type: 'object',
  properties: {
    center: { type: 'string' },
    outcomeId: { type: 'string' },
    nodes: { type: 'array', minItems: 2, items: NODE_ITEM },
    edges: { type: 'array', items: EDGE_ITEM },
    provenance: { type: 'object', properties: { illustrative: { type: 'boolean' } } },
  },
  required: ['center', 'nodes', 'edges'],
};

/** Token budget + node cap by measured model speed — a slow local model gets a smaller ask so it
 *  won't stall on a large structured menu. `nodeCap` is the real size control; the token ceiling is
 *  DERIVED from it (~170 tok/node covers a grounded node + its edges + the verbatim source quote
 *  WHY_SYSTEM requires) so a full web of nodeCap nodes never truncates the JSON — which would lose
 *  the whole DAG AND leave nothing cached, making a retry re-pay. A flat 700/1100/1500 was too
 *  tight once corpus grounding added quotes (a 6-node grounded web already runs ~930). */
function budgetFor(model: string): { maxTokens: number; nodeCap: number } {
  const capByTier: Record<string, number> = { slow: 6, standard: 9 }; // 'fast' → the 12 default
  const nodeCap = capByTier[speedTierFor(model)] ?? 12;
  return { maxTokens: 250 + nodeCap * 170, nodeCap }; // 1270 / 1780 / 2290
}

function message(question: string, corpus: string, nodeCap: number): string {
  const sources = corpus.trim()
    ? corpus.trim().slice(0, 6000)
    : '(none — use only general knowledge; mark EVERY node and edge "T0" with no numbers)';
  return `QUESTION: ${question.trim()}

SOURCES:
${sources}

Build the causal web (${nodeCap} nodes max). Quote SOURCES verbatim for any number/weight; otherwise T0 with no numbers. Reply as compact JSON on one line.`;
}

/**
 * Explode a "why" question into a grounded causal web, or null on failure. `corpus` is the grounding
 * text (attachment + search snippets); pass '' for a from-knowledge web (which comes back all-T0).
 */
export async function explodeWhy(
  question: string,
  corpus: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WhyDag | null> {
  // NUL-separated (not a space): `question` and `corpus` are each unbounded text, so a plain-space
  // join lets a word shift across the boundary between two different (question, corpus) pairs
  // produce the identical identity string — NUL can't occur in either field, so it can't.
  const key = rippleCacheKey(`why:${question}\0${corpus}`, cfg.provider);
  try {
    const cached = await cacheGet<WhyDag>(key);
    if (cached) return cached;
  } catch {
    /* cache miss / no IDB — proceed */
  }

  const { maxTokens, nodeCap } = budgetFor(cfg.model ?? cfg.provider);
  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        system: WHY_SYSTEM,
        history: [],
        user: message(question, corpus, nodeCap),
        maxTokens,
        thinkingLevel: 'minimal',
        format: WHY_FORMAT,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch {
    return null;
  }
  if (signal?.aborted) return null;

  const dag = coerceWhyDag(raw, corpus);
  if (dag) {
    try {
      await cachePut(key, dag);
    } catch {
      /* best-effort */
    }
  }
  return dag;
}
