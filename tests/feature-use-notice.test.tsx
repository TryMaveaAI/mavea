import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureUseNotice } from '../src/legal/FeatureUseNotice';

describe('FeatureUseNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('remembers dismissal and leaves a compact monitoring reminder', () => {
    const first = render(<FeatureUseNotice kind="monitoring" />);

    expect(screen.getByText(/you provide the API keys or connected accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/frequent cadence can use more of your quotas/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Not an alerting or monitoring service notice' }),
    );

    expect(screen.queryByText(/Refreshes can be delayed/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show full notice/ })).toHaveTextContent(
      'Not real-time',
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '#/legal?from=home',
    );

    first.unmount();
    render(<FeatureUseNotice kind="monitoring" />);
    expect(screen.getByRole('button', { name: /Show full notice/ })).toHaveTextContent(
      'Not real-time',
    );
  });

  it('can restore the full notice from its compact reminder', () => {
    localStorage.setItem('mavea-feature-notice-dismissed-v1:learning', '1');
    render(<FeatureUseNotice kind="learning" />);

    fireEvent.click(screen.getByRole('button', { name: /Show full notice/ }));

    expect(screen.getByText(/Lessons and study material are AI-generated/)).toBeInTheDocument();
    expect(localStorage.getItem('mavea-feature-notice-dismissed-v1:learning')).toBeNull();
  });

  it('keeps action-specific warnings fully visible', () => {
    render(<FeatureUseNotice kind="upload" from="live" />);

    expect(screen.getByText(/Files are staged and extracted locally/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '#/legal?from=live',
    );
  });

  it('still collapses for the session when storage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    render(<FeatureUseNotice kind="simulation" />);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));

    expect(screen.getByRole('button', { name: /Show full notice/ })).toHaveTextContent(
      'Simulation',
    );
  });
});
