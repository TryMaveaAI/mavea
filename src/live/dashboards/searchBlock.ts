// searchBlock.ts — the words for "this cannot be checked right now", and nothing else. A LEAF by
// necessity, not by taste: the predicate that decides the reason has to read Live's config, which
// reaches React, the key vault and the provider index, and modules that must stay free of all
// three still have to say the sentence — a tracker's failure line is one. Splitting the words off
// is what lets every one of them borrow the requirement instead of typing half of it again.
// searchReadiness re-exports all of this, so a surface that asks the question and says the answer
// still has one import.

/** Why a check cannot run: no model at all, or a model with Web search off. Kept to these two on
 *  purpose — every provider on the menu searches natively, so "this model cannot search" is a
 *  setting, never a capability. */
export type SearchBlock = 'no-model' | 'search-off';

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
