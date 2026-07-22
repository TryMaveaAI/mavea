// PinToDashboard: the dialog a11y contract (focus trap in, Escape closes, focus restored — every
// overlay in the app behaves this way), plus the single-step flow itself: an existing board pins
// in ONE click with no second screen, and "New dashboard" is one compact naming step prefilled
// from the question. The refine call must never gate any of it (pin.ts detaches it).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { Block } from '../src/data/conversation';

const refreshDashboardNow = vi.fn((_id: string) => Promise.resolve('done' as const));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => refreshDashboardNow(id),
}));

import { PinToDashboard } from '../src/live/dashboards/PinToDashboard';
import {
  addDashboard,
  clearDashboards,
  createBlankDashboard,
  getDashboard,
  getDashboards,
} from '../src/live/dashboards/store';
import { displayTitle } from '../src/live/dashboards/format';

const block: Block = {
  type: 'insight',
  col: 4,
  id: 'b1',
  props: { title: 'Signups this week', stat: '412' },
} as Block;

beforeEach(() => {
  refreshDashboardNow.mockClear();
});

afterEach(() => {
  cleanup();
  clearDashboards();
  localStorage.clear();
});

describe('PinToDashboard accessibility', () => {
  it('exposes a labelled modal dialog', () => {
    const { getByRole } = render(<PinToDashboard block={block} onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Add to a dashboard');
  });

  it('moves focus into the sheet on open', () => {
    const { getByRole } = render(<PinToDashboard block={block} onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = render(<PinToDashboard block={block} onClose={onClose} />);
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<PinToDashboard block={block} onClose={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('PinToDashboard single-step flow', () => {
  it('pins onto an existing board in one click — no plan screen, no blocking refine', () => {
    const dash = createBlankDashboard({ title: 'Rates watch', now: 1000 });
    addDashboard(dash);
    const onAdded = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <PinToDashboard
        block={block}
        question="what is the 10-year yield today"
        onClose={onClose}
        onAdded={onAdded}
      />,
    );
    fireEvent.click(getByText('Rates watch'));
    expect(onAdded).toHaveBeenCalledWith(dash.id, 'Rates watch');
    expect(onClose).toHaveBeenCalledTimes(1);
    const saved = getDashboard(dash.id)!;
    expect(saved.widgets).toHaveLength(1);
    // The raw ask is stored immediately — the refine upgrades it later, in the background.
    expect(saved.widgets[0].refreshQuery).toBe('what is the 10-year yield today');
    expect(refreshDashboardNow).toHaveBeenCalledWith(dash.id);
  });

  it('board rows carry the cadence chip and card count', () => {
    const dash = createBlankDashboard({ title: 'Rates watch', now: 1000 });
    dash.cadence = { data: 'hourly', ai: 'manual' };
    addDashboard(dash);
    const { getByText } = render(<PinToDashboard block={block} onClose={() => {}} />);
    expect(getByText('HOURLY')).toBeInTheDocument();
    expect(getByText('0 cards')).toBeInTheDocument();
  });

  it('with no boards at all, opens straight on the compact new-board step, prefilled', () => {
    const question = 'ethereum price in dollars right now';
    const { getByLabelText, queryByRole } = render(
      <PinToDashboard block={block} question={question} onClose={() => {}} />,
    );
    expect(queryByRole('menu')).toBeNull();
    const name = getByLabelText('Dashboard name') as HTMLInputElement;
    expect(name.value).toBe(displayTitle(question));
  });

  it('creates the new board with the picked cadence from the one compact step', () => {
    const onAdded = vi.fn();
    const { getByLabelText, getByText } = render(
      <PinToDashboard
        block={block}
        question="ethereum price"
        onClose={() => {}}
        onAdded={onAdded}
      />,
    );
    fireEvent.change(getByLabelText('Dashboard name'), { target: { value: 'Ether' } });
    fireEvent.click(getByText('1H'));
    fireEvent.click(getByText('Create · first check queued'));
    expect(onAdded).toHaveBeenCalledTimes(1);
    const [id, title] = onAdded.mock.calls[0] as [string, string];
    expect(title).toBe('Ether');
    const saved = getDashboard(id)!;
    expect(saved.cadence.data).toBe('hourly');
    expect(saved.nextDataAt).toBeLessThan(Number.MAX_SAFE_INTEGER); // clock actually wound
    expect(saved.widgets).toHaveLength(1);
    expect(getDashboards()).toHaveLength(1);
    expect(refreshDashboardNow).toHaveBeenCalledWith(id);
  });

  it('the naming step reads back to the board list when boards exist', () => {
    addDashboard(createBlankDashboard({ title: 'Existing', now: 1000 }));
    const { getByText, getByRole, queryByLabelText } = render(
      <PinToDashboard block={block} onClose={() => {}} />,
    );
    fireEvent.click(getByText('New dashboard'));
    expect(queryByLabelText('Dashboard name')).not.toBeNull();
    fireEvent.click(getByText('← Back'));
    expect(getByRole('menu')).toBeInTheDocument();
  });
});
