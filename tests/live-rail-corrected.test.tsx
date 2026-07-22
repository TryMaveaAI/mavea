import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionRail } from '../src/live/voice/SessionRail';
import type { TurnFrame } from '../src/live/history';
import type { Chapter } from '../src/live/scrubber/chapters';

// Self-healing history on the rail: the moment a later turn corrected reads as corrected
// (struck ask + the amber tag), with the honest was→now carried in its tooltip.

afterEach(cleanup);

function frame(question: string, narration: string, corrects?: TurnFrame['corrects']): TurnFrame {
  return {
    question,
    narration,
    mode: 'replace',
    tour: [],
    spec: { title: '', blocks: [] } as unknown as TurnFrame['spec'],
    at: 0,
    ...(corrects ? { corrects } : {}),
  };
}

const frames = [
  frame('What rate for the refi?', 'The refi rate is 6.4%.'),
  frame('Check the refi rate again', 'Actually it is 5.9%.', {
    what: 'the refi rate',
    was: '6.4%',
    now: '5.9%',
  }),
];

const chapters: Chapter[] = [
  {
    id: 'c1',
    title: 'Refi',
    color: 'var(--presence)',
    moments: [
      { frameIndex: 0, question: frames[0].question },
      { frameIndex: 1, question: frames[1].question },
    ],
  } as unknown as Chapter,
];

describe('SessionRail — corrected moments', () => {
  it('marks the corrected moment and carries the was→now in its title', () => {
    const { container } = render(
      <SessionRail
        chapters={chapters}
        frames={frames}
        currentIndex={1}
        onJump={vi.fn()}
        resumed={false}
        chatOpen={false}
        onToggleChat={vi.fn()}
      />,
    );
    const rows = container.querySelectorAll('.sess-row');
    expect(rows[0].classList.contains('is-corrected')).toBe(true);
    expect(rows[0].getAttribute('title')).toMatch(/was 6\.4%, now 5\.9%/);
    expect(rows[0].textContent).toMatch(/corrected/);
    expect(rows[1].classList.contains('is-corrected')).toBe(false);
  });
});

describe('SessionRail — room questions', () => {
  it('labels frames asked while presenting', () => {
    const { container } = render(
      <SessionRail
        chapters={chapters}
        frames={frames}
        currentIndex={1}
        onJump={vi.fn()}
        resumed={false}
        chatOpen={false}
        onToggleChat={vi.fn()}
        roomIndices={new Set([1])}
      />,
    );
    const rows = container.querySelectorAll('.sess-row');
    expect(rows[0].querySelector('.sess-room')).toBeNull();
    expect(rows[1].querySelector('.sess-room')?.textContent).toBe('from the room');
  });
});
