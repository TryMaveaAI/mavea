// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The seam under test is which voice speaks a line, so both backends are faked: the real ones
// need a Kokoro server and an OS synthesizer, and neither exists in CI. What matters here is the
// routing and the handoff, not the audio.
const kokoro = vi.hoisted(() => ({
  known: null as boolean | null,
  /** Whether a queued Kokoro line becomes audible. false = the machine can't voice it. */
  audible: true,
  lines: [] as string[],
  cancelled: 0,
}));
const web = vi.hoisted(() => ({
  available: true,
  lines: [] as string[],
  cancelled: 0,
}));
const stream = vi.hoisted(() => ({ underruns: 0 }));

vi.mock('../src/voice/streamTts', () => ({
  streamUnderruns: () => stream.underruns,
}));

vi.mock('../src/voice/kokoro', () => ({
  speakKokoroLine: (text: string) => {
    kokoro.lines.push(text);
    return {
      started: Promise.resolve(kokoro.audible),
      finished: Promise.resolve(kokoro.audible),
    };
  },
  cancelKokoro: () => void kokoro.cancelled++,
  kokoroSpeaking: () => false,
  kokoroKnownAvailable: () => kokoro.known,
  subscribeKokoroSpeaking: () => () => {},
}));

vi.mock('../src/voice/webSpeech', () => ({
  speakWebSpeechLine: (text: string) => {
    web.lines.push(text);
    return { started: Promise.resolve(true), finished: Promise.resolve(true) };
  },
  cancelWebSpeech: () => void web.cancelled++,
  webSpeechAvailable: () => web.available,
  webSpeechSpeaking: () => false,
  subscribeWebSpeechSpeaking: () => () => {},
}));

const { speakLine, cancelSpeech, setVoiceMode, voiceMode } = await import('../src/voice/tts');

beforeEach(() => {
  kokoro.known = null;
  kokoro.audible = true;
  kokoro.lines = [];
  kokoro.cancelled = 0;
  web.available = true;
  web.lines = [];
  web.cancelled = 0;
  stream.underruns = 0;
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe('voice tier', () => {
  describe('auto', () => {
    it('speaks through Kokoro when Kokoro can voice the line', async () => {
      const line = speakLine('Hello there', 'mavea');
      await expect(line.started).resolves.toBe(true);
      await expect(line.finished).resolves.toBe(true);
      expect(kokoro.lines).toEqual(['Hello there']);
      expect(web.lines).toEqual([]);
    });

    it('hands the line to the browser voice when Kokoro never becomes audible', async () => {
      // The case this tier exists for: the container is missing, or the machine cannot render
      // speech fast enough for it to play. Silence used to be the answer.
      kokoro.audible = false;
      const line = speakLine('Hello there', 'mavea');
      await expect(line.finished).resolves.toBe(true);
      expect(web.lines).toEqual(['Hello there']);
    });

    it('reports started from whichever voice actually spoke, not from Kokoro', async () => {
      // The reveal walk holds each spotlight on `started`. If a failed Kokoro line reported
      // started=false while the browser voice then spoke it, the walk would run ahead of the audio.
      kokoro.audible = false;
      const line = speakLine('Hello there', 'mavea');
      await expect(line.started).resolves.toBe(true);
    });

    it('settles started before finished on the fallback path', async () => {
      kokoro.audible = false;
      const order: string[] = [];
      const line = speakLine('Hello there', 'mavea');
      const a = line.started.then(() => order.push('started'));
      const b = line.finished.then(() => order.push('finished'));
      await Promise.all([a, b]);
      expect(order).toEqual(['started', 'finished']);
    });

    it('skips Kokoro entirely once the probe says it is unavailable', async () => {
      // Known-down means every line would otherwise pay a doomed attempt before falling back.
      kokoro.known = false;
      await speakLine('Hello there', 'mavea').finished;
      expect(kokoro.lines).toEqual([]);
      expect(web.lines).toEqual(['Hello there']);
    });

    it('stops using Kokoro once playback has proven it cannot keep up', async () => {
      // The 2017-Mac case, and the one no health probe can see: Kokoro is reachable and answering,
      // it simply renders slower than speech plays, so every line stutters and drifts behind the
      // words. Reachability says yes; the audio says no. The audio is right.
      stream.underruns = 2;
      await speakLine('Hello there', 'mavea').finished;
      expect(kokoro.lines).toEqual([]);
      expect(web.lines).toEqual(['Hello there']);
    });

    it('tolerates a single stutter — a cold model load is not a slow machine', async () => {
      stream.underruns = 1;
      await speakLine('Hello there', 'mavea').finished;
      expect(kokoro.lines).toEqual(['Hello there']);
      expect(web.lines).toEqual([]);
    });

    it('falls through to captions when neither voice can speak', async () => {
      kokoro.audible = false;
      web.available = false;
      const line = speakLine('Hello there', 'mavea');
      await expect(line.started).resolves.toBe(false);
      await expect(line.finished).resolves.toBe(false);
      expect(web.lines).toEqual([]);
    });
  });

  describe('overrides', () => {
    it('forces the browser voice even where Kokoro is available', async () => {
      setVoiceMode('browser');
      await speakLine('Hello there', 'mavea').finished;
      expect(kokoro.lines).toEqual([]);
      expect(web.lines).toEqual(['Hello there']);
    });

    it('forces Kokoro even where the probe says it is down, and does not fall back', async () => {
      // "I know, do it anyway." An override that quietly re-routed would be a lie about which
      // voice is speaking, and would hide the very problem the person is trying to diagnose.
      setVoiceMode('kokoro');
      kokoro.known = false;
      kokoro.audible = false;
      const line = speakLine('Hello there', 'mavea');
      await expect(line.finished).resolves.toBe(false);
      expect(kokoro.lines).toEqual(['Hello there']);
      expect(web.lines).toEqual([]);
    });

    it('round-trips through storage and defaults to auto', () => {
      expect(voiceMode()).toBe('auto');
      setVoiceMode('browser');
      expect(voiceMode()).toBe('browser');
      setVoiceMode('auto');
      expect(voiceMode()).toBe('auto');
    });
  });

  it('cancels both voices — a line may be mid-handoff between them', () => {
    cancelSpeech();
    expect(kokoro.cancelled).toBe(1);
    expect(web.cancelled).toBe(1);
  });
});
