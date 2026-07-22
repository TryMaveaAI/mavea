import { render, fireEvent } from '@testing-library/react';
import { Tabs } from '../src/canvas/blocks/layout/Tabs';

const TABS = {
  title: 'Settings',
  tabs: [
    { label: 'One', body: 'first' },
    { label: 'Two', body: 'second' },
    { label: 'Three', body: 'third' },
  ],
};

describe('Tabs keyboard navigation (WAI-ARIA tablist)', () => {
  it('uses a roving tabindex — only the active tab is in the tab order', () => {
    const { getAllByRole } = render(<Tabs {...TABS} />);
    const tabs = getAllByRole('tab');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight/Left move selection and wrap', () => {
    const { getAllByRole } = render(<Tabs {...TABS} />);
    const tabs = getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' }); // wraps to the last
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  });

  it('Home/End jump to the ends', () => {
    const { getAllByRole } = render(<Tabs {...TABS} />);
    const tabs = getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });
});
