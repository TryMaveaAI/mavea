// deepen.ts — authoring one concept section's "Go deeper" drawer, on demand.
//
// The eager turn used to buy every drawer up front: ~6 extra output-heavy blocks per rich answer
// for content that lives behind a collapsed drawer and is often never opened. On a BYOK product
// the reader pays for each of those tokens, so the drawer is now bought one section at a time, by
// an explicit press, and cached hard — the drawer for (ask, section, its cards) is the same drawer
// every time, so a re-open, a resize remount, or a later session all ride the first call.
//
// Same shape as world/expand.ts: in-flight dedup on a stable key, the persistent ripple cache,
// bounded context, minimal thinking, and a failure is NEVER memoised — a reader who presses again
// after a rate limit gets a real attempt, not the shrug the first press earned.
//
// This module is reached ONLY through a dynamic import (SectionGroup loads it on the first press),
// because validateLiveResponse pins the engine + catalog — a static edge from the canvas would put
// all of that in front of every surface that renders cards. By the time a drawer can open, a live
// turn has already loaded these modules, so the import resolves from cache.
import type { Block } from '../../data/conversation';
import { getAdapter } from '../providers';
import { cacheGet, cachePut, rippleCacheKey, fnv1a } from '../ripple/cache';
import { validateLiveResponse, liveSystemPrompt } from '../../engine/liveSchema';
import { blockTypesForTier } from '../../engine/blockTypes';
import { ensureDetails } from '../../canvas/blocks/catalog/details';
import { adaptiveCols } from '../layout';
import { catalogSpan } from '../select';
import { getDeepenTurn, deepenOffered, deepenKeySeed, type DeepenTurn } from './deepenStore';

/** Blocks per drawer. The eager budget was ~6 across a whole answer's sections; per opened
 *  section, 2-3 substantive blocks is the same drawer depth — and only opened drawers bill. */
const DRAWER_BLOCKS = 3;
/** Sized the way expand.ts's is (~300/block + envelope headroom): on a thinking model the
 *  reasoning spends from the SAME allowance the JSON must fit inside, and a truncated object
 *  survives nothing, caches nothing, and makes the retry pay the whole call again. */
const MAX_TOKENS = 400 + DRAWER_BLOCKS * 300;
/** Drawers resolved or in flight this session; the persistent cache is the real memory —
 *  this only stops a double-press (or a remount race) paying twice. */
const DEEPEN_CAP = 24;

/** Appended to the stable base prompt (which already teaches the block grammar), so the only
 *  per-call text is this directive + the short user message — never the component menu. */
const DEEPEN_DIRECTIVE = `GO DEEPER DRAWER — the learner pressed "Go deeper" on ONE concept section of an answer you already gave. Author ONLY that drawer's content. BLOCK COUNT — override any count above: exactly 2-${DRAWER_BLOCKS} blocks. Lead with a concrete worked example or the derivation/mechanism, then an edge case, analogy, or self-test check where one genuinely helps. These are REAL authored explanations for a learner who asked to go further — never a rehash of the cards already shown, never filler, and real data only. Set "title" to the section's name and keep "narration" to one short sentence; omit "tour".`;

/** The base system prompt for the drawer call: the 'brief' variant (no tour teaching — a drawer
 *  never walks) of the SAME tier base the turn used, so providers that cache by prefix reuse it. */
function deepenSystemBase(tier: DeepenTurn['tier']): string {
  return liveSystemPrompt(tier, 'brief');
}

/** Bounded context: the section, the cards it already shows, and the sibling sections to stay
 *  out of. The card roster is what stops the drawer re-explaining the standard lesson. */
function deepenMessage(turn: DeepenTurn, label: string, standard: readonly Block[]): string {
  const cards = standard
    .map((b) => `- ${b.type}: ${(b.props as { title?: string }).title ?? ''}`)
    .join('\n')
    .slice(0, 1200);
  const siblings = [...turn.sections.keys()].filter((l) => l !== label).join('; ');
  return `QUESTION: ${turn.ask.slice(0, 500)}

SECTION TO DEEPEN: ${label}

ALREADY SHOWN in this section — extend these, never repeat them:
${cards || '(none)'}

Other sections on the canvas (their territory, not yours): ${siblings || '(none)'}

Author the "Go deeper" drawer for "${label}" only. Reply with ONE JSON object in the documented schema.`;
}

