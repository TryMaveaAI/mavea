import { describe, it, expect } from 'vitest';
import { presetRange } from '../src/canvas/blocks/pickers/_cal';

// Anchor (the reference "today") is fixed so results are deterministic — these pickers carry no
// real clock, so a preset resolves relative to the latest known date.
const ANCHOR = '2026-06-15'; // a Monday

describe('presetRange', () => {
  it('resolves "Last N days" inclusive of the anchor', () => {
    expect(presetRange('Last 7 days', ANCHOR)).toEqual({ a: '2026-06-09', b: '2026-06-15' });
    expect(presetRange('Last 30 days', ANCHOR)).toEqual({ a: '2026-05-17', b: '2026-06-15' });
  });
  it('resolves "This month" to the full calendar month', () => {
    expect(presetRange('This month', ANCHOR)).toEqual({ a: '2026-06-01', b: '2026-06-30' });
  });
  it('resolves week and month spans', () => {
    expect(presetRange('Last 2 weeks', ANCHOR)).toEqual({ a: '2026-06-02', b: '2026-06-15' });
    expect(presetRange('Last 3 months', ANCHOR)).toEqual({ a: '2026-03-15', b: '2026-06-15' });
  });
  it('resolves year-to-date', () => {
    expect(presetRange('Year to date', ANCHOR)).toEqual({ a: '2026-01-01', b: '2026-06-15' });
  });
  it('returns null for an unrecognized label or bad anchor', () => {
    expect(presetRange('Custom', ANCHOR)).toBeNull();
    expect(presetRange('Last 7 days', 'not-a-date')).toBeNull();
  });
});
