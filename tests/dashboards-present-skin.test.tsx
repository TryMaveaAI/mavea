import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DashPresent } from '../src/live/dashboards/DashPresent';
import { persistTemplate } from '../src/live/templates';

// Present replaces the whole dashboards view, including the topbar's TemplatePicker. Before the
// fix, that picker's unmount stripped `data-template` and Present fell back to the stock skin —
// "present in dashboard doesn't hold the theme set". Present now owns the skin for its lifetime.
describe('DashPresent keeps the chosen template skin', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.template;
    delete document.documentElement.dataset.theme;
  });
  afterEach(cleanup);

  it('applies the persisted skin on mount and hands the page back on unmount', () => {
    localStorage.setItem('mavea-theme', 'light');
    persistTemplate('console');

    const { unmount } = render(<DashPresent onClose={() => {}} />);
    expect(document.documentElement.dataset.template).toBe('console');
    // the skin never overrides the user's brightness choice
    expect(document.documentElement.dataset.theme).toBe('light');

    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