/** Fetched drawer blocks get ids in their own namespace: the validator hands out live-N, which
 *  would alias the main canvas's cards for spotlight/ask chrome. Section + depth tags ride along
 *  so the blocks read as what they are wherever they travel (a selected-block follow-up, a save). */
function tagDrawerBlock(b: Block, label: string, i: number): Block {
  const tagged = { ...b, id: `deep-${fnv1a(label)}-${i + 1}` } as Block & {
    section?: string;
    depth?: number;
  };
  tagged.section = label;
  tagged.depth = 2;
  return tagged;
}

const inFlight = new Map<string, Promise<Block[] | null>>();

async function fetchDrawer(
  key: string,
  turn: DeepenTurn,
  label: string,
  standard: readonly Block[],
): Promise<Block[] | null> {
  const cached = await cacheGet<Block[]>(key);
  if (cached) return cached;
  const allowed = blockTypesForTier(turn.tier);
  let raw: string | object;
  try {
    // The validator coerces each block from its catalog DETAILS; a live turn already loaded
    // these families, so this is a no-op everywhere but a cold restored page.
    await ensureDetails(allowed);
    const base = deepenSystemBase(turn.tier);
    const res = await getAdapter(turn.cfg.provider).generate(
      {
        usageLabel: 'go-deeper',
        system: `${base}\n\n${DEEPEN_DIRECTIVE}`,
        systemBase: base,
        history: [],
        user: deepenMessage(turn, label, standard),
        maxTokens: MAX_TOKENS,
        thinkingLevel: 'minimal',
        // The tier-standard vocabulary only: it is exactly what the base prompt above teaches
        // (and what constrained adapters enum), and every one of these types renders from the
        // core switch — no family chunk has to load for a drawer card to paint.
        blockTypes: [...allowed],
        complexity: 'brief',
      },
      turn.cfg,
    );
    raw = res.raw;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[live] go-deeper drawer failed', err);
    return null;
  }
  const validated = validateLiveResponse(raw, allowed, DRAWER_BLOCKS, false);
  if (!validated || validated.blocks.length === 0) {
    // "The model said nothing usable" and "nothing honest to add" look identical to a reader —
    // both put the button back — so the dev console keeps them apart.
    if (import.meta.env?.DEV) {
      console.warn('[live] go-deeper drawer: nothing survived', {
        section: label,
        raw: typeof raw === 'string' ? raw.slice(0, 400) : raw,
      });
    }
    return null;
  }
  // Tile to full drawer rows the way the canvas tiles inline drawer content, then re-key.
  const tiled = adaptiveCols(validated.blocks, (b) => catalogSpan((b as { type: string }).type));
  const blocks = tiled.map((b, i) => tagDrawerBlock(b, label, i));
  void cachePut(key, blocks);
  return blocks;
}

/**
 * Author the "Go deeper" drawer for one section, or null when nothing can be shown — no parked
 * live turn behind this section (a baked demo, the tour, a restored spec: zero calls, by
 * construction), a failed call, or a payload where no block survived validation. The caller's
 * job in all of them is the same: put the affordance back and say nothing.
 */
export function deepenSection(label: string, standard: readonly Block[]): Promise<Block[] | null> {
  const turn = getDeepenTurn();
  if (!turn || !deepenOffered(label, standard)) return Promise.resolve(null);

  const key = rippleCacheKey(
    `live-deepen:${turn.ask}\0${deepenKeySeed(label, standard)}`,
    turn.cfg.provider,
  );
  const already = inFlight.get(key);
  const run =
    already ??
    (() => {
      const started = fetchDrawer(key, turn, label, standard);
      inFlight.set(key, started);
      while (inFlight.size > DEEPEN_CAP) {
        const oldest = inFlight.keys().next().value;
        if (oldest === undefined || oldest === key) break;
        inFlight.delete(oldest);
      }
      // A failure is never memoised: the next press has to get a real attempt.
      void started.then(
        (blocks) => {
          if (!blocks) inFlight.delete(key);
        },
        () => inFlight.delete(key),
      );
      return started;
    })();

  return run;
}
