// live-settings-a11y.test.tsx — the settings pane declares standard ARIA patterns (tabs, radio
// groups, switches), and these pin that it actually implements them: arrows move within a tab
// strip and a segmented picker, the body is the panel those tabs control, and a switch row is
// clickable by its label with its consequence announced. Each one was previously a promise the
// markup made and the keyboard broke.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../src/live/voiceAvailability', () => ({
  useKokoroAvailable: () => true,
  VOICE_OFF_HINT: 'Voice is unavailable.',
  VOICE_MUTED_HINT: 'Voice is muted.',
}));

import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';
import { forgetAll, getMemoryNodes, mergeNodes } from '../src/live/memory/store';

beforeEach(() => {
  localStorage.clear();
  forgetAll();
  resetLiveConfig();
});

describe('LiveSettings — the tab strip is a real tablist', () => {
  it('is one tab stop, and arrows walk it with the panel following', () => {
    render(<LiveSettings />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Model' })).toHaveAttribute('aria-selected', 'false');

    // …and wraps backwards off the first tab rather than dead-ending.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Settings' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Model' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Your data' })).toHaveAttribute('aria-selected', 'true');
  });

  it('names the panel the active tab controls', () => {
    render(<LiveSettings />);
    const tab = screen.getByRole('tab', { name: 'Model' });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });
});

describe('LiveSettings — segmented pickers behave like radio groups', () => {
  it('moves the choice with the arrow keys and keeps a single tab stop', () => {
    render(<LiveSettings initialTab="settings" />);
    const group = screen.getByRole('radio', { name: /Simple/ }).closest('[role="radiogroup"]');
    expect(group).not.toBeNull();
    const options = within(group as HTMLElement).getAllByRole('radio');
    const checkedAt = options.findIndex((o) => o.getAttribute('aria-checked') === 'true');
    expect(options.filter((o) => o.tabIndex === 0)).toEqual([options[checkedAt]]);

    fireEvent.keyDown(options[checkedAt], { key: 'ArrowRight' });
    const moved = within(group as HTMLElement).getAllByRole('radio')[
      (checkedAt + 1) % options.length
    ];
    expect(moved).toHaveAttribute('aria-checked', 'true');
  });

  it('gives every settings radiogroup an accessible name', () => {
    render(<LiveSettings initialTab="settings" />);

    for (const name of ['Web search', 'Explanation level', 'Thinking time', 'Visual richness']) {
      expect(screen.getByRole('radiogroup', { name })).toBeInTheDocument();
    }
  });
});

describe('LiveSettings — switch rows', () => {
  it('flips from the label text and describes its consequence', () => {
    render(<LiveSettings initialTab="you" />);
    const remember = screen.getByRole('switch', { name: 'Remember me' });
    const before = remember.getAttribute('aria-checked');

    // The note is wired to the switch, so AT hears what the toggle actually does.
    const describedBy = remember.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toMatch(
      /Stored facts stay on this device/i,
    );

    // Clicking the row's text — not the 38x22 switch — flips it, via the wrapping <label>.
    fireEvent.click(screen.getByText('Remember me'));
    expect(remember.getAttribute('aria-checked')).not.toBe(before);
  });
});

describe('LiveSettings — stored-memory controls', () => {
  it('keeps management visible while memory is off and arms destructive deletion', () => {
    mergeNodes([{ concept: 'preferences.visuals', body: 'Prefers diagrams.' }]);
    setLiveConfigV2({ memoryEnabled: false });
    render(<LiveSettings initialTab="you" />);

    const view = screen.getByRole('group', { name: 'Memory view' });
    expect(within(view).getByRole('button', { name: 'Concepts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(view).getByRole('button', { name: 'Graph' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText(/Memory is off.*not included in prompts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Forget all' }));
    expect(getMemoryNodes()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm forget 1 concept' }));
    expect(getMemoryNodes()).toHaveLength(0);
  });
});
