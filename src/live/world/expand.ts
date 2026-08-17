// world/expand.ts — breaking ONE cause down, on demand.
//
// A world arrives with whatever breakdowns the explode could afford: four children on a node or
// two, usually none. Every other node still looks expandable to a reader — it is a cause with
// parts, and the obvious thing to do with it is look closer — and until this existed, looking
// closer at one of them did nothing at all.
//
// It is a SEPARATE call from the explode on purpose. Asking the initial build to break down all
// sixteen nodes would multiply the cost of every world by the number of nodes nobody opens, and
// this is a BYOK product: the reader pays for each token. So the breakdown is bought one node at a
// time, by an explicit press, and cached hard — the children of (this question, this node, this
// corpus) are the same children every time, so a second look, a re-open, or another reader of the
// same shared answer all ride the first call.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers/index';
import { cacheGet, cachePut, rippleCacheKey } from '../ripple/cache';
import type { EvidenceCorpus } from '../ground/evidence';
import { applyExpansion, coerceExpansion } from './validate';
import { WORLD_DOMAINS } from './types';
import type { WorldNode, WorldSpec } from './types';

/** validate.ts's CHILD_CAP, which is what actually enforces this — stated here so the prompt asks
 *  for the number the gate keeps rather than a larger one whose surplus is silently dropped. */
const CHILD_CAP = 4;
/** Derived the way explodeWorld's budget is, at its same ~300-per-node rate.
 *
 *  Frugal is NOT the same as tight, and this ceiling is not just the JSON: on a thinking model the
 *  reasoning before the answer is spent from the SAME allowance, so a budget sized to the payload
 *  alone truncates mid-object — nothing survives coercion, nothing is cached, and the retry pays
 *  the whole call again. A ceiling too low costs the reader more than a generous one. The saving
 *  that matters here is structural: one call per cause, only when asked for, and never twice. */
const MAX_TOKENS = 400 + CHILD_CAP * 300;
/** Node breakdowns held in this session. Small: each is four nodes, and the persistent cache is
 *  the real memory — this only stops a double-press paying twice. */
const EXPAND_CAP = 24;

// Deliberately short. Every line here is paid for twice — once as input tokens, and again as the
// thinking the model does before answering, which counts against the SAME output ceiling the JSON
// has to fit inside. A long, careful brief for a four-item answer is how a call ends up truncated
// mid-object: the reader pays in full and receives nothing.
const EXPAND_SYSTEM = `Break ONE cause into the parts it is MADE OF (components or segments) — never its causes or its effects, which are separate nodes. Return ONLY compact JSON, one line.

At most ${CHILD_CAP} children; fewer beats padding. Nothing honest to split? {"children":[]}.
"tier":"T2" with a VERBATIM "quote" from SOURCES is the only way to give a "value" — otherwise "tier":"T0" and no numbers, no quote. Never invent a figure or a citation. Empty SOURCES ⇒ every child T0.
"id": short lowercase-hyphen slug. "detail": one plain sentence. "domain" (optional): ${WORLD_DOMAINS.join('|')}.

{"children":[{"id":"","label":"","tier":"T0","value":0,"unit":"","quote":"","detail":"","domain":""}]}`;

const CHILD_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] },
    value: { type: 'number' },
    unit: { type: 'string' },
    quote: { type: 'string' },
    detail: { type: 'string' },
    domain: { type: 'string', enum: [...WORLD_DOMAINS] },
  },
  required: ['id', 'label'],
};

const EXPAND_FORMAT = {
  type: 'object',
  properties: {
    children: { type: 'array', maxItems: CHILD_CAP, items: CHILD_ITEM },
  },
  required: ['children'],
};

const SOURCES_EMPTY = '(none — use only general knowledge; mark EVERY child "T0" with no numbers)';

function expandMessage(prior: WorldSpec, node: WorldNode, corpus: EvidenceCorpus): string {
  // The sibling roster is here so the model splits the node rather than re-listing the web around
  // it: without it, "Bank losses" reliably comes back broken down into the causes standing next to
  // it on the very same graph.
  const siblings = prior.nodes
    .filter((n) => n.id !== node.id)
    .map((n) => n.label)
    .join('; ');
  return `WORLD: ${prior.title}

BREAK DOWN THIS CAUSE: ${node.label}${node.detail ? `\n(context: ${node.detail})` : ''}

ALREADY ON THE WEB as separate causes — never return these as children:
${siblings || '(nothing else)'}

SOURCES:
${corpus.text.trim() ? corpus.text.trim().slice(0, 6000) : SOURCES_EMPTY}

Give the parts "${node.label}" is made of (${CHILD_CAP} max). Quote SOURCES verbatim for any number; otherwise T0 with no numbers. Reply as compact JSON on one line.`;
}

