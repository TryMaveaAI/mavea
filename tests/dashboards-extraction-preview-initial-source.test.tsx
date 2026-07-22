// Regression test: opening "Build a dashboard" after resuming a saved chat from the Library must
// default the source picker to THAT chat, not silently fall back to the live/most-recent session
// (the bug where clicking a past chat's dashboard action built from whatever was most recent).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import type { DashboardDraft } from '../src/live/dashboards/types';

vi.mock('../src/live/dashboards/extract', () => ({
  extractDashboard: vi.fn(() => new Promise<DashboardDraft | null>(() => {})),
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
}));

vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: vi.fn(() => Promise.resolve('done' as const)),
}));

import { ExtractionPreview } from '../src/live/dashboards/ExtractionPreview';

beforeEach(() => {
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
});

afterEach(() => {
  cleanup();
});

describe('ExtractionPreview — initialSourceId', () => {
  it('defaults to the resumed Library entry, not the live session', async () => {
    const { getByText, getByTitle } = render(
      <ExtractionPreview onClose={() => {}} initialSourceId="lib-lib1" />,
    );

    // The "Build from" chip picker shows the saved canvas as the active source...
    expect(getByTitle('Saved canvas').className).toContain('is-active');
    // ...and the saved canvas's grounded draft (synchronous) is showing, not the live
    // session's — the live extraction mock never resolves, so if we're stuck on it this
    // assertion times out.
    await waitFor(() => expect(getByText('“grounded from the saved canvas”')).toBeTruthy());
  });

  it('falls back to the live session when the id no longer matches a source', () => {
    const { getByTitle } = render(
      <ExtractionPreview onClose={() => {}} initialSourceId="lib-does-not-exist" />,
    );

    expect(getByTitle('Live session question').className).toContain('is-active');
  });
});
