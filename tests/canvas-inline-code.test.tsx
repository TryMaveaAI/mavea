import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { withInlineCode } from '../src/canvas/lib/inlineCode';

const html = (text: string | undefined) => render(<p>{withInlineCode(text)}</p>).container;

describe('withInlineCode', () => {
  it('sets each ticked span as code and keeps the prose around it', () => {
    const p = html('Use `a < b` before `map()` runs.');
    const codes = [...p.querySelectorAll('code.inline-code')].map((c) => c.textContent);
    expect(codes).toEqual(['a < b', 'map()']);
    expect(p.textContent).toBe('Use a < b before map() runs.');
  });

  it('leaves an unpaired tick literal and never parses markup', () => {
    const p = html('a lone ` tick and <b>not bold</b>');
    expect(p.querySelector('code')).toBeNull();
    expect(p.querySelector('b')).toBeNull();
    expect(p.textContent).toBe('a lone ` tick and <b>not bold</b>');
  });

  it('passes text without ticks, and a missing field, straight through', () => {
    expect(withInlineCode('plain')).toBe('plain');
    expect(withInlineCode(undefined)).toBeUndefined();
  });
});
