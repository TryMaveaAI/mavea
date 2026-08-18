import { describe, expect, it } from 'vitest';
import { pcmToWavBytes } from '../src/live/scrubvoice/wav';

// The scrubber replays through an <audio> element so playback speed can change with the pitch
// held natural; that needs a real WAV wrapper around the captured Int16 PCM. These assert the
// RIFF/fmt/data header is well-formed and the data chunk is the source ints, untouched.

const ascii = (view: DataView, offset: number, len: number): string =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

describe('pcmToWavBytes', () => {
  it('writes a valid 16-bit mono PCM WAV header', () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767]);
    const view = new DataView(pcmToWavBytes(pcm, 24000));

    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');

    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    const dataSize = pcm.length * 2;
    expect(view.getUint32(40, true)).toBe(dataSize); // data chunk size
    expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF size
    expect(view.byteLength).toBe(44 + dataSize);
  });

  it('writes the source ints verbatim — the data chunk IS what was heard', () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    const view = new DataView(pcmToWavBytes(pcm, 16000));
    const sampleAt = (i: number): number => view.getInt16(44 + i * 2, true);

    for (let i = 0; i < pcm.length; i++) expect(sampleAt(i)).toBe(pcm[i]);
  });
});
