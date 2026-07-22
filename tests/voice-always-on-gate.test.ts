import { describe, expect, it } from 'vitest';
import { micShouldBeOpen, type AlwaysOnState } from '../src/voice/alwaysOnGate';

// The voice⇄typing handoff: in always-on mode the mic stays open EXCEPT while the composer holds
// text. This guards the regression where typing once stranded the mic closed — the gate must flip
// closed when text appears and back open the instant it clears (both directions).
const base: AlwaysOnState = { alwaysOn: true, sttOk: true, composerHasText: false };

describe('always-on mic gate', () => {
  it('open when always-on + stt + empty composer', () => {
    expect(micShouldBeOpen(base)).toBe(true);
  });

  it('closes while typing and RE-OPENS when the composer empties (the bug guard)', () => {
    expect(micShouldBeOpen({ ...base, composerHasText: true })).toBe(false);
    expect(micShouldBeOpen({ ...base, composerHasText: false })).toBe(true);
  });

  it('stays closed when off / no stt', () => {
    expect(micShouldBeOpen({ ...base, alwaysOn: false })).toBe(false);
    expect(micShouldBeOpen({ ...base, sttOk: false })).toBe(false);
  });

  it('muting Mavéa is not an input — the gate has no muted field, so the mic stays open', () => {
    // Mute is an OUTPUT control (Mavéa makes no sound). It used to force the always-on mic
    // closed too, which read as "muting Mavéa turned my microphone off". The state shape
    // itself now guarantees the two can never be re-conflated: there is nothing to pass.
    expect('muted' in base).toBe(false);
    expect(micShouldBeOpen(base)).toBe(true);
  });
});
