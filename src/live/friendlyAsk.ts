// friendlyAsk — the human-facing label for a turn's "ask".
//
// Some turns send the MODEL an instruction prompt rather than the user's own words: the
// proactive morning brief, an "edit its mind" correction, a block fuse, a living-block refresh,
// a sorted think-aloud, and a mind-map answer/plan. New turns store a short label alongside the
// prompt (see `run()`'s `displayAs`), but a session, library entry, atlas record, or dashboard
// saved BEFORE that shipped still holds the raw instruction as its `question`. Rendered as-is it
// leaks into the answer hero, the session sidebar, the scrubber, replays, and shares — e.g.
// "You — You are Mavéa, an AI presence. Generate a concise morning brief… Do not explain what you
// are doing; just deliver the brief."
//
// This maps any known instruction prompt back to its label, so the prompt can never reach the
// screen — on legacy data (cleaned as each store is read) and as a final net at the hero. An
// ordinary user question is returned unchanged, and a label passed back in returns itself
// (idempotent), so applying it more than once is safe.

/** The label a synthetic prompt should display as, or the text unchanged for a real question. */
export function friendlyAsk(raw: string | null | undefined): string {
  const q = (raw ?? '').trim();
  if (!q) return '';

  // Morning brief — brief/store.ts buildBriefPrompt()
  if (/^You are Mavéa, an AI presence\.\s*Generate a concise morning brief/i.test(q)) {
    return 'Morning brief';
  }
  // "Edit its mind" correction — LiveApp fixUnderstanding()
  const corr = q.match(/^Correction —[\s\S]*?it's actually "([^"]+)"/i);
  if (corr) return `Correction: ${corr[1]}`;
  // Block fuse — LiveApp fuseBlocks()
  if (/^Fuse these/i.test(q)) {
    const pair = q.match(/between "([^"]+)" and "([^"]+)"/i);
    return pair ? `Fuse: ${pair[1]} × ${pair[2]}` : 'Fuse';
  }
  // Living-block refresh — a removed feature, but sessions saved while it existed still hold
  // the raw prompt as their question, so the mapping stays to keep that legacy data clean.
  const refresh = q.match(/^Refresh this — is "([^"]+)" still current/i);
  if (refresh) return refresh[1];
  // Sorted think-aloud — thinkaloud/thinkaloud.ts sortAsk()
  if (/^I just thought out loud for about/i.test(q)) return 'Your thinking, sorted';
  // Mind-map answer/plan — mindshape/mindShapeToPrompt()
  const mind = q.match(
    /^I've been thinking out loud(?: and here's what it comes down to: ([^\n]+))?/i,
  );
  if (mind) return mind[1]?.trim() || 'Your thinking';

  return q;
}
