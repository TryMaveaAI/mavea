// The WAV encode runs at the exact moment the surface flips to "transcribing", so it was moved
// off the frame — but a transcript is only as good as the bytes Whisper is handed. The chunked
// encoder must produce the single-pass bytes, sample for sample.
import { describe, expect, it, vi } from 'vitest';
import { floatToWav, floatToWavChunked } from '../src/voice/encodeWav';

const SAMPLE_RATE = 16_000;

/** Values chosen to exercise every branch of the conversion: silence, both full-scale rails, the
 *  asymmetric negative scaling, and input that has to be clamped. */
function utterance(length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = [0, 1, -1, 0.5, -0.5, 1.7, -1.7, Math.sin(i / 3)][i % 8];
  }
  return samples;
}

describe('floatToWavChunked', () => {
  it('is byte-identical to the single-pass encode at every chunk boundary', async () => {
    // Around, on, and well past the internal chunk size, plus the degenerate lengths.
    for (const length of [0, 1, 23_999, 24_000, 24_001, 60_000, 90 * SAMPLE_RATE]) {
      const samples = utterance(length);
      const chunked = new Uint8Array(await floatToWavChunked(samples, SAMPLE_RATE));
      expect(chunked).toEqual(new Uint8Array(floatToWav(samples, SAMPLE_RATE)));
      expect(chunked.byteLength).toBe(44 + length * 2);
    }
  });

  it('carries the WAV header Whisper expects', async () => {
    const view = new DataView(await floatToWavChunked(utterance(8), SAMPLE_RATE));
    const tag = (offset: number): string =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(16); // data bytes
  });

  it('never yields for an ordinary utterance, and does for a long one', async () => {
    const yieldControl = vi.fn(() => Promise.resolve());

    await floatToWavChunked(utterance(SAMPLE_RATE), SAMPLE_RATE, yieldControl);
    expect(yieldControl).not.toHaveBeenCalled(); // a short answer is one chunk of work

    await floatToWavChunked(utterance(90 * SAMPLE_RATE), SAMPLE_RATE, yieldControl);
    expect(yieldControl.mock.calls.length).toBeGreaterThan(1); // the 90s cap gives the frame back
  });

  it('leaves nothing behind when it yields for real', async () => {
    // The default yield path allocates a MessageChannel per hop; a leaked port would keep both
    // ends (and this closure) alive for the life of the tab.
    const ports: { close: ReturnType<typeof vi.fn> }[] = [];
    const NativeChannel = MessageChannel;
    vi.stubGlobal(
      'MessageChannel',
      class extends NativeChannel {
        constructor() {
          super();
          ports.push(
            ...[this.port1, this.port2].map((port) => {
              const close = vi.fn(() => MessagePort.prototype.close.call(port));
              Object.defineProperty(port, 'close', { value: close, configurable: true });
              return { close };
            }),
          );
        }
      },
    );
    try {
      await floatToWavChunked(utterance(50_000), SAMPLE_RATE);
      expect(ports.length).toBeGreaterThan(0);
      expect(ports.every((port) => port.close.mock.calls.length === 1)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
