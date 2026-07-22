import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForecastPanel } from '../src/live/prism/autopsy/ForecastPanel';
import { gradeForecast } from '../src/live/prism/autopsy/grade';
import type { ForecastGrade } from '../src/live/prism/autopsy/types';
import type { ModelConfig } from '../src/types/mavea';

// gradeForecast is the pure verdict: comparable + due gate any hit/miss, a near-miss within tolerance
// is a hit, and a big miss reports an off-by factor. The model never does this arithmetic.
describe('forecast autopsy — the pure grade', () => {
  describe('gradeForecast', () => {
    it('grades a 5x miss', () => {
      const g = gradeForecast(30, 6, true, true);
      expect(g.status).toBe('missed');
      expect(g.factor).toBe(5);
      expect(g.delta).toBe('5× off');
    });

    it('counts an on-target prediction as a hit', () => {
      expect(gradeForecast(30, 30, true, true).status).toBe('hit');
      expect(gradeForecast(30, 28, true, true).status).toBe('hit'); // within 15%
    });

    it('degrades honestly when not due, not comparable, or unknown', () => {
      expect(gradeForecast(30, 6, true, false).status).toBe('not-due');
      expect(gradeForecast(30, 6, false, true).status).toBe('incomparable');
      expect(gradeForecast(undefined, 6, true, true).status).toBe('unknown');
      expect(gradeForecast(30, undefined, true, true).status).toBe('unknown');
    });

    it('reports a signed delta for a small-but-real miss (below the factor threshold)', () => {
      const g = gradeForecast(100, 130, true, true);
      expect(g.status).toBe('missed');
      expect(g.delta).toBe('+30');
    });
  });
});

let adapterReply: string | object = '{"grades":[]}';

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({ generate: async () => ({ raw: adapterReply }) }),
}));

vi.mock('../src/live/search', () => ({
  getSearchProvider: () => ({
    id: 'wikipedia',
    needsKey: false,
    search: async () => [
      { title: 'Outcome', url: 'https://ex.com/a', snippet: 'reported growth was 6% last year' },
    ],
  }),
}));

const { runAutopsy } = await import('../src/live/prism/autopsy/run');

// A real, cited outcome means a prediction's horizon has arrived — so runAutopsy must grade it even
// when the model forgets to echo `due: true`. Only an explicit `due: false` keeps it "not due". This
// guards the bug where a settled, perfectly-cited prediction was mislabeled NOT DUE on a missing flag.
describe('forecast autopsy — the run', () => {
  const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;
  const claims = [{ id: 'f', page: 1, quote: 'We expect 30% growth by 2024.' }];

  describe('runAutopsy', () => {
    it('grades a cited outcome even when the model omits the `due` flag', async () => {
      adapterReply = JSON.stringify({
        grades: [
          {
            claimId: 'f',
            actual: '6%',
            comparable: true,
            // no `due` field — the cited outcome should still count as due
            citationQuote: 'reported growth was 6%',
            citationUrl: 'https://ex.com/a',
          },
        ],
      });
      const out = await runAutopsy(claims, { cfg });
      expect(out).toHaveLength(1);
      expect(out[0].status).toBe('missed');
      expect(out[0].factor).toBe(5);
    });

    it('respects an explicit due:false (still not-due) even with an outcome', async () => {
      adapterReply = JSON.stringify({
        grades: [
          {
            claimId: 'f',
            actual: '6%',
            comparable: true,
            due: false,
            citationQuote: 'reported growth was 6%',
            citationUrl: 'https://ex.com/a',
          },
        ],
      });
      const out = await runAutopsy(claims, { cfg });
      expect(out[0].status).toBe('not-due');
    });
  });
});

// ForecastPanel rows carry a real citation <a> when a graded prediction has one. A row must never be
// a <button> in that case — an anchor nested inside a button is invalid HTML (hydration warning +
// flaky clicks, the same reason PrismOverlay's claim cards use a div+role="button" instead).
describe('forecast autopsy — the panel', () => {
  afterEach(cleanup);

  const missed: ForecastGrade = {
    claimId: 'c1',
    page: 4,
    predicted: 'Revenue will reach $30M by 2025.',
    predictedValue: 30,
    status: 'missed',
    actual: '$6M in 2025',
    actualValue: 6,
    delta: '5× off',
    factor: 5,
    citation: {
      quote: 'reported $6M in revenue for 2025',
      url: 'https://ex.com/a',
      host: 'ex.com',
    },
    note: 'Graded against a cited source.',
  };

  function renderPanel(overrides: Partial<React.ComponentProps<typeof ForecastPanel>> = {}) {
    const props = {
      grades: [missed],
      busy: false,
      onFocusForecast: vi.fn(),
      activeId: null,
      onClose: vi.fn(),
      ...overrides,
    };
    render(<ForecastPanel {...props} />);
    return props;
  }

  describe('ForecastPanel', () => {
    it('never nests the citation link inside a <button>', () => {
      renderPanel();
      const link = screen.getByRole('link', { name: /reported \$6M/ });
      expect(link.closest('button')).toBeNull();
    });

    it('focuses the prediction when its row is clicked', () => {
      const { onFocusForecast } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /Revenue will reach/ }));
      expect(onFocusForecast).toHaveBeenCalledWith(missed);
    });

    it('focuses the prediction on Enter and Space, like the claim cards', () => {
      const { onFocusForecast } = renderPanel();
      const row = screen.getByRole('button', { name: /Revenue will reach/ });
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.keyDown(row, { key: ' ' });
      expect(onFocusForecast).toHaveBeenCalledTimes(2);
    });

    it('shows the honest empty state when nothing was graded', () => {
      renderPanel({ grades: [] });
      expect(
        screen.getByText('No dated predictions found to grade in this document.'),
      ).toBeTruthy();
    });

    it('keeps a citation with a non-http(s) URL visible but unclickable', () => {
      renderPanel({
        grades: [
          {
            ...missed,
            citation: { ...missed.citation!, url: 'javascript:alert(1)' },
          },
        ],
      });
      // Same scheme gate as every other Prism link surface: the verified quote still shows,
      // but never as an anchor carrying an active scheme.
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText(/reported \$6M/)).toBeTruthy();
    });
  });
});
