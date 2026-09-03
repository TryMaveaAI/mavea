import { describe, it, expect } from 'vitest';
import { formatValue, formatPercent, formatDate, withUnit } from '../src/canvas/lib/format';

// All tests pin the en-US locale so separators/symbols are deterministic in CI.
const L = 'en-US';

describe('formatValue', () => {
  it('separates value and unit with a space — the hours9 fix', () => {
    expect(formatValue(9, { unit: 'hours', locale: L })).toBe('9 hours');
    // The defect was bare concatenation; assert the space (NBSP) is present.
    expect(formatValue(9, { unit: 'hours', locale: L })).not.toBe('9hours');
  });
  it('adds thousands separators', () => {
    expect(formatValue(1234567, { locale: L })).toBe('1,234,567');
  });
  it('respects a fixed decimal count', () => {
    expect(formatValue(1234.5, { decimals: 0, locale: L })).toBe('1,235');
    expect(formatValue(3, { decimals: 2, locale: L })).toBe('3.00');
  });
  it('renders currency', () => {
    expect(formatValue(2500, { currency: 'USD', locale: L })).toBe('$2,500.00');
  });
  it('renders compact notation for large magnitudes', () => {
    expect(formatValue(1_200_000, { compact: true, locale: L })).toBe('1.2M');
  });
  it('renders a percent', () => {
    expect(formatValue(42, { percent: true, locale: L })).toBe('42%');
  });
  it('returns an em dash for non-finite input', () => {
    expect(formatValue(NaN)).toBe('—');
    expect(formatValue(Infinity)).toBe('—');
  });
});

describe('withUnit', () => {
  it('suffixes a word unit with a space — the "Millions1000" fix', () => {
    const out = withUnit(1000, 'Millions', { locale: L });
    expect(out).toMatch(/^1,000\sMillions$/);
    expect(out).not.toBe('Millions1000');
    expect(out).not.toBe('Millions1,000');
  });
  it('prefixes a currency symbol and suffixes percent tight', () => {
    expect(withUnit(1000, '$', { locale: L })).toBe('$1,000');
    expect(withUnit(50, '%', { locale: L })).toBe('50%');
  });
  it('carries a currency unit’s magnitude to the far side of the digits', () => {
    // A unit that merely STARTS with a symbol used to be pasted on whole, so the living world's
    // "$bn" figures reached the screen as "$bn1,900" — and the seed world prints eighteen of them.
    expect(withUnit(1900, '$bn', { locale: L })).toBe('$1,900bn');
    expect(withUnit(12, '$k', { locale: L })).toBe('$12k');
    expect(withUnit(30, '$/mo', { locale: L })).toBe('$30/mo');
    expect(withUnit(4, '£m', { locale: L })).toBe('£4m');
  });
  it('returns a bare formatted number when there is no unit', () => {
    expect(withUnit(1234, undefined, { locale: L })).toBe('1,234');
    expect(withUnit(1234, '  ', { locale: L })).toBe('1,234');
  });
});

describe('formatPercent', () => {
  it('treats a 0–1 ratio and a 0–100 value alike', () => {
    expect(formatPercent(0.42, { locale: L })).toBe('42%');
    expect(formatPercent(42, { locale: L })).toBe('42%');
  });
  it('supports decimals', () => {
    expect(formatPercent(0.425, { decimals: 1, locale: L })).toBe('42.5%');
  });
});

describe('formatDate', () => {
  const d = new Date('2026-06-08T15:04:00Z');
  it('formats at preset granularities', () => {
    expect(formatDate(d, { style: 'year', locale: L })).toBe('2026');
    expect(formatDate(d, { style: 'month', locale: L })).toBe('Jun 2026');
  });
  it('accepts epoch ms and ISO strings', () => {
    expect(formatDate(d.getTime(), { style: 'year', locale: L })).toBe('2026');
    expect(formatDate('2026-06-08', { style: 'year', locale: L })).toBe('2026');
  });
  it('returns an em dash for invalid input', () => {
    expect(formatDate('not a date')).toBe('—');
  });
});
