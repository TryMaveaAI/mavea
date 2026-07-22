// briefing/types.ts — the shapes of a Briefing: a deterministic, salience-weighted flight that walks
// the document's spine in its OWN verbatim words. A beat is one stop of the camera; its caption is
// assembled from claim titles, verbatim quotes, thread relations, and verdicts — zero new prose, so a
// briefing structurally cannot drift from the source. Silent by default; `spoken` is used only when
// the reader opts into audio. Pure data — see path.ts (the builder) and BriefingPlayer.tsx.

/** What a beat is doing in the argument's arc. */
export type BeatKind = 'open' | 'tension' | 'verdict' | 'context' | 'close';

/** One stop of the flythrough. The camera frames `claimIds`; the caption (verbatim-derived) shows on
 *  screen; `spoken` is the audio twin (only heard if the reader turns sound on). */
export interface BriefingBeat {
  id: string;
  kind: BeatKind;
  /** The card(s) to frame + glow — one claim, or two for a tension between passages. */
  claimIds: string[];
  /** The on-screen line — built from real titles/quotes/relations/verdicts, never invented. */
  caption: string;
  /** The spoken twin (plain prose of the same content), used only when audio is opted in. */
  spoken: string;
  /** How long this beat holds (ms), paced to its length so silent reading and narration co-time. */
  dwellMs: number;
}
