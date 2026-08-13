import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { micShouldBeOpen, type AlwaysOnState } from '../src/voice/alwaysOnGate';
import {
  rmsEnergy,
  smoothEnergy,
  makeEnergyPublisher,
  voiceEnergyTap,
  captureAudioStream,
  type EnergyHost,
} from '../src/voice/voiceEnergy';
import {
  kokoroAvailable,
  kokoroKnownAvailable,
  resetKokoroProbe,
  speakKokoroLine,
  speakKokoroResult,
  cancelKokoro,
  kokoroSpeaking,
  subscribeKokoroSpeaking,
} from '../src/voice/kokoro';
import { VoiceOffHint } from '../src/live/VoiceOffHint';
import { VOICE_OFF_HINT, VOICE_MUTED_HINT } from '../src/live/voiceAvailability';
import { setOutputMuted } from '../src/voice/streamTts';
import { RememberStep } from '../src/live/setup/steps/RememberStep';
import {
  findPreset,
  VOICE_PRESETS,
  DEFAULT_MAVEA_VOICE_ID,
  DEFAULT_USER_VOICE_ID,
} from '../src/voice/presets';
import { sayable } from '../src/voice/tts';
import { VadVoice } from '../src/voice/VadVoice';

// Force the dynamic Silero import to throw where a test needs a deterministic no-mic path.
vi.mock('@ricky0123/vad-web', () => ({
  get MicVAD(): never {
    throw new Error('no VAD in test');
  },
}));

