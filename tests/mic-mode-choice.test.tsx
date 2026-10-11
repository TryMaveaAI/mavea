import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MicModeChoice } from '../src/live/voice/MicModePopover';

// The mic-mode badge is an 18px dot on the mic's corner: a thumb aimed at it lands on the mic about
// as often. On a touch screen the badge gives way to a row of full-size choices in the dock's
// Settings sheet, so the same three modes stay one tap away.

describe('the mic-mode choice for a touch screen', () => {
  it('offers the three modes as radios and reports the pick', () => {
    const onChange = vi.fn();
    render(<MicModeChoice mode="tap" onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Tap', 'Always on', 'Hold']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(screen.getByRole('radio', { name: 'Hold' }));
    expect(onChange).toHaveBeenCalledWith('hold');
  });

  it('swaps the badge for the row only under a coarse pointer', () => {
    const css = readFileSync(join(__dirname, '../src/live/livedock.css'), 'utf8');
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(css).toMatch(/\.mic-mode-choice\s*\{\s*display:\s*none/);
    expect(coarse).toMatch(/\.mic-mode-chevron\s*\{\s*display:\s*none/);
    expect(coarse).toMatch(/\.mic-mode-choice-opt\s*\{[^}]*min-height:\s*var\(--tap-min\)/);
  });
});
