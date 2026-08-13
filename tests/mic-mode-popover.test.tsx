// mic-mode-popover.test.tsx — the mic-mode badge is a menu that unmounts its rows when it closes,
// so closing must hand keyboard focus back to the badge. Without that, Escape or a pick drops
// focus to <body> and a keyboard user has to tab in from the top of the page again.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MicModePopover } from '../src/live/voice/MicModePopover';

afterEach(cleanup);

describe('MicModePopover — focus never falls to the page', () => {
  it('returns focus to the badge when Escape closes the menu', () => {
    render(<MicModePopover mode="tap" onChange={vi.fn()} />);
    const chevron = screen.getByRole('button', { name: 'Mic mode' });
    fireEvent.click(chevron);
    expect(screen.getByRole('menu', { name: 'Mic mode' })).toBeInTheDocument();

    screen.getByRole('menuitemradio', { name: /Always on/ }).focus();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(chevron);
  });

  it('returns focus to the badge after a mode is picked', () => {
    const onChange = vi.fn();
    render(<MicModePopover mode="tap" onChange={onChange} />);
    const chevron = screen.getByRole('button', { name: 'Mic mode' });
    fireEvent.click(chevron);

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Hold/ }));

    expect(onChange).toHaveBeenCalledWith('hold');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(chevron);
  });
});