// The voice⇄typing handoff: in always-on mode the mic stays open EXCEPT while the composer holds
// text. This guards the regression where typing once stranded the mic closed — the gate must flip
// closed when text appears and back open the instant it clears (both directions).
describe('always-on mic gate', () => {
  const base: AlwaysOnState = { alwaysOn: true, sttOk: true, composerHasText: false };

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

// Voice-energy drives the face from real spoken audio. The WebAudio tap can't run in jsdom, so
// these lock the parts that must be correct regardless: the loudness math, the smoothing shape,
// and — most importantly — the ref-counted publisher's no-leak contract (the rAF loop is started
// once, stopped exactly when the last clip releases, and the face is reset to rest).
describe('rmsEnergy', () => {
  function bytes(fill: number, n = 64): Uint8Array {
    return new Uint8Array(n).fill(fill);
  }

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

describe('makeEnergyPublisher (no-leak ref counting)', () => {
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

describe('voice energy envelope', () => {
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

  // A caller-supplied envelope also supports deterministic previews without an audio graph.
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
    // Mirrors a natural speech envelope: pulse on each word, decay between, never fully closed.
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
    // Concurrent audio sources share one publisher, so the face must not flicker to the quieter one.
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

// Voice-capability honesty: (a) the /tts/health probe runs ONCE per session and is shared by
// every caller (no 502 noise on every mount), and (b) when Kokoro — the only voice — is down,
// the voice pickers say so (captions only) instead of promising voices that can't play.
describe('voice-capability honesty', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetKokoroProbe();
    setOutputMuted(false);
  });

  beforeEach(() => {
    resetKokoroProbe();
  });

  describe('kokoroAvailable — cached session probe', () => {
    it('fetches /tts/health exactly once across repeated calls', async () => {
      const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
      vi.stubGlobal('fetch', fetchMock);

      await expect(kokoroAvailable()).resolves.toBe(true);
      await expect(kokoroAvailable()).resolves.toBe(true);
      await expect(kokoroAvailable()).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/tts/health', { method: 'GET' });
    });

    it('shares one in-flight probe between concurrent callers', async () => {
      const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 502 } as Response));
      vi.stubGlobal('fetch', fetchMock);

      const [a, b] = await Promise.all([kokoroAvailable(), kokoroAvailable()]);
      expect(a).toBe(false);
      expect(b).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caches a network failure as unavailable (never throws)', async () => {
      const fetchMock = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
      vi.stubGlobal('fetch', fetchMock);

      await expect(kokoroAvailable()).resolves.toBe(false);
      await expect(kokoroAvailable()).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gates playback on the probe — no speech requests fire while Kokoro is down', async () => {
      const fetchMock = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        speakKokoroResult('Hello there, this line stays silent.', 'mavea'),
      ).resolves.toBe(false);
      await expect(speakKokoroResult('And so does this one.', 'user')).resolves.toBe(false);

      // Only the single health probe — never POST /tts/v1/audio/speech per line.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/tts/health', { method: 'GET' });
    });

    it('publishes speaking transitions without an idle polling timer', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      );
      const transitions: boolean[] = [];
      const unsubscribe = subscribeKokoroSpeaking(() => transitions.push(kokoroSpeaking()));

      const line = speakKokoroResult('A queued line.', 'mavea');
      expect(kokoroSpeaking()).toBe(true);
      await expect(line).resolves.toBe(false);
      expect(kokoroSpeaking()).toBe(false);
      // Listeners also wake for synthesizing transitions (the "preparing" signal shares the
      // subscription), so the SPEAKING value may repeat between wakes — consumers snapshot and
      // dedupe (useSyncExternalStore semantics). What matters: it rose once, fell once, and no
      // wake ever fires while the queue is idle.
      const speakingChanges = transitions.filter((v, i) => i === 0 || v !== transitions[i - 1]);
      expect(speakingChanges).toEqual([true, false]);

      unsubscribe();
    });

    it('exposes the settled result synchronously via kokoroKnownAvailable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true } as Response)),
      );
      expect(kokoroKnownAvailable()).toBeNull(); // not probed yet
      await kokoroAvailable();
      expect(kokoroKnownAvailable()).toBe(true);
    });

    it('resetKokoroProbe forces a fresh probe', async () => {
      const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
      vi.stubGlobal('fetch', fetchMock);
      await kokoroAvailable();
      resetKokoroProbe();
      expect(kokoroKnownAvailable()).toBeNull();
      await kokoroAvailable();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('VoiceOffHint — honest voice-picker hint', () => {
    it('shows the captions-only hint when Kokoro is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('no kokoro in test'))),
      );
      render(<VoiceOffHint />);
      expect(await screen.findByRole('status')).toHaveTextContent(VOICE_OFF_HINT);
    });

    it('renders nothing when the Kokoro service is up', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true } as Response)),
      );
      render(<VoiceOffHint />);
      // Let the probe settle, then confirm no hint appeared.
      await kokoroAvailable();
      expect(screen.queryByText(/captions only/i)).toBeNull();
    });

    // Muting silences the audition too (voice/preview.ts skips it), so the picker has to say so
    // — a play button that does nothing at all reads as broken.
    it('explains a muted audition instead of leaving the preview button dead', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true } as Response)),
      );
      setOutputMuted(true);
      render(<VoiceOffHint />);
      expect(await screen.findByRole('status')).toHaveTextContent(VOICE_MUTED_HINT);
    });

    it('states the missing service ahead of the mute — unmuting alone would not help', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('no kokoro in test'))),
      );
      setOutputMuted(true);
      render(<VoiceOffHint />);
      expect(await screen.findByRole('status')).toHaveTextContent(VOICE_OFF_HINT);
    });

    it('appears under the wizard Remember step voice pickers when Kokoro is down', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('no kokoro in test'))),
      );
      render(<RememberStep />);
      // The pickers still offer the named voices (nothing is blocked)…
      expect(screen.getByLabelText('Mavéa speaks as')).toBeInTheDocument();
      // …but the silence is stated honestly: voice off, captions only.
      expect(await screen.findByText(/captions only/i)).toBeInTheDocument();
    });
  });
});

