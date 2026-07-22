// estimateSearchesPerMonth — the plan review's honest "≈ N searches/mo on your key" line. Pure
// projection off the same DATA_CADENCE_MIN table the refresh loop itself schedules against, so the
// number shown is exactly what the chosen cadence really costs, not a separately-guessed figure.
import { describe, expect, it } from 'vitest';
import { estimateSearchesPerMonth } from '../src/live/dashboards/cadence';

describe('estimateSearchesPerMonth', () => {
  it('projects a 15-minute cadence to 2880 checks a month', () => {
    expect(estimateSearchesPerMonth('15min')).toBe(2880);
  });
  it('projects an hourly cadence to 720 checks a month', () => {
    expect(estimateSearchesPerMonth('hourly')).toBe(720);
  });
  it('projects a 6-hour cadence to 120 checks a month', () => {
    expect(estimateSearchesPerMonth('6h')).toBe(120);
  });
  it('projects a daily cadence to 30 checks a month', () => {
    expect(estimateSearchesPerMonth('daily')).toBe(30);
  });
  it('costs zero on manual — it only refreshes when asked', () => {
    expect(estimateSearchesPerMonth('manual')).toBe(0);
  });
});
