import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForecastPanel } from '../src/live/prism/autopsy/ForecastPanel';
import type { ForecastGrade } from '../src/live/prism/autopsy/types';

// ForecastPanel rows carry a real citation <a> when a graded prediction has one. A row must never be
// a <button> in that case — an anchor nested inside a button is invalid HTML (hydration warning +
// flaky clicks, the same reason PrismOverlay's claim cards use a div+role="button" instead).

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
  citation: { quote: 'reported $6M in revenue for 2025', url: 'https://ex.com/a', host: 'ex.com' },
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
    expect(screen.getByText('No dated predictions found to grade in this document.')).toBeTruthy();
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
