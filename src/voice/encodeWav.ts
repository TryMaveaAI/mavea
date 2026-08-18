// Encode a Float32Array audio buffer (mono, arbitrary sample rate) to a raw
// PCM WAV ArrayBuffer. Used to hand VAD-captured audio to Whisper for
// transcription — Whisper's /v1/audio/transcriptions endpoint accepts WAV.

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // 16-bit mono

/** Samples encoded between yields. The encode runs at the exact moment the "transcribing"
 *  indicator should start animating, so a long utterance must not hold the main thread for one
 *  long block: 24 000 samples is 1.5 s of 16 kHz capture — a few tenths of a millisecond of
 *  Int16 conversion, so no single chunk can cost a frame, and a short utterance is done in one. */
const CHUNK_SAMPLES = 24_000;

function writeHeader(view: DataView, numSamples: number, sampleRate: number): void {
  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF/WAVE header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * BYTES_PER_SAMPLE, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate (16-bit mono)
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * BYTES_PER_SAMPLE, true);
}

/** Float32 → Int16 PCM for samples [from, to). The one place the conversion lives, so the
 *  chunked encoder cannot drift from the single-pass one by so much as a rounding rule. */
function writeSamples(view: DataView, samples: Float32Array, from: number, to: number): void {
  let offset = HEADER_BYTES + from * BYTES_PER_SAMPLE;
  for (let i = from; i < to; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += BYTES_PER_SAMPLE;
  }
}

function newWav(numSamples: number, sampleRate: number): { buffer: ArrayBuffer; view: DataView } {
  const buffer = new ArrayBuffer(HEADER_BYTES + numSamples * BYTES_PER_SAMPLE);
  const view = new DataView(buffer);
  writeHeader(view, numSamples, sampleRate);
  return { buffer, view };
}

/** Encode the whole buffer in one pass. */
export function floatToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const { buffer, view } = newWav(samples.length, sampleRate);
  writeSamples(view, samples, 0, samples.length);
  return buffer;
}

/** Hand the main thread back between chunks. `scheduler.yield()` returns at the FRONT of the task
 *  queue (the encode resumes as soon as the browser has painted); the MessageChannel fallback is
 *  an ordinary macrotask without setTimeout's 4 ms clamp, which on a 90 s utterance is the
 *  difference between a few milliseconds of yielding and a fifth of a second. */
function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (): void => {
        // Both ports are closed here, not on some later teardown: an open port keeps the channel
        // (and this closure) alive, and one utterance can open dozens of them.
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The same bytes as `floatToWav`, encoded across frames instead of in one blocking pass — the
 * encode happens exactly when the surface flips to "transcribing", so it must not be what stalls
 * the indicator it is announcing. Yields only BETWEEN chunks: a short utterance costs a single
 * microtask, and the 90 s cap hands the frame back ~60 times instead of once at the end.
 * `yieldControl` is injectable so tests can step it deterministically.
 */
export async function floatToWavChunked(
  samples: Float32Array,
  sampleRate: number,
  yieldControl: () => Promise<void> = yieldToBrowser,
): Promise<ArrayBuffer> {
  const { buffer, view } = newWav(samples.length, sampleRate);
  for (let from = 0; from < samples.length; from += CHUNK_SAMPLES) {
    if (from > 0) await yieldControl();
    writeSamples(view, samples, from, Math.min(from + CHUNK_SAMPLES, samples.length));
  }
  return buffer;
}
