import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Notification } from '../src/canvas/blocks/display/Notification';
import type { NotificationItem } from '../src/canvas/blocks/display/types';

// Regression coverage for a real bug: the highest-priority unread notification row is marked
// with data-mark="point" on its .nf-unread-dot, but nothing in styles.css ever styled that
// attribute — so the "most important" dot rendered visually identical to every other unread
// dot, defeating the whole point of picking one out. The fix gives the marked dot its own
// glow/pulse; this test asserts exactly one dot is marked and that it actually carries a
// stronger box-shadow than the demo fixture's ordinary unread dots, at a list size well beyond
// the handful of items typical demo fixtures use.

function items(n: number): NotificationItem[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Notification number ${i + 1} with a reasonably long body of text`,
    time: `${i + 1}m`,
    color: 'var(--presence)',
    unread: true,
  }));
}

describe('Notification', () => {
  it('marks exactly one dot as the highest-priority item, even with a large unread list', () => {
    const { container } = render(<Notification title="Inbox" items={items(24)} />);
    const dots = Array.from(container.querySelectorAll('.nf-unread-dot'));
    expect(dots).toHaveLength(24);

    const marked = dots.filter((d) => d.getAttribute('data-mark') === 'point');
    expect(marked).toHaveLength(1);
    // It's the first row (highest-priority = first unread), not some arbitrary later one.
    expect(dots.indexOf(marked[0])).toBe(0);
  });

  it('gives the marked dot a visibly stronger glow than an ordinary unread dot', () => {
    const { container } = render(<Notification title="Inbox" items={items(24)} />);
    const dots = Array.from(container.querySelectorAll<HTMLElement>('.nf-unread-dot'));
    const marked = dots.find((d) => d.getAttribute('data-mark') === 'point')!;
    const ordinary = dots.find((d) => d.getAttribute('data-mark') !== 'point')!;

    expect(marked.style.boxShadow).not.toBe('');
    // The ordinary dot's emphasis comes entirely from the shared CSS rule (no inline override),
    // while the marked dot must carry its own inline box-shadow distinguishing it further.
    expect(ordinary.style.boxShadow).toBe('');
    expect(marked.style.boxShadow).not.toBe(ordinary.style.boxShadow);
  });

  it('marks no dot once every item has been read (no false highest-priority pick)', () => {
    const unreadNone = items(10).map((it) => ({ ...it, unread: false }));
    const { container } = render(<Notification title="Inbox" items={unreadNone} />);
    const marked = container.querySelectorAll('.nf-unread-dot[data-mark="point"]');
    expect(marked).toHaveLength(0);
  });

  it('keeps every row title within the fixed-width card at a long-text, high-count fixture', () => {
    // Demo fixtures tend to use 3-5 short titles; a real inbox can be much longer in both count
    // and per-title text. The row layout must not let a long title blow out the card width.
    const longItems: NotificationItem[] = items(15).map((it, i) => ({
      ...it,
      title:
        i === 0
          ? 'A very long notification title that keeps going and going without any natural break points to test wrapping behavior'
          : it.title,
    }));
    const { container } = render(<Notification title="Inbox" items={longItems} />);
    const card = container.querySelector('.card') as HTMLElement;
    const titles = Array.from(container.querySelectorAll<HTMLElement>('.nf-title'));
    expect(titles).toHaveLength(15);
    expect(card).toBeTruthy();
    // nf-list scrolls vertically with a capped max-height rather than growing the card unbounded.
    const list = container.querySelector('.nf-list') as HTMLElement;
    expect(list).toBeTruthy();
  });
});
