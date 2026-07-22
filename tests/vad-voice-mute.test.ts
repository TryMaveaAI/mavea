// Muting always-on must release the actual microphone hardware — not just stop VAD's own
// processing — so the OS "microphone in use" indicator goes dark instead of staying lit while
// the UI shows not-listening. vad-web's pause() already does this (its default pauseStream()
// stops every MediaStream track); this locks that VadVoice actually calls it on mute/stop, so a
// future refactor can't quietly swap in a softer pause that leaves the hardware held open.
import { describe, it, expect, vi } from 'vitest';
import { VadVoice } from '../src/voice/VadVoice';

type Internals = {
  vad: { pause: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> } | null;
};

/** Stand in for an already-loaded, listening VAD session without driving the real WASM load —
 *  `vad` is private on VadVoice, so the assignment goes through its own narrow cast rather than
 *  intersecting `Internals` onto the instance type (which TypeScript collapses to `never`: a
 *  class with a private member can't structurally intersect with a type re-declaring it, even
 *  behind `unknown`). Every other interaction below calls VadVoice's real public API. */
function stubVad(v: VadVoice, vad: Internals['vad']): void {
  (v as unknown as Internals).vad = vad;
}

describe('VadVoice — muting releases the mic hardware', () => {
  it('setMuted(true) pauses the active VAD session (which frees the MediaStream track)', () => {
    const v = new VadVoice();
    const pause = vi.fn();
    stubVad(v, { pause, start: vi.fn() });

    v.setMuted(true);

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('stop() and forceStop() both pause the VAD session', () => {
    const v = new VadVoice();
    const pauseA = vi.fn();
    stubVad(v, { pause: pauseA, start: vi.fn() });
    v.stop();
    expect(pauseA).toHaveBeenCalledTimes(1);

    const pauseB = vi.fn();
    stubVad(v, { pause: pauseB, start: vi.fn() });
    v.forceStop();
    expect(pauseB).toHaveBeenCalledTimes(1);
  });

  it('un-muting re-arms listening (a fresh acquire, not a held-open stream)', () => {
    const v = new VadVoice();
    const start = vi.fn();
    stubVad(v, { pause: vi.fn(), start });

    v.setMuted(true);
    v.setMuted(false);
    v.start();

    expect(start).toHaveBeenCalledTimes(1);
  });
});