const inFlight = new Map<string, Promise<WorldNode[] | null>>();

function expandKey(
  prior: WorldSpec,
  nodeId: string,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
): string {
  // NUL-separated for the same reason explodeWorld's key is: title and corpus are unbounded text,
  // and a space join lets a word drift across the boundary and collide two different requests.
  return rippleCacheKey(`world-expand:${prior.title}\0${nodeId}\0${corpus.text}`, cfg.provider);
}

async function fetchChildren(
  key: string,
  prior: WorldSpec,
  node: WorldNode,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WorldNode[] | null> {
  const cached = await cacheGet<WorldNode[]>(key);
  if (cached) return cached;
  if (signal?.aborted) return null;
  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        system: EXPAND_SYSTEM,
        history: [],
        user: expandMessage(prior, node, corpus),
        maxTokens: MAX_TOKENS,
        thinkingLevel: 'minimal',
        format: EXPAND_FORMAT,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[live] world expand failed', err);
    return null;
  }
  if (signal?.aborted) return null;
  const children = coerceExpansion(raw, node.id, corpus, !!prior.provenance.illustrative);
  if (children.length === 0) {
    // "The cause has no honest parts" and "the model said nothing usable" look identical to a
    // reader — both put the chip back — so the dev console keeps them apart.
    if (import.meta.env?.DEV) {
      console.warn('[live] world expand: nothing survived', {
        node: node.id,
        raw: typeof raw === 'string' ? raw.slice(0, 400) : raw,
      });
    }
    return null;
  }
  void cachePut(key, children);
  return children;
}

/**
 * Break one node into its parts and return the world with that breakdown attached, or null when
 * there is nothing honest to attach.
 *
 * At ANY depth. A part is a thing with parts of its own — cell → cathode → material is an ordinary
 * question, and refusing it because the node happened to already be someone's child made "how far
 * can I go" a property of the schema rather than of the answer. The depth a reader can DRAW is a
 * separate, renderer-side limit (`MAX_DRAWN_DEPTH`); what the world knows is not capped here.
 *
 * Null covers every "nothing happened" case deliberately — an unknown node, a node whose breakdown
 * the world already carries, a failed or aborted call, and a payload where no child survived the
 * grounding gate. The caller's job in all of them is the same: put the affordance back and say
 * nothing, because a cause that cannot be honestly divided is a fact about the world, not an error
 * to report.
 */
/** The node with this id, at any depth. */
function findNode(nodes: readonly WorldNode[], id: string): WorldNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children === undefined ? undefined : findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

export function expandWorldNode(
  prior: WorldSpec,
  nodeId: string,
  corpus: EvidenceCorpus,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<WorldSpec | null> {
  const node = findNode(prior.nodes, nodeId);
  if (!node || (node.children?.length ?? 0) > 0) return Promise.resolve(null);

  const key = expandKey(prior, nodeId, corpus, cfg);
  const already = inFlight.get(key);
  // The children of (question, node, corpus) are a pure function of those three, so they are what
  // is cached — never the merged spec, which is a moving target the moment a follow-up evolves the
  // world around this node.
  const run =
    already ??
    (() => {
      const started = fetchChildren(key, prior, node, corpus, cfg, signal);
      inFlight.set(key, started);
      while (inFlight.size > EXPAND_CAP) {
        const oldest = inFlight.keys().next().value;
        if (oldest === undefined || oldest === key) break;
        inFlight.delete(oldest);
      }
      // A failure is never memoised: a reader who presses again after a rate limit has to get a
      // real attempt, not the shrug the first press earned.
      void started.then(
        (children) => {
          if (!children) inFlight.delete(key);
        },
        () => inFlight.delete(key),
      );
      return started;
    })();

  return run.then((children) => (children ? applyExpansion(prior, nodeId, children) : null));
}
