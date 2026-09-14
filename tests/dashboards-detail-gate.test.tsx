// A dashboard's two header actions both gate on the same search readiness, and both used to render
// their own copy of the reason as an inline sibling in the header's flex row. So the sentence
// explaining the toolbar printed twice, once wedged between the very buttons it was about, while
// the buttons themselves stayed pressable and did nothing. This pins the shape that replaced it:
// one reason, on its own line under the controls, with the blocked buttons actually reading as
// blocked — plus the two things a reader reported next, which are the same defect one layer in.
// A press has to SAY what it did (a routine answering 'done' or 'busy' used to resolve to nothing
// on screen, which is indistinguishable from a dead button), and the two actions have to read as
// different things (they were "Refresh now" and "Read the numbers now", which name no difference).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';
import type { SearchReadiness } from '../src/live/dashboards/searchReadiness';

const dashboard = {
  id: 'd1',
  title: 'WTI & Brent Crude Prices',
  question: 'What are crude prices doing?',
  thesis: { text: 'Tracking crude.', saidAt: 0 },
  tripwires: [],
  metrics: [
    {
      id: 'm1',
      label: 'WTI',
      query: 'WTI spot price',
      unit: 'USD',
      sourceQuote: { text: 'WTI', saidAt: 0 },
      lastValue: null,
      origin: 'search',
    },
  ],
  sources: [],
  widgets: [],
  cadence: { data: 'hourly', ai: 'on-change' },
  smartTrigger: false,
  alerts: { inApp: true, push: false },
  createdAt: 0,
  updatedAt: 0,
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
} as unknown as Dashboard;

const readiness = vi.hoisted(() => ({
  value: { ok: false, reason: 'search-off' } as SearchReadiness,
}));

vi.mock('../src/canvas/blocks/loader', () => ({ preloadBlockFamilies: vi.fn() }));
vi.mock('../src/live/dashboards/useDashboards', () => ({ useDashboards: () => [dashboard] }));
vi.mock('../src/live/dashboards/store', () => ({
  removeWidget: vi.fn(),
  setWidgetOrder: vi.fn(),
  setWidgetSpan: vi.fn(),
}));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: vi.fn(),
  readDashboardNow: vi.fn(),
  useDataPending: () => false,
}));
vi.mock('../src/live/useLiveConfig', () => ({ useLiveConfig: () => [{}, vi.fn()] }));
// The sentence itself stays the product's own — only the verdict is steered.
vi.mock('../src/live/dashboards/searchReadiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/dashboards/searchReadiness')>()),
  searchReadiness: () => readiness.value,
}));
vi.mock('../src/live/dashboards/WidgetTile', () => ({ WidgetTile: () => null }));
vi.mock('../src/live/dashboards/AddWidgetPalette', () => ({ AddWidgetPalette: () => null }));
vi.mock('../src/live/dashboards/MetricFill', () => ({ MetricFill: () => null }));
vi.mock('../src/live/dashboards/TalkToDashboard', () => ({ TalkToDashboard: () => null }));
vi.mock('../src/live/dashboards/DetailHero', () => ({ DetailHero: () => null }));
vi.mock('../src/live/dashboards/LastCheckCard', () => ({ LastCheckCard: () => null }));
vi.mock('../src/live/dashboards/CadenceCard', () => ({ CadenceCard: () => null }));
vi.mock('../src/live/dashboards/AlertCard', () => ({ AlertCard: () => null }));
vi.mock('../src/live/dashboards/CheckLogRail', () => ({ CheckLogRail: () => null }));
vi.mock('../src/live/dashboards/RememberKeyNudge', () => ({ RememberKeyNudge: () => null }));

const { DashboardDetail } = await import('../src/live/dashboards/DashboardDetail');
const { searchBlockHref, searchBlockLine } = await import('../src/live/dashboards/searchReadiness');
const loop = await import('../src/live/dashboards/useDashboardLoop');

afterEach(() => {
  cleanup();
  readiness.value = { ok: false, reason: 'search-off' };
});

