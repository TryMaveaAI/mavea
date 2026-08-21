import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Library } from '../src/live/Library';
import { LIBRARY_CAP } from '../src/live/library/store';
import type { LibraryEntry } from '../src/live/library/store';
import type { ConversationSpec } from '../src/data/conversation';

const spec = (title: string) => ({ id: title, title, blocks: [] }) as unknown as ConversationSpec;

function entry(id: string, title: string, question: string, savedAt: number): LibraryEntry {
  return { id, title, question, savedAt, lead: null, spec: spec(title) };
}

const ENTRIES = [
  entry('a', 'Week 11 lineup', 'who should I start this week?', Date.now() - 3_600_000),
  entry('b', 'Content OS', 'build me a content tracker', Date.now() - 2 * 86_400_000),
  entry('c', 'Add dark mode', 'add dark mode to settings', Date.now() - 20 * 86_400_000),
];

describe('Library tools — search, tabs, count line', () => {
  it('counts this week honestly from savedAt, against the cap it actually keeps', () => {
    // "all time" was never true: the store keeps the most recent LIBRARY_CAP and drops the rest,
    // so a conversation could vanish with nothing having warned it might — and on a BYOK key,
    // re-asking for what vanished costs real money.
    const { getByText } = render(<Library entries={ENTRIES} onResume={vi.fn()} />);
    expect(getByText(/2 this week · 3 of 12 kept on this device/)).toBeTruthy();
  });

  it('says what happens next once the shelf is full', () => {
    const full = Array.from({ length: LIBRARY_CAP }, (_, i) =>
      entry(`f${i}`, `Saved ${i}`, `ask ${i}`, Date.now() - i * 3_600_000),
    );
    const { getByText } = render(<Library entries={full} onResume={vi.fn()} />);
    expect(getByText(/saving another drops the oldest/)).toBeTruthy();
  });

  it('search filters by what the cards actually show, with an empty state', () => {
    const { getByLabelText, queryByText, getByText } = render(
      <Library entries={ENTRIES} onResume={vi.fn()} />,
    );
    const box = getByLabelText('Search your conversations');
    fireEvent.change(box, { target: { value: 'lineup' } });
    expect(queryByText('Content OS')).toBeNull();
    expect(queryByText('Week 11 lineup')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'zzzz' } });
    expect(getByText(/Nothing matches/)).toBeTruthy();
  });

  it('By topic collapses a run of related asks into one thread; Recent stays flat', () => {
    const now = Date.now();
    // Three saved canvases: two are the same subject explored twice, one is unrelated.
    const related = [
      entry('r1', 'Batting average: use hits', 'how do I compute batting average', now - 3_600_000),
      entry('r2', 'Batting-average split', 'batting average split calculator', now - 7_200_000),
      entry('t1', 'Milwaukee trip', 'plan a 4 day trip to milwaukee', now - 10_800_000),
    ];
    const cardTitles = (c: HTMLElement) =>
      [...c.querySelectorAll('.lib-card-title')].map((n) => n.textContent);
    const { container, getByRole } = render(<Library entries={related} onResume={vi.fn()} />);
    // Recent: every canvas is its own card, newest first.
    expect(cardTitles(container)).toEqual([
      'Batting average: use hits',
      'Batting-average split',
      'Milwaukee trip',
    ]);
    fireEvent.click(getByRole('tab', { name: 'By topic' }));
    // By topic: the two batting-average asks fold into one named thread; the trip stays on its own.
    expect(cardTitles(container)).toEqual(['Batting average', 'Milwaukee trip']);
    const group = container.querySelector('.lib-group');
    expect(group).toBeTruthy();
    const sessionTitles = [...group!.querySelectorAll('.lib-session-title')].map(
      (n) => n.textContent,
    );
    expect(sessionTitles).toEqual(['Batting average: use hits', 'Batting-average split']);
    fireEvent.click(getByRole('tab', { name: 'Recent' }));
    expect(container.querySelector('.lib-group')).toBeNull();
  });

  it('resumes the exact conversation tapped inside a thread', () => {
    const now = Date.now();
    const related = [
      entry('r1', 'Batting average: use hits', 'how do I compute batting average', now - 3_600_000),
      entry('r2', 'Batting-average split', 'batting average split calculator', now - 7_200_000),
      entry('t1', 'Milwaukee trip', 'plan a 4 day trip to milwaukee', now - 10_800_000),
    ];
    const onResume = vi.fn();
    const { getByRole } = render(<Library entries={related} onResume={onResume} />);
    fireEvent.click(getByRole('tab', { name: 'By topic' }));
    fireEvent.click(getByRole('button', { name: 'Resume "Batting-average split"' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume.mock.calls[0][0].id).toBe('r2');
  });

  it('hides the toolbar for a small library (under 3 entries)', () => {
    const { queryByLabelText } = render(
      <Library entries={ENTRIES.slice(0, 2)} onResume={vi.fn()} />,
    );
    expect(queryByLabelText('Search your conversations')).toBeNull();
  });
});
