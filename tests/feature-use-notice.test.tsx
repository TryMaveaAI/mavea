import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureUseNotice } from '../src/legal/FeatureUseNotice';

describe('FeatureUseNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('dismissal hides the notice entirely and persists across mounts', () => {
    const first = render(<FeatureUseNotice kind="monitoring" />);

    expect(screen.getByText(/you provide the API keys or connected accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/frequent cadence can use more of your quotas/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Not an alerting or monitoring service notice' }),
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(localStorage.getItem('mavea-feature-notice-dismissed-v1:monitoring')).toBe('1');

    first.unmount();
    render(<FeatureUseNotice kind="monitoring" />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders nothing for a previously dismissed kind', () => {
    localStorage.setItem('mavea-feature-notice-dismissed-v1:learning', '1');
    const { container } = render(<FeatureUseNotice kind="learning" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lets the standing speech notice be acknowledged once', () => {
    const first = render(<FeatureUseNotice kind="voice-data" from="live" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Speech can become provider data notice' }),
    );
    first.unmount();

    const { container } = render(<FeatureUseNotice kind="voice-data" from="live" />);
    expect(container).toBeEmptyDOMElement();
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

  it('still hides for the session when storage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    render(<FeatureUseNotice kind="simulation" />);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