describe('DashboardDetail — a blocked toolbar', () => {
  it('gives the reason once, under the controls rather than between them', () => {
    const { container } = render(<DashboardDetail id="d1" />);
    const said = screen.getAllByText(searchBlockLine('search-off'), { exact: false });
    expect(said).toHaveLength(1);
    const notices = container.querySelector('.dash-detail-notices');
    expect(notices).toBeTruthy();
    expect(notices!.textContent).toContain(searchBlockLine('search-off'));
    // Last in the header, so nothing the reader acts on is pushed below the explanation.
    expect(notices!.parentElement?.lastElementChild).toBe(notices);
    expect(notices!.getAttribute('role')).toBe('status');
    // Lands on the Web search row, not Live's front door — the reader did not know the setting
    // existed, so "go to Live" is the sentence's problem restated rather than answered.
    expect(notices!.querySelector('a')?.getAttribute('href')).toBe(searchBlockHref('search-off'));
  });

  it('shows both actions as blocked instead of letting a press do nothing', () => {
    const { container } = render(<DashboardDetail id="d1" />);
    const refresh = container.querySelector<HTMLButtonElement>('.dash-refresh-btn');
    const read = container.querySelector<HTMLButtonElement>('.dash-read-btn');
    expect(refresh?.disabled).toBe(true);
    expect(read?.disabled).toBe(true);
    expect(refresh?.title).toBe(searchBlockLine('search-off'));
    expect(read?.title).toBe(searchBlockLine('search-off'));
  });

  it('leaves both actions live and says nothing once search is ready', () => {
    readiness.value = { ok: true };
    const { container } = render(<DashboardDetail id="d1" />);
    expect(container.querySelector('.dash-detail-notices')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.dash-refresh-btn')?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('.dash-read-btn')?.disabled).toBe(false);
  });
});

describe('DashboardDetail — the two actions are told apart', () => {
  // One fetches numbers, the other writes about the numbers already on screen. Named "Refresh"
  // and "Read the numbers" they were two words for the same guess, and a reader who cannot tell
  // them apart cannot tell which one to pay for.
  it('says what each action does, in different words', () => {
    readiness.value = { ok: true };
    const { container } = render(<DashboardDetail id="d1" />);
    const refresh = container.querySelector<HTMLButtonElement>('.dash-refresh-btn')!;
    const read = container.querySelector<HTMLButtonElement>('.dash-read-btn')!;
    expect(refresh.textContent).not.toBe(read.textContent);
    expect(refresh.title).not.toBe(read.title);
    // The distinction itself, not merely two different strings: one goes and gets values, the
    // other interprets what is already there.
    expect(refresh.title).toMatch(/search the web/i);
    expect(read.title).toMatch(/not new numbers/i);
  });
});

describe('DashboardDetail — a press reports what it did', () => {
  const press = async (sel: string): Promise<HTMLElement> => {
    readiness.value = { ok: true };
    const { container } = render(<DashboardDetail id="d1" />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>(sel)!.click();
    });
    return container as unknown as HTMLElement;
  };

  it('confirms a check that came back, rather than resolving to silence', async () => {
    vi.mocked(loop.refreshDashboardNow).mockResolvedValue('done');
    const container = await press('.dash-refresh-btn');
    expect(container.querySelector('.dash-detail-notices')?.textContent ?? '').toMatch(/checked/i);
  });

  it('says a check is already running instead of looking ignored', async () => {
    vi.mocked(loop.refreshDashboardNow).mockResolvedValue('busy');
    const container = await press('.dash-refresh-btn');
    expect(container.querySelector('.dash-detail-notices')?.textContent ?? '').toMatch(
      /already being checked/i,
    );
  });

  it('points at the written take a read produced', async () => {
    vi.mocked(loop.readDashboardNow).mockResolvedValue('done');
    const container = await press('.dash-read-btn');
    expect(container.querySelector('.dash-detail-notices')?.textContent ?? '').toMatch(/below/i);
  });
});
