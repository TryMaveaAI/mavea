import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureTourDashboard } from '../src/tour/dashboardSeed';
import { loadTourCorpus } from '../src/tour/corpus';
import { clearDashboards, getDashboards } from '../src/live/dashboards/store';

// ensureTourDashboard reads the corpus synchronously; on the surface the driver's corpusReady
// gate guarantees it has loaded before the chapter fires — mirror that here.
beforeAll(() => loadTourCorpus());

// Regression coverage for chapter 15 ("dashboards", "Track it live"): the coach line claims "I'll
// turn it into a living dashboard that keeps itself up to date" — but createBlankDashboard
// defaults to a manual (off) cadence, and the chapter now flips its takeover to the real Settings
// panel to show the refresh control backing that claim. Showing "Manual" there would read as the
// opposite of "keeps itself up to date", so ensureTourDashboard must give the seeded dashboard a
// real, live cadence rather than the blank default.
describe('ensureTourDashboard — the seeded dashboard actually keeps itself up to date', () => {
  beforeEach(() => clearDashboards());

  it('seeds a live data-refresh cadence, not the manual default', () => {
    const id = ensureTourDashboard();
    expect(id).not.toBeNull();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash).toBeDefined();
    expect(dash?.cadence.data).not.toBe('manual');
  });

  it('seeds a live AI-analysis cadence too', () => {
    const id = ensureTourDashboard();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash?.cadence.ai).not.toBe('manual');
  });

  it('sets a real next-due clock consistent with the seeded cadence (not the manual sentinel)', () => {
    const id = ensureTourDashboard();
    const dash = getDashboards().find((d) => d.id === id);
    expect(dash?.nextDataAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(dash?.nextDataAt).toBeGreaterThan(dash?.createdAt ?? 0);
  });

  it('is idempotent — a second call finds the same, already-live-cadenced dashboard', () => {
    const first = ensureTourDashboard();
    const second = ensureTourDashboard();
    expect(second).toBe(first);
    const dash = getDashboards().find((d) => d.id === second);
    expect(dash?.cadence.data).not.toBe('manual');
  });
});
