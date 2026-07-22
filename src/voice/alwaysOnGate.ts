// alwaysOnGate.ts — the single predicate that governs whether the always-on mic should be open.
//
// In always-on mode the mic stays live across the whole conversation EXCEPT while the composer holds
// text (you're typing) — the VAD would otherwise capture you talking-to-yourself mid-compose.
// Submitting or clearing the composer re-opens it. Keeping this as one pure function makes the
// voice⇄typing handoff testable and impossible to regress to the old bug where typing once stranded
// the mic closed (the onChange stopped it and nothing re-armed it).
//
// Muting Mavéa is deliberately NOT an input here: mute is an OUTPUT control (Mavéa makes no sound),
// never "my mic is off". While muted, speak() no-ops, so an open mic has no TTS to echo — and a
// user working somewhere quiet can keep talking to a silent Mavéa.
export interface AlwaysOnState {
  /** The user has hands-free always-on listening enabled. */
  alwaysOn: boolean;
  /** Speech-to-text is actually available in this browser. */
  sttOk: boolean;
  /** The composer currently holds text (the user is typing). */
  composerHasText: boolean;
}

export function micShouldBeOpen(s: AlwaysOnState): boolean {
  return s.alwaysOn && s.sttOk && !s.composerHasText;
}
