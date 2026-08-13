// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kokoro = vi.hoisted(() => ({
  audible: true,
  lines: [] as string[],
  cancelled: 0,
}));

vi.mock('../src/voice/kokoro', () => ({
  speakKokoroLine: (text: string) => {
    kokoro.lines.push(text);
    return {
      started: Promise.resolve(kokoro.audible),
      finished: Promise.resolve(kokoro.audible),
    };
  },
  primeKokoroLine: vi.fn(),
  cancelKokoro: () => void kokoro.cancelled++,
  kokoroSpeaking: () => false,
  kokoroSynthesizing: () => false,
  subscribeKokoroSpeaking: () => () => {},
}));

const { speakLine, cancelSpeech } = await import('../src/voice/tts');

beforeEach(() => {
  kokoro.audible = true;
  kokoro.lines = [];
  kokoro.cancelled = 0;
  localStorage.clear();
});

describe('commercially controlled voice tier', () => {
  it('uses the reviewed local Kokoro service', async () => {
    const line = speakLine('Hello there', 'mavea');

    await expect(line.started).resolves.toBe(true);
    await expect(line.finished).resolves.toBe(true);
    expect(kokoro.lines).toEqual(['Hello there']);
  });

  it('falls through to captions when Kokoro cannot voice a line', async () => {
    kokoro.audible = false;
    const line = speakLine('Hello there', 'mavea');

    await expect(line.started).resolves.toBe(false);
    await expect(line.finished).resolves.toBe(false);
    expect(kokoro.lines).toEqual(['Hello there']);
  });

  it('does not honor a stale browser-engine override', async () => {
    localStorage.setItem('mavea-voice-mode', 'browser');

    await speakLine('Hello there', 'mavea').finished;
    expect(kokoro.lines).toEqual(['Hello there']);
  });

  it('cancels the local voice queue', () => {
    cancelSpeech();
    expect(kokoro.cancelled).toBe(1);
  });
});
