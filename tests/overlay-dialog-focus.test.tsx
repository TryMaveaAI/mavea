import { render, fireEvent, screen } from '@testing-library/react';
import { Confirmdialog } from '../src/canvas/blocks/overlays/Confirmdialog';
import { Sheet } from '../src/canvas/blocks/overlays/Sheet';

describe('overlay blocks hold focus while open and hand it back', () => {
  it('opens a destructive confirm on Cancel, so a reflexive Enter deletes nothing', () => {
    render(<Confirmdialog trigger="Delete project" cancel="Cancel" />);
    const trigger = screen.getByRole('button', { name: /Delete project/ });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus into the sheet and cycles Tab inside it', () => {
    render(<Sheet trigger="Share" />);
    const trigger = screen.getByRole('button', { name: /Share/ });
    trigger.focus();
    fireEvent.click(trigger);
    const sheet = screen.getByRole('dialog');
    expect(sheet.contains(document.activeElement)).toBe(true);
    const inside = Array.from(sheet.querySelectorAll<HTMLElement>('button'));
    inside[inside.length - 1].focus();
    fireEvent.keyDown(sheet, { key: 'Tab' });
    expect(document.activeElement).toBe(inside[0]);
  });
});
