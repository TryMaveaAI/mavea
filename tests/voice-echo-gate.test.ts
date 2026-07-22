// The always-on mic must not submit Mavéa's own spoken answer as a user turn. VadVoice's echo
// gate (setMaveaSpeaking) is what prevents that self-talk loop: while Mavéa is speaking — and for a
// short tail after — any final transcript is treated as TTS bleed and dropped, while a genuine
// utterance outside that window passes through. These tests exercise the gate through the
// WebSpeech fallback path (VAD forced to fail), which is the same gate the VAD path applies.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force the dynamic Silero import to throw so VadVoice drops to its WebSpeech fallback — the
// path we can drive deterministically in jsdom (no WASM, no real mic).
vi.mock('@ricky0123/vad-web', () => ({
  get MicVAD(): never {
    throw new Error('no VAD in test');
  },
}));

// A controllable SpeechRecognition stand-in: tests call emitFinal() to simulate the browser
// delivering a finalized transcript, exactly as Chrome would while the mic is open.
class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  emitFinal(transcript: string): void {
    // Shape mirrors SpeechRecognitionEvent: results[i] is an array-like result whose [0] holds
    // the alternative, plus an isFinal flag.
    const result = Object.assign([{ transcript }], { isFinal: true });
    this.onresult?.({ results: Object.assign([result], { length: 1 }) });
  }
}

let recognizers: FakeRecognition[] = [];

beforeEach(() => {
  recognizers = [];
  // window.SpeechRecognition / webkitSpeechRecognition — VadVoice picks whichever exists.
  (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
    function () {
      const r = new FakeRecognition();
      recognizers.push(r);
      return r;
    };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  vi.useRealTimers();
});

// Build a VadVoice already dropped into its WebSpeech-fallback mode, with the single recognizer
// it wired up returned for the test to drive.
async function makeFallbackVoice(): Promise<{
  voice: import('../src/voice/VadVoice').VadVoice;
  rec: FakeRecognition;
  results: string[];
}> {
  const { VadVoice } = await import('../src/voice/VadVoice');
  const voice = new VadVoice();
  const results: string[] = [];
  voice.onResult((r) => results.push(r.transcript));
  // start() kicks loadVad(), which awaits the (throwing) dynamic import, flips to the fallback,
  // and rewires onresult to the result-emitting handler. Wait until that rewire + the second
  // start() (the fallback re-entry) have happened.
  voice.start();
  await vi.waitFor(() => expect(recognizers[0]?.start.mock.calls.length ?? 0).toBeGreaterThan(0));
  return { voice, rec: recognizers[0], results };
}

describe('VadVoice echo gate', () => {
  it('submits a genuine utterance when Mavéa is not speaking', async () => {
    const { rec, results } = await makeFallbackVoice();
    rec.emitFinal('what is a black hole');
    expect(results).toEqual(['what is a black hole']);
  });

  it('drops a transcript that lands while Mavéa is speaking (TTS echo)', async () => {
    const { voice, rec, results } = await makeFallbackVoice();
    voice.setMaveaSpeaking(true);
    rec.emitFinal('a black hole is a region of spacetime'); // Mavéa's own answer bleeding back
    expect(results).toEqual([]);
  });

  it('keeps dropping through the echo tail after Mavéa stops, then accepts again', async () => {
    const { voice, rec, results } = await makeFallbackVoice();
    vi.useFakeTimers();

    voice.setMaveaSpeaking(true);
    voice.setMaveaSpeaking(false); // playback ended — tail window opens
    rec.emitFinal('where gravity is so strong'); // trailing echo within the tail
    expect(results).toEqual([]);

    vi.advanceTimersByTime(700); // past ECHO_TAIL_MS (600)
    rec.emitFinal('tell me more'); // the user's real next turn
    expect(results).toEqual(['tell me more']);
  });
});
