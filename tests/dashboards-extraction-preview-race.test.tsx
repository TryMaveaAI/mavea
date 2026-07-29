// ExtractionPreview lets you pick which conversation to build from; the live session gets a real
// model extraction (async), saved canvases get an instant grounded draft (sync). Switching the
// source picker before that model call resolves must not let the OLDER call land over whatever the
// NEWER selection is showing — a race that would silently swap the visible draft back to the wrong
// conversation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import type { DashboardDraft } from '../src/live/dashboards/types';

let resolveExtract: ((d: DashboardDraft | null) => void) | null = null;

vi.mock('../src/live/dashboards/extract', () => ({
  extractDashboard: vi.fn(
    () =>
      new Promise<DashboardDraft | null>((resolve) => {
        resolveExtract = resolve;
      }),
  ),
  groundedDraft: vi.fn(() => ({
    title: 'Library canvas draft',
    thesis: { text: 'grounded from the saved canvas', saidAt: 1 },
    metrics: [],
    tripwires: [],
    suggestedWidgets: [],
  })),
  buildDashboard: vi.fn(),
  foldDraftIntoDashboard: vi.fn(),
  currentTopicStart: (frames: { mode: string }[]) => {
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].mode === 'replace') return i;
    }
    return 0;
  },
}));

vi.mock('../src/live/session/store', () => ({
  loadSession: () => ({
    v: 1,
    savedAt: Date.now(),
    history: [{ role: 'user', content: 'talk through my thesis' }],
    frames: [
      {
        question: 'Live session question',
        narration: '',
        mode: 'replace',
        tour: [],
        at: 1,
        spec: { title: 'Live session', blocks: [] },
      },
    ],
  }),
}));

vi.mock('../src/live/library/store', () => ({
  getLibrary: () => [
    {
      id: 'lib1',
      question: 'Saved canvas question',
      title: 'Saved canvas',
      savedAt: 1,
      lead: null,
      spec: { title: 'Saved canvas', blocks: [] },
    },
  ],
}));

vi.mock('../src/live/dashboards/store', () => ({
  addDashboard: vi.fn(),
  getDashboards: () => [],
  // The add-time reality gate reads the just-built board back before probing it. Return one with
  // a search-tracked metric so the gate takes the live path and actually fires the probe; the
  // grounded value stands in for what the (mocked) probe pass would have filled.
  getDashboard: (id: string) => ({
    id,
    title: 'Built board',
    metrics: [{ id: 'm1', label: 'Members', query: 'current member count', lastValue: 812 }],
    widgets: [],
  }),
  removeDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  ensureFirstCheck: vi.fn(),
}));

const refreshDashboardNow = vi.fn((_id: string) => Promise.resolve('done' as const));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => refreshDashboardNow(id),
}));

import { ExtractionPreview } from '../src/live/dashboards/ExtractionPreview';
import { buildDashboard } from '../src/live/dashboards/extract';

beforeEach(() => {
  // A stored key makes the provider "ready" + the live session takes the async model path.
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
  resolveExtract = null;
});

afterEach(() => {
  cleanup();
});

describe('ExtractionPreview — switching sources cancels a stale extraction', () => {
  it('a late model-extraction result never overwrites a since-selected source', async () => {
    const { getByText } = render(<ExtractionPreview onClose={() => {}} />);

    // Starts on the live session (sources[0]) — the async extraction is in flight.
    await waitFor(() => expect(resolveExtract).not.toBeNull());

    // Switch to the saved canvas BEFORE the live extraction resolves — this takes the
    // synchronous grounded() path immediately.
    fireEvent.click(getByText('Saved canvas'));
    await waitFor(() => expect(getByText('“grounded from the saved canvas”')).toBeTruthy());

    // The stale live-session extraction now resolves.
    resolveExtract?.({
      title: 'Live session draft',
      thesis: { text: 'the stale live extraction', saidAt: 1 },
      metrics: [],
      tripwires: [],
      suggestedWidgets: [],
    });

    // It must not have clobbered the saved-canvas draft that's now on screen.
    await new Promise((r) => setTimeout(r, 10));
    expect(getByText('“grounded from the saved canvas”')).toBeTruthy();
    expect(() => getByText('“the stale live extraction”')).toThrow();
  });
});

describe('ExtractionPreview — a freshly built dashboard is probed through the reality gate', () => {
  it('build runs the confirm probe (the grounded refresh) on the new board before finishing', async () => {
    vi.mocked(buildDashboard).mockReturnValue({ id: 'new-dash-id' } as ReturnType<
      typeof buildDashboard
    >);
    const { getByText } = render(<ExtractionPreview onClose={() => {}} />);

    // Take the synchronous grounded-draft path (saved canvas) to avoid waiting on the mocked
    // extraction promise.
    fireEvent.click(getByText('Saved canvas'));
    await waitFor(() => expect(getByText('“grounded from the saved canvas”')).toBeTruthy());

    fireEvent.click(getByText('Build dashboard →'));

    expect(buildDashboard).toHaveBeenCalled();
    // The confirm probe IS the first refresh — same grounded engine, awaited by build() so an
    // unverifiable board gets rolled back instead of sitting rendered as if it were fact.
    await waitFor(() => expect(refreshDashboardNow).toHaveBeenCalledWith('new-dash-id'));
  });
});
