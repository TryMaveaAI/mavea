import { describe, expect, it } from 'vitest';
import { usageEstimate, USAGE_LABEL } from '../src/live/dashboards/cost';
import type { Cadence } from '../src/live/dashboards/types';

// Usage AWARENESS, not a price tag: no dollar amounts, no projected call counts (the real cost
// depends on the user's connected model + their provider's pricing, which only they can verify).
// We assert the qualitative level, the honest labels, and a warning that points them at their key.

const cad = (data: Cadence['data'], ai: Cadence['ai']): Cadence => ({ data, ai });

describe('usageEstimate', () => {
  it('a fully user-supplied dashboard with no schedule + no smart trigger spends NOTHING', () => {
    const u = usageEstimate(cad('15min', 'on-change'), false, 0);
    expect(u.level).toBe('none');
    expect(u.usesKey).toBe(false);
    expect(u.dataLabel).toMatch(/free/i);
    expect(u.warning).toMatch(/nothing runs on its own/i);
  });

  it('a smart trigger alone reaches for the key (the verdict is a real call)', () => {
    const u = usageEstimate(cad('manual', 'on-change'), true, 0);
    expect(u.usesKey).toBe(true);
    expect(u.aiLabel).toMatch(/line is crossed/i);
  });

  it('frequent data fetches + a daily schedule read as the heaviest band', () => {
    const u = usageEstimate(cad('15min', 'daily'), true, 2);
    expect(u.level).toBe('frequent');
    expect(u.usesKey).toBe(true);
    expect(u.warning).toMatch(/provide the API key and pay that provider directly/i);
    expect(u.warning).toMatch(/every scheduled run/i);
  });

  it('labels reflect the chosen cadence', () => {
    expect(usageEstimate(cad('hourly', 'manual'), false, 1).dataLabel).toMatch(/hourly/i);
    expect(usageEstimate(cad('hourly', 'daily'), false, 1).aiLabel).toBe('Daily');
  });

  it('NEVER emits a dollar amount or a number in its warning', () => {
    for (const ai of ['daily', 'weekly', 'on-change', 'manual'] as const) {
      for (const smart of [true, false]) {
        const u = usageEstimate(cad('hourly', ai), smart, 2);
        expect(u.warning).not.toMatch(/\$|\d/); // no figures, ever
      }
    }
  });

  it('exposes a readable band label for each level, scoped to AUTOMATIC usage only', () => {
    expect(USAGE_LABEL.none).toMatch(/no automatic api/i);
    expect(USAGE_LABEL.frequent).toMatch(/frequent/i);
  });

  it('never implies manual actions (refresh/ask/add) are free — that is a separate, real cost', () => {
    const u = usageEstimate(cad('manual', 'manual'), false, 0);
    expect(u.warning).toMatch(/explicitly pull in a conversation/i);
  });
});