// speakKokoroLine hands the reveal walk a line's two lifecycle moments — `started` (audio first
// audible, or definitively never) and `finished` (played end-to-end, or skipped/cancelled). The
// walk keys the spotlight to `started`, so the ordering guarantee (started settles before
// finished) and the never-hangs guarantee (every failure path resolves BOTH) are load-bearing:
// a line whose promises dangled would freeze the walk on old machines instead of syncing it.
describe('speakKokoroLine', () => {
  /** Tag each promise's resolution so ordering between them can be asserted. */
  function ordered(line: { started: Promise<boolean>; finished: Promise<boolean> }) {
    const order: string[] = [];
    return {
      started: line.started.then((v) => {
        order.push('started');
        return v;
      }),
      finished: line.finished.then((v) => {
        order.push('finished');
        return v;
      }),
      order,
    };
  }

  beforeEach(() => {
    resetKokoroProbe();
  });
  afterEach(() => {
    cancelKokoro();
    resetKokoroProbe();
    vi.unstubAllGlobals();
  });

  it('resolves both promises false immediately for empty/markup-only text', async () => {
    const line = speakKokoroLine('**', 'mavea');
    await expect(line.started).resolves.toBe(false);
    await expect(line.finished).resolves.toBe(false);
  });

  it('with the voice server down, started resolves false BEFORE finished (never hangs)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const line = ordered(speakKokoroLine('Hello there.', 'mavea'));
    expect(await line.started).toBe(false);
    expect(await line.finished).toBe(false);
    expect(line.order).toEqual(['started', 'finished']);
  });

  it('cancelKokoro drains queued lines, resolving both promises false for each', async () => {
    // Hold the health probe open so both lines are still queued when the cancel lands.
    let releaseProbe!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            releaseProbe = resolve;
          }),
      ),
    );
    const a = speakKokoroLine('First line.', 'mavea');
    const b = speakKokoroLine('Second line.', 'user');
    cancelKokoro();
    // The still-queued line resolves from the drain itself — no network needed.
    await expect(b.started).resolves.toBe(false);
    await expect(b.finished).resolves.toBe(false);
    // The line pump already picked up resolves once its gate (the probe) settles.
    releaseProbe(new Response(null, { status: 503 }));
    await expect(a.started).resolves.toBe(false);
    await expect(a.finished).resolves.toBe(false);
  });

  it('the blob fallback reports started the moment play() is accepted, finished on ended', async () => {
    // jsdom has no WebAudio, so the streaming path bows out and the whole-clip path plays —
    // exactly the fallback route old browsers take.
    const audios: FakeAudio[] = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {
        audios.push(this);
      }
      play(): Promise<void> {
        return Promise.resolve();
      }
      pause(): void {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    const urlStub = { createObjectURL: vi.fn(() => 'blob:clip'), revokeObjectURL: vi.fn() };
    vi.stubGlobal('URL', urlStub);
    const speechBodies: Array<{ response_format?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/health')) return Promise.resolve(new Response('ok'));
        speechBodies.push(JSON.parse(String(init?.body)) as { response_format?: string });
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4])));
      }),
    );

    const line = ordered(speakKokoroLine('A real line.', 'mavea'));
    expect(await line.started).toBe(true);
    expect(speechBodies).toEqual([expect.objectContaining({ response_format: 'wav' })]);
    // Audio is "playing" now; the clip ending resolves finished.
    expect(line.order).toEqual(['started']);
    audios[0].onended?.();
    expect(await line.finished).toBe(true);
    expect(line.order).toEqual(['started', 'finished']);
  });

  it('speakKokoroResult stays the finished promise (compat for fire-and-forget callers)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    await expect(speakKokoroResult('Hello.', 'mavea')).resolves.toBe(false);
  });
});

// The voice the user HEARS by default must be the one the settings UI shows as selected. That
// only holds if the default ids resolve to real presets — the bug was a runtime default
// ('am_michael') that no preset mapped to, so the dropdown said "Echo" while another voice played.
describe('voice preset defaults', () => {
  it('every preset has a non-empty kokoro voice id', () => {
    for (const p of VOICE_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.kokoro).toMatch(/^[a-z]{2}_\w+$/);
    }
  });

  it('both default voice ids resolve to a real preset', () => {
    // If these fall through, the runtime default (resolved via findPreset) drifts from the UI.
    expect(findPreset(DEFAULT_MAVEA_VOICE_ID)).toBeDefined();
    expect(findPreset(DEFAULT_USER_VOICE_ID)).toBeDefined();
  });

  it('the Mavéa and person defaults are distinct voices (two-voice playback stays distinguishable)', () => {
    expect(findPreset(DEFAULT_MAVEA_VOICE_ID)!.kokoro).not.toBe(
      findPreset(DEFAULT_USER_VOICE_ID)!.kokoro,
    );
  });
});

