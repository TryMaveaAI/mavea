import { describe, expect, it } from 'vitest';
import { decodePcm16 } from '../src/voice/streamTts';

// Kokoro streams signed 16-bit little-endian PCM. decodePcm16 turns each chunk into Float32
// samples in [-1, 1), carrying a half-written sample across a chunk boundary so a split read
// never drops or corrupts a sample — the bit the streaming player leans on for gapless audio.
describe('decodePcm16', () => {
  it('decodes the signed 16-bit LE extremes to [-1, 1)', () => {
    // 0x8000 = -32768 → -1.0 ; 0x7FFF = 32767 → ~+0.99997 ; 0x0000 = 0
    const chunk = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00]);
    const { samples, carry } = decodePcm16(chunk, null);
    expect(Array.from(samples)).toEqual([-1, 32767 / 32768, 0]);
    expect(carry).toBeNull();
  });

  it('carries a trailing odd byte and reconstructs the split sample on the next chunk', () => {
    // The low byte of a sample arrives at the end of one chunk, the high byte at the start of
    // the next; together they must decode to the same value as if read in one piece.
    const first = decodePcm16(new Uint8Array([0x00]), null);
    expect(first.samples.length).toBe(0);
    expect(first.carry).toBe(0x00);

    const second = decodePcm16(new Uint8Array([0x80]), first.carry);
    expect(Array.from(second.samples)).toEqual([-1]); // 0x8000 → -1.0
    expect(second.carry).toBeNull();
  });

  it('handles an odd-length chunk by emitting whole samples and carrying the remainder', () => {
    // bytes [0x10,0x20] → 0x2010 = 8208 ; 0x30 has no pair yet → carried.
    const { samples, carry } = decodePcm16(new Uint8Array([0x10, 0x20, 0x30]), null);
    expect(Array.from(samples)).toEqual([8208 / 32768]);
    expect(carry).toBe(0x30);
  });

  it('decodes a stream split into awkward chunks identically to one contiguous read', () => {
    const whole = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const oneShot = decodePcm16(whole, null).samples;

    const out: number[] = [];
    let carry: number | null = null;
    for (const chunk of [whole.slice(0, 1), whole.slice(1, 4), whole.slice(4, 5), whole.slice(5)]) {
      const r = decodePcm16(chunk, carry);
      out.push(...Array.from(r.samples));
      carry = r.carry;
    }
    expect(carry).toBeNull();
    expect(out).toEqual(Array.from(oneShot));
  });

  it('returns no samples and no carry for an empty chunk', () => {
    const { samples, carry } = decodePcm16(new Uint8Array([]), null);
    expect(samples.length).toBe(0);
    expect(carry).toBeNull();
  });

  it('preserves a pending carry across an empty chunk (never drops the split byte)', () => {
    // A zero-length read between the two halves of a sample must not lose the carried byte.
    const r = decodePcm16(new Uint8Array([]), 0x42);
    expect(r.samples.length).toBe(0);
    expect(r.carry).toBe(0x42);
  });
});
