import { describe, it, expect } from 'vitest';
import { hostOf, safeHttpUrl, safeContactUrl } from '../src/lib/sourceHost';

// The one link-safety gate for model- and search-supplied URLs. React refuses javascript:
// hrefs at the DOM layer, but that is renderer courtesy — these tests pin the guarantee
// as ours: nothing beyond http(s) (and, for contact links, dialable tel:/sms:) is ever
// returned as clickable.

describe('hostOf', () => {
  it('returns the bare display host', () => {
    expect(hostOf('https://www.gartner.com/x/y')).toBe('gartner.com');
    expect(hostOf('http://en.wikipedia.org/wiki/X')).toBe('en.wikipedia.org');
  });

  it('returns null for unparseable input', () => {
    expect(hostOf('not a url')).toBeNull();
  });
});

describe('safeHttpUrl', () => {
  it('passes plain http(s) through', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('rejects every other scheme and junk', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});

describe('safeContactUrl', () => {
  it('accepts real dial strings', () => {
    expect(safeContactUrl('tel:+14155550123')).toBe('tel:+14155550123');
    expect(safeContactUrl('sms:988')).toBe('sms:988');
    expect(safeContactUrl('tel:1-800-273-8255')).toBe('tel:1-800-273-8255');
  });

  it('normalizes the scheme and surrounding whitespace', () => {
    expect(safeContactUrl('TEL:988')).toBe('tel:988');
    expect(safeContactUrl('  sms:741741  ')).toBe('sms:741741');
  });

  it('rejects active schemes and non-dialable targets', () => {
    expect(safeContactUrl('javascript:alert(1)')).toBeNull();
    expect(safeContactUrl('tel:<script>alert(1)</script>')).toBeNull();
    expect(safeContactUrl('sms:988?body=hi')).toBeNull();
    expect(safeContactUrl('tel:')).toBeNull();
    expect(safeContactUrl('tel:---')).toBeNull(); // separators but no digits
    expect(safeContactUrl('tel:1234567890123456789012345')).toBeNull(); // longer than any number
  });

  it('delegates everything non-contact to the http(s) gate', () => {
    expect(safeContactUrl('https://988lifeline.org/')).toBe('https://988lifeline.org/');
    expect(safeContactUrl('mailto:x@y.z')).toBeNull();
    expect(safeContactUrl('not a url')).toBeNull();
  });
});
