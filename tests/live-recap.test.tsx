import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { buildRecap } from '../src/live/recap/recapModel';
import { Recap } from '../src/live/recap/Recap';
import type { TurnFrame } from '../src/live/history';
import type { Chapter } from '../src/live/scrubber/chapters';

const at = (h: number, m: number) => new Date(2026, 5, 11, h, m).getTime();

function frame(question: string, narration: string, when: number): TurnFrame {
  return {
    question,
    narration,
    mode: 'replace',
    tour: [],
    spec: { title: question, blocks: [] } as never,
    at: when,
  };
}

const FRAMES: TurnFrame[] = [
  frame('saturday plans', 'Festival — Saturday is clear.', at(19, 18)),
  frame('what to try there', 'Go early for the stalls.', at(19, 22)),
  frame('how did NVDA close', 'Up 2.4% at the close.', at(20, 15)),
];

const CHAPTERS: Chapter[] = [
  {
    id: 'c0',
    title: 'Saturday plans',
    color: 'var(--presence)',
    moments: [
      { frameIndex: 0, question: 'saturday plans', icon: 'spark', mode: 'replace' },
      { frameIndex: 1, question: 'what to try there', icon: 'spark', mode: 'augment' },
    ],
  },
  {
    id: 'c1',
    title: 'NVDA',
    color: 'var(--insight)',
    moments: [{ frameIndex: 2, question: 'how did NVDA close', icon: 'spark', mode: 'replace' }],
  },
] as Chapter[];

describe('buildRecap — the session, honestly folded', () => {
  it('derives heading, meta, and per-thread settled lines from real frames', () => {
    const m = buildRecap(FRAMES, CHAPTERS)!;
    expect(m.heading).toBe('Tonight, so far.');
    expect(m.meta).toContain('2 topics');
    expect(m.meta).toContain('3 moments');
    expect(m.meta).toContain('57m');
    expect(m.rows).toHaveLength(2);
    // Each thread is summarized by its OWN latest narration, never a reworded line.
    expect(m.rows[0].line).toBe('Go early for the stalls.');
    expect(m.rows[1].line).toBe('Up 2.4% at the close.');
    expect(m.rows[0].frameIndex).toBe(1);
  });

  it('names the part of day from the first frame', () => {
    const morning = [frame('q', 'a line', at(9, 5))];
    const ch: Chapter[] = [
      {
        id: 'c0',
        title: 'T',
        color: 'x',
        moments: [{ frameIndex: 0, question: 'q', icon: 'spark', mode: 'replace' }],
      },
    ] as Chapter[];
    expect(buildRecap(morning, ch)?.heading).toBe('This morning, so far.');
  });

  it('returns null with nothing to fold', () => {
    expect(buildRecap([], [])).toBeNull();
  });
});

describe('Recap overlay', () => {
  const model = buildRecap(FRAMES, CHAPTERS)!;

  it('rows jump to their moment; the actions share and close', () => {
    const onJump = vi.fn();
    const onShare = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <Recap model={model} onJump={onJump} onShare={onShare} onClose={onClose} />,
    );
    fireEvent.click(getByText('Up 2.4% at the close.'));
    expect(onJump).toHaveBeenCalledWith(2);
    fireEvent.click(getByText('Share as Story'));
    expect(onShare).toHaveBeenCalled();
    fireEvent.click(getByText('Keep talking'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape and scrim click, not on panel clicks', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <Recap model={model} onJump={() => {}} onClose={onClose} />,
    );
    fireEvent.click(getByText('Tonight, so far.'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.recap-scrim')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
