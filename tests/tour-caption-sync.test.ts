// The walkthrough's coach line bypasses the per-turn narration walk (it isn't a new answer, so
// nothing resets or advances `spokenNow`, the state the on-screen SpeakingDock caption reads).
// A chapter that speaks a coach line directly — e.g. "Make it yours" right after "It draws the
// answer" — used to leave the dock showing the PREVIOUS answer's narration while the coach's own
// audio played, a caption/voice mismatch a visitor would notice immediately. The fix: the speak
// function handed to the tour driver must also update `spokenNow` with the exact line it speaks,
// so the caption always matches the audio regardless of which chapter triggered it.
//
// This can't be proven by mounting LiveApp (it needs a live tour run — audio unlock, chapter
// timers, session storage — see live-tour-replay-guard.test.tsx for why that class of tour
// wiring is asserted by inspecting the source instead of a full render).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('tour coach speech stays in sync with the SpeakingDock caption', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  it('passes the scripted drivers a speak() that updates spokenNow before speaking', () => {
    // The ops literal is shared by the tour and demo drivers (liveOps); anchor on it.
    const opsStart = src.indexOf('const liveOps: TourOps');
    expect(opsStart, 'liveOps wiring not found in LiveApp.tsx').toBeGreaterThan(-1);
    // The ops object is large; a few hundred chars comfortably spans from `speak:` to `cancelSpeech,`.
    const opsSlice = src.slice(opsStart, opsStart + 2000);
    const speakMatch = /speak:\s*\(text\)\s*=>\s*\{([^}]*)\}/.exec(opsSlice);
    expect(
      speakMatch,
      'ops.speak is not a wrapper function — regressed to a bare reference?',
    ).not.toBeNull();
    const body = speakMatch![1];
    expect(body).toMatch(/setSpokenNow\(text\)/);
    // setSpokenNow must run before the audio call, not after, so the caption is never a beat late.
    expect(body.indexOf('setSpokenNow')).toBeLessThan(body.indexOf('speak(text)'));
  });
});
