import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Library } from '../src/live/Library';
import { formatAgo } from '../src/live/library/time';
import type { LibraryEntry } from '../src/live/library/store';
import type { ConversationSpec } from '../src/data/conversation';

const fakeSpec = { id: 't', title: 'Your money', blocks: [] } as unknown as ConversationSpec;

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'e1',
    question: 'where does my money go?',
    title: 'Your money',
    savedAt: 1_000,
    lead: {
      value: '$214/mo',
      delta: '−$310',
      deltaDir: 'good',
      points: [1, 3, 2, 4],
      kind: 'insight',
    },
    spec: fakeSpec,
    ...over,
  };
}

describe('formatAgo', () => {
  it('reads as a friendly, honest elapsed time', () => {
    const now = 1_000_000_000;
    expect(formatAgo(now, now)).toBe('just now');
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatAgo(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(formatAgo(now - 14 * 86_400_000, now)).toBe('2w ago');
  });
});

describe('Library', () => {
  it('renders nothing when there are no saved canvases', () => {
    const { container } = render(<Library entries={[]} onResume={() => {}} />);
    expect(container.querySelector('.library')).toBeNull();
  });

  it('renders a uniform card (no big stat face) and resumes on click', () => {
    // Cards are deliberately uniform: the optional big-number "face" + sparkline was removed so a
    // card whose canvas happened to have a lead stat no longer dwarfs one that didn't — every card
    // reads as the same size/shape (title → moments → saved/Resume). Regression guard for that.
    const onResume = vi.fn();
    const { container, getByRole } = render(<Library entries={[entry()]} onResume={onResume} />);
    expect(container.querySelector('.lib-face')).toBeNull();
    expect(container.querySelector('.lib-value')).toBeNull();
    expect(container.querySelector('.lib-spark')).toBeNull();
    expect(container.textContent).toContain('Your money'); // the title still leads the card
    fireEvent.click(getByRole('button', { name: /Resume/ }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume.mock.calls[0][0].id).toBe('e1');
  });

  it('never shows a fabricated delta or a passive "LIVE / since you left" claim', () => {
    const { container } = render(
      <Library
        entries={[entry({ lead: { value: '6h 10m', kind: 'insight' } })]}
        onResume={() => {}}
      />,
    );
    expect(container.querySelector('.lib-delta')).toBeNull(); // no delta in the data → none shown
    expect(container.textContent).not.toMatch(/since you left/i);
    expect(container.textContent).not.toMatch(/\bLIVE\b/);
    expect(container.textContent).toMatch(/saved/i); // honest timestamp instead
  });

  it('removes an entry when the × is clicked', () => {
    const onRemove = vi.fn();
    const { getByRole } = render(
      <Library entries={[entry()]} onResume={() => {}} onRemove={onRemove} />,
    );
    fireEvent.click(getByRole('button', { name: /Remove/ }));
    expect(onRemove).toHaveBeenCalledWith('e1');
  });

  it('reserves room for the remove button so it never overlaps the count badge', () => {
    // Regression: .lib-remove overlays the card at a fixed top/right offset, outside the header's
    // own flex flow — without a matching gutter reserved on the header, a wide-enough count badge
    // butted right up against it and visually fused ("7" + "×" read as one glyph). The gutter is
    // only needed when a remove button actually renders.
    const { container: withRemove } = render(
      <Library entries={[entry()]} onResume={() => {}} onRemove={() => {}} />,
    );
    expect(withRemove.querySelector('.lib-card-head.has-remove')).not.toBeNull();

    const { container: withoutRemove } = render(
      <Library entries={[entry({ id: 'e2' })]} onResume={() => {}} />,
    );
    expect(withoutRemove.querySelector('.lib-card-head.has-remove')).toBeNull();
    expect(withoutRemove.querySelector('.lib-card-head')).not.toBeNull();
  });

  it('retells the ask as the first moment row even when a canvas has no stat face', () => {
    const { container } = render(<Library entries={[entry({ lead: null })]} onResume={() => {}} />);
    expect(container.querySelector('.lib-moment-text')?.textContent).toContain('money');
    expect(container.textContent).toMatch(/Resume/);
  });
});
