import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PenPill } from '../src/live/annotate/PenPill';

afterEach(cleanup);

// The pen pill is the only on-canvas cue for the gesture pen now that the panel no longer
// auto-pops. These lock the two things a user reads off it: armed state (on/off) and how many
// marks were drawn — shown only while the panel is closed so it stays unobtrusive.
describe('PenPill', () => {
  it('reads its armed state from `enabled`', () => {
    const { rerender } = render(<PenPill enabled open={false} inkCount={0} onClick={() => {}} />);
    const pill = screen.getByRole('button');
    expect(pill).toHaveTextContent('Pen on');
    expect(pill).toHaveClass('on');
    expect(pill).not.toHaveClass('off');

    rerender(<PenPill enabled={false} open={false} inkCount={0} onClick={() => {}} />);
    expect(pill).toHaveTextContent('Pen off');
    expect(pill).toHaveClass('off');
  });

  it('shows the mark count only while the panel is closed and there are marks', () => {
    const { rerender } = render(<PenPill enabled open={false} inkCount={3} onClick={() => {}} />);
    // Closed + marks → badge with the count.
    expect(screen.getByLabelText('3 marks drawn')).toHaveTextContent('3');

    // No marks → no badge.
    rerender(<PenPill enabled open={false} inkCount={0} onClick={() => {}} />);
    expect(screen.queryByLabelText(/marks drawn/)).toBeNull();

    // Panel open → no badge (the full gesture track is already showing the marks).
    rerender(<PenPill enabled open inkCount={5} onClick={() => {}} />);
    expect(screen.queryByLabelText(/marks drawn/)).toBeNull();
    expect(screen.getByRole('button')).toHaveClass('open');
  });

  it('toggles via the click handler and exposes its expanded state', () => {
    const onClick = vi.fn();
    render(<PenPill enabled open={false} inkCount={0} onClick={onClick} />);
    const pill = screen.getByRole('button');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
