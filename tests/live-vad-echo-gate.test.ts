import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VadVoice } from '../src/voice/VadVoice';

// The always-on regression that killed the mic from turn two: LiveApp disarms the gate with
// `setMaveaSpeaking(false)` whenever TTS is silent (and the mute switch does the same), and the
// echo tail must NOT be re-stamped by those idle calls — only by the true falling edge of speech.
// These tests reach the gate's private state deliberately: the bug is invisible through
// the public surface without a real mic, and this is exactly the regression to pin.
type Gate = {
  setMaveaSpeaking(speaking: boolean): void;
  maveaSpeaking: boolean;
  echoTailUntil: number;
  handleSpeechStart(): void;
  handleSpeechRealStart(): void;
  clearBargeInTimer(): void;
  utteranceIsEcho: boolean;
  onBargeIn?: () => void;
};

describe('VadVoice echo gate — survives the idle disarm poll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('stamps the tail once on the falling edge, not on every idle false', () => {
    const v = new VadVoice() as unknown as Gate;
    // Mavéa speaks, then finishes: the falling edge stamps the 600ms tail.
    v.setMaveaSpeaking(true);
    v.setMaveaSpeaking(false);
    const tail = v.echoTailUntil;
    expect(tail).toBeGreaterThan(Date.now());

    // The disarm poll keeps calling false every 200ms — the tail must not move.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(200);
      v.setMaveaSpeaking(false);
    }
    expect(v.echoTailUntil).toBe(tail);
    // …and by now it has genuinely expired: the next utterance is the USER's.
    expect(Date.now()).toBeGreaterThan(v.echoTailUntil);
  });

  it('a new utterance after the tail is not treated as echo', () => {
    const v = new VadVoice() as unknown as Gate;
    v.setMaveaSpeaking(true);
    v.setMaveaSpeaking(false);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(200);
      v.setMaveaSpeaking(false);
    }
    v.handleSpeechStart();
    expect(v.utteranceIsEcho).toBe(false);

    // Speech during active playback is a barge-in, not echo — utteranceIsEcho stays false
    // so the utterance is transcribed and submitted; onBargeIn fires to cancel TTS.
    v.setMaveaSpeaking(true);
    v.handleSpeechStart();
    expect(v.utteranceIsEcho).toBe(false);
  });
});

// A false barge-in — imperfect echo cancellation on speaker+mic setups reads a plosive or loud
// word of Mavéa's own playback as a genuine speech onset — used to cancel TTS on the very first VAD
// frame, chopping Mavéa off mid-thought. onBargeIn now fires from onSpeechRealStart, which the VAD
// raises only after minSpeechFrames of SUSTAINED speech, so a brief bleed blip (which never reaches
// that) can no longer cancel her. handleSpeechStart no longer decides barge-in at all.
describe('VadVoice barge-in — fires only on sustained speech, never on a brief bleed blip', () => {
  it('cancels TTS when a real, sustained onset is confirmed', () => {
    const v = new VadVoice() as unknown as Gate;
    const onBargeIn = vi.fn();
    v.onBargeIn = onBargeIn;
    v.setMaveaSpeaking(true);
    v.handleSpeechStart(); // the first frame never decides barge-in on its own now…
    expect(onBargeIn).not.toHaveBeenCalled();
    v.handleSpeechRealStart(); // …sustained speech confirmed → the genuine interruption
    expect(onBargeIn).toHaveBeenCalledTimes(1);
  });

  it('never cancels TTS for a brief bleed blip that never becomes sustained speech', () => {
    const v = new VadVoice() as unknown as Gate;
    const onBargeIn = vi.fn();
    v.onBargeIn = onBargeIn;
    v.setMaveaSpeaking(true);
    v.handleSpeechStart(); // a plosive of TTS bleed trips the first frame…
    // …but it never sustains minSpeechFrames, so onSpeechRealStart never fires and TTS is untouched.
    expect(onBargeIn).not.toHaveBeenCalled();
  });

  it('does not treat an onset inside the echo tail as a barge-in even once sustained', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    try {
      const v = new VadVoice() as unknown as Gate;
      const onBargeIn = vi.fn();
      v.onBargeIn = onBargeIn;
      v.setMaveaSpeaking(true);
      v.setMaveaSpeaking(false); // stamps the 600ms echo tail
      v.setMaveaSpeaking(true); // Mavéa is audibly playing again
      v.handleSpeechStart(); // onset within the tail → utteranceIsEcho = true
      v.handleSpeechRealStart(); // even if it sustains, it's still echo
      expect(onBargeIn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
