// searchReadiness.ts — the ONE answer to "can a tracker be checked right now?". A dashboard's
// values are only ever persisted from a grounded web search, so a board created or checked under a
// model that cannot search is a board that can never fill in. Two things have to hold: a model is
// connected, and Live's Web search setting is Real-time — refresh.ts asks every provider for the
// search tool regardless, but a provider whose adapter cannot force the tool (Gemini) answers from
// memory, and the pass comes back ungrounded. Every create entry point and every refresh entry
// point asks this predicate, so the reason a board is stuck is named once, in one vocabulary.
//
// Deliberately a leaf: no React, no providers/index. The loop's tick, the add-time gate and a
// sheet's disabled button all read it, and a hook here would drag the whole provider chunk into
// each of them.
import { getLiveConfigV2, toModelConfig, type LiveConfigV2 } from '../useLiveConfig';
import { modelCanGenerate } from '../providers/spendPolicy';

/** Why a check cannot run: no model at all, or a model with Web search off. Kept to these two on
 *  purpose — every provider on the menu searches natively, so "this model cannot search" is a
 *  setting, never a capability. */
export type SearchBlock = 'no-model' | 'search-off';

export type SearchReadiness = { ok: true } | { ok: false; reason: SearchBlock };

export function searchReadiness(cfg: LiveConfigV2 = getLiveConfigV2()): SearchReadiness {
  if (!modelCanGenerate(toModelConfig(cfg))) return { ok: false, reason: 'no-model' };
  if (cfg.searchMode !== 'realtime') return { ok: false, reason: 'search-off' };
  return { ok: true };
}

/** The one line a blocked surface shows. It has to carry BOTH halves of the requirement, because
 *  a reader who has never opened the settings panel knows neither: Web search is a setting, and it
 *  only grounds anything on a model that can search the web (every direct provider can; on
 *  OpenRouter it depends on the model, which is why this says it out loud rather than gating on a
 *  capability flag nothing here can read per-model). Also the `title` of the blocked buttons, so it
 *  stands alone with no link beside it. */
export function searchBlockLine(reason: SearchBlock): string {
  return reason === 'no-model'
    ? 'Connect a model in Live first.'
    : 'Web search is off. Turn it on in Live’s settings, on a model that can search the web.';
}

/** Where that control actually is. The Web search row sits behind Live's model chip on the
 *  Settings tab — two clicks and a scroll from the sentence asking for it, which is a long way to
 *  send someone who did not know the setting existed. This link lands on the row itself. */
export function searchBlockHref(reason: SearchBlock): string {
  return reason === 'no-model' ? '#/live?settings=model' : '#/live?settings=web-search';
}

/** What that link says — the control it opens, never the surface it lands on. */
export function searchBlockCta(reason: SearchBlock): string {
  return reason === 'no-model' ? 'Connect a model' : 'Open Web search settings';
}
