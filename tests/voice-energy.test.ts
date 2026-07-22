// Voice-energy drives the face from real spoken audio. The WebAudio tap can't run in jsdom, so
// these lock the parts that must be correct regardless: the loudness math, the smoothing shape,
// and — most importantly — the ref-counted publisher's no-leak contract (the rAF loop is started
// once, stopped exactly when the last clip releases, and the face is reset to rest).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rmsEnergy,
  smoothEnergy,
  makeEnergyPublisher,
  voiceEnergyTap,
  captureAudioStream,
  type EnergyHost,
} from '../src/voice/voiceEnergy';

function bytes(fill: number, n = 64): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

describe('rmsEnergy', () => {
  it('reads silence (128 = zero crossing) as 0', () => {
    expect(rmsEnergy(bytes(128))).toBe(0);
  });

  it('is 0 for an empty buffer', () => {
    expect(rmsEnergy(new Uint8Array(0))).toBe(0);
  });

  it('saturates to 1 on a full-swing waveform', () => {
    const buf = new Uint8Array(64);
    for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? 255 : 1;
    expect(rmsEnergy(buf)).toBe(1);
  });

  it('rises monotonically with amplitude', () => {
    expect(rmsEnergy(bytes(140))).toBeLessThan(rmsEnergy(bytes(180)));
  });
});

describe('smoothEnergy', () => {
  it('attacks fast and releases slow (a punchy but flicker-free mouth)', () => {
    const attack = smoothEnergy(0, 1); // rising
    const release = 1 - smoothEnergy(1, 0); // falling, magnitude of the drop
    expect(attack).toBeCloseTo(0.6, 5);
    expect(release).toBeCloseTo(0.22, 5);
    expect(attack).toBeGreaterThan(release);
  });

  it('converges toward the target', () => {
    let v = 0;
    for (let i = 0; i < 30; i++) v = smoothEnergy(v, 1);
    expect(v).toBeCloseTo(1, 2);
  });
});

// A manual scheduler so the rAF loop is driven one frame at a time (no real timers, no runaway).
function fakeHost(): {
  host: EnergyHost;
  vars: number[];
  syncs: boolean[];
  cancels: number[];
  tick: () => void;
  pending: () => boolean;
} {
  let nextId = 1;
  let cb: (() => void) | null = null;
  let cbId = 0;
  const vars: number[] = [];
  const syncs: boolean[] = [];
  const cancels: number[] = [];
  const host: EnergyHost = {
    setVar: (v) => vars.push(v),
    setSync: (on) => syncs.push(on),
    raf: (fn) => {
      cb = fn;
      cbId = nextId++;
      return cbId;
    },
    cancel: (id) => {
      cancels.push(id);
      if (id === cbId) cb = null;
    },
  };
  return {
    host,
    vars,
    syncs,
    cancels,
    tick: () => {
      const fn = cb;
      cb = null;
      fn?.();
    },
    pending: () => cb !== null,
  };
}

describe('makeEnergyPublisher (no-leak ref counting)', () => {
  it('turns sync on at the first clip and writes a smoothed level each frame', () => {
    const h = fakeHost();
    const pub = makeEnergyPublisher(h.host);
    pub.acquire(() => 1);
    expect(h.syncs.at(-1)).toBe(true);
    expect(h.pending()).toBe(true); // loop scheduled
    h.tick();
    expect(h.vars.at(-1)).toBeCloseTo(0.6, 3); // smoothEnergy(0, 1)
    h.tick();
    expect(h.vars.at(-1)).toBeGreaterThan(0.6); // climbing toward 1
  });

  it('stops the loop and rests the face only when the last clip releases', () => {
    const h = fakeHost();
    const pub = makeEnergyPublisher(h.host);
    const a = pub.acquire(() => 1);
    const b = pub.acquire(() => 1);
    expect(h.syncs.filter(Boolean).length).toBe(1); // sync flips on once, not per clip
    a();
    expect(h.syncs.at(-1)).toBe(true); // still speaking — b holds it open
    b();
    expect(h.syncs.at(-1)).toBe(false);
    expect(h.vars.at(-1)).toBe(0); // rested
    expect(h.pending()).toBe(false); // no dangling rAF
  });

  it('release is idempotent (a double call cannot unbalance the count)', () => {
    const h = fakeHost();
    const pub = makeEnergyPublisher(h.host);
    const a = pub.acquire(() => 1);
    const b = pub.acquire(() => 1);
    a();
    a(); // double release of the same clip must not drop b's hold
    expect(h.syncs.at(-1)).toBe(true);
    b();
    expect(h.syncs.at(-1)).toBe(false);
  });

  it('reset() hard-stops every clip and rests the face', () => {
    const h = fakeHost();
    const pub = makeEnergyPublisher(h.host);
    pub.acquire(() => 1);
    pub.acquire(() => 1);
    h.tick();
    pub.reset();
    expect(h.syncs.at(-1)).toBe(false);
    expect(h.vars.at(-1)).toBe(0);
    expect(h.pending()).toBe(false);
  });
});

describe('voiceEnergyTap', () => {
  it('is a safe no-op (returns an idempotent release) without WebAudio', () => {
    const release = voiceEnergyTap({} as unknown as HTMLAudioElement);
    expect(typeof release).toBe('function');
    expect(() => {
      release();
      release();
    }).not.toThrow();
  });
});

describe('captureAudioStream', () => {
  const original = (globalThis as { AudioContext?: unknown }).AudioContext;
  afterEach(() => {
    (globalThis as { AudioContext?: unknown }).AudioContext = original;
  });

  it('returns null when WebAudio is unavailable', () => {
    // jsdom has no AudioContext, so the shared graph can't be built and the tap declines cleanly.
    expect(captureAudioStream()).toBeNull();
  });

  it('taps the shared graph into a MediaStream, resumes a suspended context, and detaches once', () => {
    const stream = { id: 'ms' } as unknown as MediaStream;
    const dest = { stream } as unknown as MediaStreamAudioDestinationNode;
    const connect = vi.fn();
    const disconnect = vi.fn();
    const resume = vi.fn(() => Promise.resolve());
    class FakeAudioContext {
      state = 'suspended';
      resume = resume;
      destination = { kind: 'dest' };
      createAnalyser(): unknown {
        return {
          fftSize: 0,
          smoothingTimeConstant: 0,
          frequencyBinCount: 128,
          connect,
          disconnect,
        };
      }
      createMediaStreamDestination(): unknown {
        return dest;
      }
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;

    const tap = captureAudioStream();
    expect(tap).not.toBeNull();
    expect(tap?.stream).toBe(stream);
    expect(resume).toHaveBeenCalledTimes(1); // suspended context nudged awake
    expect(connect).toHaveBeenCalledWith(dest); // analyser → recording destination

    tap?.stop();
    expect(disconnect).toHaveBeenCalledWith(dest);
    tap?.stop(); // idempotent — a double stop must not double-disconnect
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
