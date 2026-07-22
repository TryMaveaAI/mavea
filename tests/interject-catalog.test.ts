import {
  INTERJECTION_LINES,
  MOMENT_TYPES,
  MAX_LINE_LEN,
  pickLine,
} from '../src/live/interject/catalog';

describe('interjection catalog', () => {
  it('every moment type has at least one short, non-empty line', () => {
    expect(MOMENT_TYPES.length).toBeGreaterThan(0);
    for (const type of MOMENT_TYPES) {
      const lines = INTERJECTION_LINES[type];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.trim()).not.toBe('');
        expect(line.length).toBeLessThanOrEqual(MAX_LINE_LEN);
      }
    }
  });

  it("always returns a line from the moment's own set", () => {
    for (const type of MOMENT_TYPES) {
      for (let seed = 0; seed < 12; seed++) {
        expect(INTERJECTION_LINES[type]).toContain(pickLine(type, seed));
      }
    }
  });

  it('is deterministic for a given seed', () => {
    expect(pickLine('clipShared', 7)).toBe(pickLine('clipShared', 7));
  });

  it('avoids repeating the previous line back-to-back when alternatives exist', () => {
    const first = pickLine('clipShared', 0);
    expect(pickLine('clipShared', 0, first)).not.toBe(first);
  });
});
