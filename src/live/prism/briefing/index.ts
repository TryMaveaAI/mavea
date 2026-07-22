// briefing/ — The Briefing: a silent, captioned, camera-led flight along the document's argument,
// built entirely from grounded claims/threads/verdicts (no model call). Public surface: the player
// component + the pure path-builder.
export { BriefingPlayer, type BriefingPlayerProps } from './BriefingPlayer';
export { buildBriefing } from './path';
export type { BriefingBeat, BeatKind } from './types';
