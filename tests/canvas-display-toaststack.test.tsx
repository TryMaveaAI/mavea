import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toaststack } from '../src/canvas/blocks/display/Toaststack';
import type { ToastSpec } from '../src/canvas/blocks/display/types';

// Regression coverage: the stack used to hardcode `.slice(0, 4)` only inside the "push" handler,
// so an initial `toasts` array larger than 4 rendered every item unclamped straight onto the
// card — no cap, no signal, just an unbounded stack. The fix clamps the initial render too (via
// a `maxToasts` prop, default 4) and surfaces anything beyond the cap as a "+N more" note instead
// of silently vanishing.
const MANY_TOASTS: ToastSpec[] = Array.from({ length: 12 }, (_, i) => ({
  kind: (['success', 'info', 'warning', 'error'] as const)[i % 4],
  title: `Event ${i + 1}`,
  desc: `Detail line for event number ${i + 1}.`,
}));

describe('Toaststack — dynamic toast counts', () => {
  it('caps the initially-rendered toasts at the default limit (4), not all of them', () => {
    render(<Toaststack title="Activity" toasts={MANY_TOASTS} />);
    const rendered = MANY_TOASTS.slice(0, 4);
    for (const t of rendered) {
      expect(screen.getByText(t.title)).toBeInTheDocument();
    }
    for (const t of MANY_TOASTS.slice(4)) {
      expect(screen.queryByText(t.title)).toBeNull();
    }
  });

  it('surfaces the dropped count instead of silently discarding extra toasts', () => {
    render(<Toaststack title="Activity" toasts={MANY_TOASTS} />);
    // 12 supplied, 4 shown => 8 unaccounted for must be indicated, not just dropped.
    expect(screen.getByText(/\+8 more/)).toBeInTheDocument();
  });

  it('honors a custom maxToasts', () => {
    render(<Toaststack title="Activity" toasts={MANY_TOASTS} maxToasts={6} />);
    for (const t of MANY_TOASTS.slice(0, 6)) {
      expect(screen.getByText(t.title)).toBeInTheDocument();
    }
    expect(screen.getByText(/\+6 more/)).toBeInTheDocument();
  });

  it('clamps an absurdly large maxToasts to a sane ceiling so the card cannot blow out', () => {
    render(<Toaststack title="Activity" toasts={MANY_TOASTS} maxToasts={999} />);
    expect(screen.getAllByText(/^Event \d+$/).length).toBeLessThanOrEqual(8);
  });

  it('shows no overflow note when every toast fits under the cap', () => {
    render(<Toaststack title="Activity" toasts={MANY_TOASTS.slice(0, 3)} />);
    expect(screen.queryByText(/more queued/)).toBeNull();
  });

  it('never exceeds the fixed-size stage regardless of pushing more from a long pool', () => {
    render(<Toaststack title="Activity" toasts={[]} pool={MANY_TOASTS} />);
    const pushButton = screen.getByRole('button', { name: /push toast/i });
    for (let i = 0; i < 10; i++) {
      fireEvent.click(pushButton);
    }
    // however many times we push from a 12-item pool, the visible stack stays at the cap.
    expect(screen.getAllByText(/^Event \d+$/).length).toBeLessThanOrEqual(4);
  });

  it('treats a negative model-authored duration as disabled instead of scheduling a timer', () => {
    const { container } = render(
      <Toaststack title="Activity" toasts={MANY_TOASTS.slice(0, 1)} duration={-1_000_000_000} />,
    );
    expect(container.querySelector('.ts-progress')).toBeNull();
  });
});
