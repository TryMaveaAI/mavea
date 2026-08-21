// The tolerant JSON parser is the one thing standing between a model's stray prose and a reader
// staring at a parser's own error text. It earns that place only by NEVER throwing, so these lock
// the never-throws contract alongside the recoveries — the previous hand-rolled copies in
// deepzoom/generate.ts and course/generateCourse.ts recovered the same shapes but ran their fallback
// parse outside any try, which is how "Unexpected non-whitespace character after JSON at position
// 4839" reached the zoom screen instead of an honest "couldn't build it".
import { describe, it, expect } from 'vitest';
import { parseLooseJson, parseLooseJsonObject } from '../src/live/ground/json';

describe('parseLooseJson', () => {
  it('parses clean JSON unchanged', () => {
    expect(parseLooseJson('{"levels":[1,2]}')).toEqual({ levels: [1, 2] });
  });

  it('passes a non-string through untouched, for constrained-decoding adapters', () => {
    const already = { levels: [1] };
    expect(parseLooseJson(already)).toBe(already);
  });

  it('peels a ```json fence', () => {
    expect(parseLooseJson('```json\n{"levels":[1]}\n```')).toEqual({ levels: [1] });
  });

  it('peels surrounding prose', () => {
    expect(parseLooseJson('Here you go: {"levels":[1]}. Hope that helps!')).toEqual({
      levels: [1],
    });
  });

  // The regression. Two objects back to back make the first-brace-to-LAST-brace slice span both,
  // and parsing that span throws the exact message the zoom screen showed.
  it('recovers the first object when the model emits two back to back', () => {
    expect(parseLooseJson('{"levels":[1]}\n{"levels":[2]}')).toEqual({ levels: [1] });
  });

  it('recovers the first object when a second is fenced separately', () => {
    const raw = '```json\n{"rangeStart":"a","levels":[1]}\n```\n```json\n{"levels":[2]}\n```';
    expect(parseLooseJson(raw)).toEqual({ rangeStart: 'a', levels: [1] });
  });

  it('does not let a brace inside a string close the object early', () => {
    expect(parseLooseJson('{"title":"a } brace","n":1}\n{"x":2}')).toEqual({
      title: 'a } brace',
      n: 1,
    });
  });

  it('does not let an escaped quote end the string scan early', () => {
    expect(parseLooseJson('{"title":"say \\" } now","n":1}\n{"x":2}')).toEqual({
      title: 'say " } now',
      n: 1,
    });
  });

  it('still prefers the widest slice, so trailing prose after a nested object works', () => {
    expect(parseLooseJson('{"a":{"b":1}} — that is the shape.')).toEqual({ a: { b: 1 } });
  });

  it.each([
    ['nothing JSON-shaped', 'I could not do that.'],
    ['an unclosed object', '{"levels":[1'],
    ['an empty string', ''],
    ['a bare fence', '```json\n```'],
    ['braces that never balance', '{{{'],
  ])('returns null rather than throwing on %s', (_label, raw) => {
    expect(() => parseLooseJson(raw)).not.toThrow();
    expect(parseLooseJson(raw)).toBeNull();
  });
});

describe('parseLooseJsonObject', () => {
  it('degrades to {} instead of throwing, so callers fail their own honest way', () => {
    expect(parseLooseJsonObject('I could not do that.')).toEqual({});
    expect(parseLooseJsonObject('{"levels":[1')).toEqual({});
  });

  it('degrades a non-object payload to {}', () => {
    expect(parseLooseJsonObject('42')).toEqual({});
    expect(parseLooseJsonObject('"just a string"')).toEqual({});
  });

  it('keeps a recovered object', () => {
    expect(parseLooseJsonObject('{"levels":[1]}\n{"levels":[2]}')).toEqual({ levels: [1] });
  });
});
