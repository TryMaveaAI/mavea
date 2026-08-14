// A slow transcriber is not a missing one. whisper.cpp on a CPU box takes 15-17s to return one
// second of audio (measured on the machine that reported this), and the first attempt of a session
// was given 3.5s — so every utterance timed out and the user was told local transcription was
// "still starting or unavailable", permanently, with the transcriber running the whole time.
//
// The 3.5s leash was there to stop a MISSING service from stalling the turn. But a missing service
// does not stall: the fetch rejects in milliseconds (connection refused, or the dev proxy's own
// error), which is what actually catches absence. The window only has to be longer than a real
// local model takes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { whisperWindowMs } from '../src/voice/VadVoice';

const SOURCE = readFileSync(resolve(import.meta.dirname, '../src/voice/VadVoice.ts'), 'utf8');
/** Slowest local transcription observed, for one second of audio, warm. */
const MEASURED_SLOW_MS = 17_000;

describe('whisper transcription window', () => {
  it("gives a first utterance longer than a slow local model's real latency", () => {
    expect(whisperWindowMs(false)).toBeGreaterThan(MEASURED_SLOW_MS);
  });

  it('gives a proven transcriber more room still, for long utterances', () => {
    expect(whisperWindowMs(true)).toBeGreaterThan(whisperWindowMs(false));
  });

  it('keeps one request per utterance — absence is caught by the rejection, not a probe', () => {
    expect(SOURCE).toContain("fetch('/stt/inference'");
    expect(SOURCE).not.toContain('pingWhisper');
    expect(SOURCE).toContain('const timeoutMs = whisperWindowMs(this.whisperOk === true);');
  });
});
