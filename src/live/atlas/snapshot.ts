// snapshot.ts — the dive-back core for the Atlas.
//
// Today only the last 12 full canvases survive in the Library; dive into anything older and Atlas
// can only re-ask the question, not return you to that night. The fix is a small per-conversation
// canvas snapshot (stored in IndexedDB beyond the 12-entry Library). This module holds the PURE part
// — turning a full ConversationSpec into a compact-but-renderable snapshot — so it's unit-tested; the
// IndexedDB read/write wrapper that consumes it is thin I/O added at integration.
//
// "Compact but renderable": drop the big inline data: URIs (reusing the Library's exact rule) and the
// heavy or trivially-regenerable fields (proof/evidence, web sources, build-on-demand extras,
// follow-up chips, routing keywords, bend/blanks/track/intents), while keeping everything TopicCanvas
// needs to redraw the night exactly — id, workspace, title, sub, opener, context, blocks, topic.
import type { ConversationSpec } from '../../data/conversation';
import { stripHeavy } from '../library/store';

export function stripForSnapshot(spec: ConversationSpec): ConversationSpec {
  const lean = stripHeavy(spec); // deep-clone + drop >4KB inline data: URIs
  return {
    ...lean,
    // Reset the heavy / regenerable fields to their empty-but-valid forms. The canvas still renders
    // from `blocks`; evidence, sources, chips, and routing are recomputed live if ever needed.
    proof: null,
    extras: {},
    suggests: [],
    keywords: [],
    sources: undefined,
    bend: undefined,
    blanks: undefined,
    track: undefined,
    intents: undefined,
  };
}