// Regression coverage for a real bug: picking voice B before voice A's audition clip finished
// fetching used to let BOTH eventually construct an <audio> and call .play() — nothing stopped
// A once it was already in flight, so two clips could sound at once. previewVoice() now guards
// every async step with a generation counter (src/voice/preview.ts), so a superseded request
// bails out at its very next checkpoint instead of racing the current one to playback.
describe('previewVoice — race safety', () => {
  class FakeAudio {
    src: string;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src: string) {
      this.src = src;
    }
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): void {}
  }

  function mkBlobResponse(tag: string): Response {
    const blob = { size: 1, _tag: tag } as unknown as Blob;
    return { ok: true, blob: () => Promise.resolve(blob) } as unknown as Response;
  }

  // previewVoice() now hops through an extra async layer (it tries the streaming path first,
  // which resolves false in jsdom with no WebAudio, before falling back to the blob fetch this
  // file mocks) — a fixed number of `await Promise.resolve()` ticks is too fragile to that
  // implementation detail. A macrotask flush drains every pending microtask first, regardless of
  // how many hops deep, so it stays correct even if that call chain grows another layer.
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  let constructed: string[];

  beforeEach(() => {
    vi.resetModules();
    constructed = [];
    const AudioCtor = function (this: FakeAudio, src: string) {
      constructed.push(src);
      return new FakeAudio(src);
    } as unknown as typeof Audio;
    vi.stubGlobal('Audio', AudioCtor);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (b: Blob | MediaSource) => `blob:${(b as unknown as { _tag?: string })._tag ?? 'x'}`,
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('abandons a superseded request before it ever reaches the network, so only the latest pick can play', async () => {
    let resolve!: (r: Response) => void;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls++;
        return new Promise<Response>((res) => {
          resolve = res;
        });
      }),
    );

    const { previewVoice } = await import('../src/voice/preview');
    const { findPreset } = await import('../src/voice/presets');

    // Two picks in immediate succession, exactly like a user browsing the dropdown: heart is
    // superseded before its own (mocked, streaming-unavailable) attempt even settles, so it must
    // bail out on its own rather than still racing bella to the network.
    previewVoice(findPreset('heart')!);
    previewVoice(findPreset('bella')!);
    await flush();

    expect(calls).toBe(1); // heart's request never happened — only the current pick's did
    resolve(mkBlobResponse('bella'));
    await flush();

    expect(constructed).toEqual(['blob:bella']);
  });

  // Mute is the switch for Mavéa's voice, and an audition is Mavéa's voice — so a muted preview
  // stays silent (the picker says why, see VoiceOffHint) rather than being the one sound a
  // silenced session makes. It must also not synthesize a clip nobody can hear.
  it('makes no sound and no request while the voice is muted', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const { previewVoice } = await import('../src/voice/preview');
    const { setOutputMuted: mute } = await import('../src/voice/streamTts');
    const { findPreset } = await import('../src/voice/presets');

    mute(true);
    previewVoice(findPreset('heart')!);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(constructed).toEqual([]);

    mute(false);
    previewVoice(findPreset('heart')!);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stopPreview aborts an in-flight request', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>(() => {
          /* never resolves — only the abort matters here */
        });
      }),
    );

    const { previewVoice, stopPreview } = await import('../src/voice/preview');
    const { findPreset } = await import('../src/voice/presets');

    previewVoice(findPreset('heart')!);
    await flush(); // let it reach the (mocked) blob fetch and capture its signal
    expect(signal?.aborted).toBe(false);
    stopPreview();
    expect(signal?.aborted).toBe(true);
  });
});

