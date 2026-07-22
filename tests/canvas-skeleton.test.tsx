import { render } from '@testing-library/react';
import { CanvasSkeleton } from '../src/canvas/CanvasSkeleton';

// The family-gate placeholder: one shimmer card per incoming block (capped), spanning the
// same col-* track the real card will land in so the grid never reflows when the answer
// mounts. The span math must mirror TopicCanvas's extras clamp — narrow budgets go
// full-width, desktop keeps the authored col clamped to the 12-track grid.
describe('CanvasSkeleton', () => {
  it('renders one skeleton per block, capped at eight', () => {
    const many = Array.from({ length: 12 }, () => ({ col: 6 }));
    const { container } = render(<CanvasSkeleton blocks={many} budget={12} />);
    expect(container.querySelectorAll('.skel-card')).toHaveLength(8);

    const { container: few } = render(<CanvasSkeleton blocks={many.slice(0, 3)} budget={12} />);
    expect(few.querySelectorAll('.skel-card')).toHaveLength(3);
  });

  it('keeps the authored col at desktop budgets, clamped to the 12-track grid', () => {
    const { container } = render(
      <CanvasSkeleton blocks={[{ col: 4 }, { col: 40 }, { col: 0 }, {}]} budget={12} />,
    );
    const spans = [...container.querySelectorAll('[aria-hidden]')].map((el) => el.className);
    expect(spans).toEqual(['col-4', 'col-12', 'col-1', 'col-6']);
  });

  it('goes full-width below the 9-column budget, exactly like the extras clamp', () => {
    const { container } = render(<CanvasSkeleton blocks={[{ col: 4 }, { col: 6 }]} budget={6} />);
    const spans = [...container.querySelectorAll('[aria-hidden]')].map((el) => el.className);
    expect(spans).toEqual(['col-12', 'col-12']);
  });

  it('honours authored cols when no budget is known (the generic Suspense fallback)', () => {
    const { container } = render(<CanvasSkeleton blocks={[{ col: 6 }, { col: 12 }]} />);
    const spans = [...container.querySelectorAll('[aria-hidden]')].map((el) => el.className);
    expect(spans).toEqual(['col-6', 'col-12']);
  });

  it('is purely decorative — every skeleton is hidden from assistive tech', () => {
    const { container } = render(<CanvasSkeleton blocks={[{ col: 6 }, { col: 6 }]} budget={12} />);
    const wrappers = container.querySelectorAll('[class^="col-"]');
    expect(wrappers.length).toBe(2);
    for (const w of wrappers) expect(w.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives each card an anti-flash fade, an eyebrow slot, and 2–3 deterministic lines', () => {
    const blocks = Array.from({ length: 8 }, () => ({ col: 6 }));
    const first = render(<CanvasSkeleton blocks={blocks} budget={12} />).container;
    const second = render(<CanvasSkeleton blocks={blocks} budget={12} />).container;
    const widths = (root: HTMLElement) =>
      [...root.querySelectorAll('.skel-line')].map((el) => (el as HTMLElement).style.width);
    // Deterministic: two renders of the same blocks produce identical line widths.
    expect(widths(first)).toEqual(widths(second));
    for (const card of first.querySelectorAll('.skel-card')) {
      expect(card.classList.contains('skel-fade')).toBe(true);
      expect(card.querySelectorAll('.skel-eyebrow')).toHaveLength(1);
      const lines = card.querySelectorAll('.skel-line').length;
      expect(lines).toBeGreaterThanOrEqual(2);
      expect(lines).toBeLessThanOrEqual(3);
    }
  });
});
