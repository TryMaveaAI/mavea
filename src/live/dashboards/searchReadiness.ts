// searchReadiness.ts — the ONE answer to "can a tracker be checked right now?". A dashboard's
// values are only ever persisted from a grounded web search, so a board created or checked under a
// model that cannot search is a board that can never fill in. Two things have to hold: a model is
// connected, and Live's Web search setting is Real-time — refresh.ts asks every provider for the
// search tool regardless, but a provider whose adapter cannot force the tool (Gemini) answers from
// memory, and the pass comes back ungrounded. Every create entry point and every refresh entry
// point asks this predicate, so the reason a board is stuck is named once, in one vocabulary.
//
// No React and no providers/index of its own: the loop's tick, the add-time gate and a sheet's
// disabled button all read it, and a hook here would drag the whole provider chunk into each of
// them. Reading the config still reaches both through useLiveConfig, which is why the WORDS for a
// block live in ./searchBlock — a module with no imports at all — and are re-exported here.
import { getLiveConfigV2, toModelConfig, type LiveConfigV2 } from '../useLiveConfig';
import { modelCanGenerate } from '../providers/spendPolicy';
import type { SearchBlock } from './searchBlock';

export type SearchReadiness = { ok: true } | { ok: false; reason: SearchBlock };

export function searchReadiness(cfg: LiveConfigV2 = getLiveConfigV2()): SearchReadiness {
  if (!modelCanGenerate(toModelConfig(cfg))) return { ok: false, reason: 'no-model' };
  if (cfg.searchMode !== 'realtime') return { ok: false, reason: 'search-off' };
  return { ok: true };
}

// Re-exported because asking the question and saying the answer is one job at nearly every call
// site; a module that cannot afford this file's config reader imports ./searchBlock directly.
export type { SearchBlock } from './searchBlock';
export { searchBlockCta, searchBlockHref, searchBlockLine } from './searchBlock';
