// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeEnergyPublisher, smoothEnergy, type EnergyHost } from '../src/voice/voiceEnergy';

/** A deterministic stand-in for the DOM + rAF, so a frame is a function call rather than a wait. */
function fakeHost(): EnergyHost & { vars: number[]; sync: boolean[]; step: () => void } {
  let cb: (() => void) | null = null;
  const vars: number[] = [];
  const sync: boolean[] = [];
  return {
    vars,
    sync,
    setVar: (v) => vars.push(v),
    setSync: (on) => sync.push(on),
    raf: (fn) => {
      cb = fn;
      return 1;
    },
    cancel: () => {
      cb = null;
    },
    step: () => cb?.(),
  };
}

describe('voice energy envelope', () => {
  // The browser's synthesizer hands over no audio to analyse, so the face's mouth on that tier is
  // driven by a caller-supplied envelope instead of a waveform. If this seam stops fanning a plain
  // sampler through, the browser voice talks with a still mouth — which reads as broken, and is
  // exactly the failure that made this tier feel like a downgrade rather than a plainer voice.
  it('publishes a caller-supplied envelope, no audio involved', () => {
    const host = fakeHost();
    const { acquire } = makeEnergyPublisher(host);
    const release = acquire(() => 0.8);
    expect(host.sync).toEqual([true]);
    for (let i = 0; i < 12; i++) host.step();
    expect(Math.max(...host.vars)).toBeGreaterThan(0.5);
    release();
    expect(host.sync.at(-1)).toBe(false);
    expect(host.vars.at(-1)).toBe(0);
  });

  it('tracks a word-paced pulse the way a boundary event drives it', () => {
    // Mirrors webSpeech.ts's envelope: pulse on each word, decay between, never fully closed.
    let lastWordAt = 0;
    let now = 1000;
    const FLOOR = 0.15;
    const sample = (): number =>
      !lastWordAt ? FLOOR : Math.max(FLOOR, 0.9 * Math.exp(-(now - lastWordAt) / 140));

    const host = fakeHost();
    const { acquire } = makeEnergyPublisher(host);
    acquire(sample);

    // A word lands: the mouth opens.
    lastWordAt = now;
    for (let i = 0; i < 6; i++) host.step();
    const onWord = host.vars.at(-1)!;
    expect(onWord).toBeGreaterThan(0.4);

    // Silence between words: it falls back toward the floor, but never shuts.
    now += 600;
    for (let i = 0; i < 30; i++) host.step();
    const between = host.vars.at(-1)!;
    expect(between).toBeLessThan(onWord);
    expect(between).toBeGreaterThanOrEqual(FLOOR - 0.01);
  });

  it('lets the loudest source win when a real clip and an envelope overlap', () => {
    // The two tiers share one publisher, and a line can hand off from Kokoro to the browser voice
    // mid-flight — so both may be live for an instant. The face must not flicker to the quieter one.
    const host = fakeHost();
    const { acquire } = makeEnergyPublisher(host);
    acquire(() => 0.2);
    acquire(() => 0.9);
    for (let i = 0; i < 12; i++) host.step();
    expect(Math.max(...host.vars)).toBeGreaterThan(0.7);
  });

  it('rests the face when the last source releases, however many acquired', () => {
    const host = fakeHost();
    const { acquire } = makeEnergyPublisher(host);
    const a = acquire(() => 0.9);
    const b = acquire(() => 0.9);
    host.step();
    a();
    expect(host.sync.at(-1)).toBe(true); // one source still live
    b();
    expect(host.sync.at(-1)).toBe(false);
    expect(host.vars.at(-1)).toBe(0);
  });

  it('snaps up faster than it falls, so consonants read and silence does not flicker', () => {
    expect(smoothEnergy(0, 1)).toBeGreaterThan(0.5);
    expect(smoothEnergy(1, 0)).toBeGreaterThan(0.7);
  });
});