// The product name is written, never spoken: TTS engines mangle the accented "Mavéa"
// ("mah-vay-yah"), so sayable() drops it from every spoken line while captions keep the
// full written text. This guards the strip for the shapes real copy uses — a leading
// subject, a possessive, mid-sentence mentions, and the accentless spelling.
describe('sayable — the product name is never spoken', () => {
  it('drops the bare name wherever it sits in a sentence', () => {
    expect(sayable('Mavéa is standing by.')).toBe('is standing by.');
    expect(sayable('Ask Mavéa anything worth checking.')).toBe('Ask anything worth checking.');
    expect(sayable('That’s Mavéa.')).toBe('That’s.');
  });

  it('drops the possessive form with its trailing space', () => {
    expect(sayable('Mavéa’s voice reads the headline.')).toBe('voice reads the headline.');
    expect(sayable("Mavéa's weekly recap is ready.")).toBe('weekly recap is ready.');
  });

  it('covers the accentless spelling and any casing', () => {
    expect(sayable('MAVEA noticed a change.')).toBe('noticed a change.');
    expect(sayable('mavea compiled the briefing.')).toBe('compiled the briefing.');
  });

  it('never strips words that merely contain the letters', () => {
    expect(sayable('The maven made a move.')).toBe('The maven made a move.');
  });

  it('leaves no doubled spaces or stranded punctuation behind', () => {
    expect(sayable('Your week with Mavéa , recapped.')).toBe('Your week with, recapped.');
  });
});

// transcribeWhisper probes the /stt service on speech-end. The first probe runs on a short
// timeout so a sleeping service can't stall the turn. The bug being pinned here: a single
// cold-start TIMEOUT used to set whisperOk=false permanently. A timeout must leave whisperOk null
// so the next utterance retries;
// only a DEFINITIVE failure (HTTP error, connection refused) may disable Whisper.
//
// The probe is private and only reachable through speech-end without a real mic, so these tests
// reach the private surface deliberately — exactly the regression we need to lock down.
describe('VadVoice Whisper cold-start recovery', () => {
  type Whisper = {
    transcribeWhisper(audio: Float32Array): Promise<string>;
    whisperOk: boolean | null;
  };

  beforeEach(() => {
    // floatToWav reads the audio; a tiny non-empty buffer is enough to build the WAV blob.
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps Whisper retryable after a timeout (whisperOk stays null)', async () => {
    // AbortSignal.timeout() rejects with a DOMException named TimeoutError when it fires.
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(timeout)),
    );

    const v = new VadVoice() as unknown as Whisper;
    const audio = new Float32Array([0.1, -0.1, 0.2, -0.2]);

    const first = await v.transcribeWhisper(audio);
    expect(first).toBe('');
    // The session is NOT downgraded: the next utterance will probe /stt again.
    expect(v.whisperOk).toBeNull();

    const second = await v.transcribeWhisper(audio);
    expect(second).toBe('');
    expect(v.whisperOk).toBeNull();
    // Both calls actually hit the service — Whisper was never short-circuited off.
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it('also treats a bare AbortError as "slow, retry"', async () => {
    const aborted = new DOMException('Aborted.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(aborted)),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    expect(v.whisperOk).toBeNull();
  });

  it('disables Whisper on a definitive HTTP failure (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    // A real service answer that says "no" is definitive — stop probing this session.
    expect(v.whisperOk).toBe(false);

    // Once disabled, later calls short-circuit without touching the network.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const again = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(again).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables Whisper on connection refused (network TypeError, not an abort)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('');
    expect(v.whisperOk).toBe(false);
  });

  it('marks Whisper healthy once it answers with text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ text: '  hello world  ' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    const v = new VadVoice() as unknown as Whisper;
    const out = await v.transcribeWhisper(new Float32Array([0.1, -0.1]));
    expect(out).toBe('hello world');
    expect(v.whisperOk).toBe(true);
  });
});
