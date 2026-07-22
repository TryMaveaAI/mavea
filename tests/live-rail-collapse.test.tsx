import { render, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionRail } from '../src/live/voice/SessionRail';
import type { TurnFrame } from '../src/live/history';
import type { Chapter } from '../src/live/scrubber/chapters';

// The desktop rail can be condensed to a slim strip so the canvas takes the room, and a clipped
// question stays fully readable via the row's title tooltip.

afterEach(cleanup);

function frame(question: string): TurnFrame {
  return {
    question,
    narration: '',
    mode: 'replace',
    tour: [],
    spec: { title: '', blocks: [] } as unknown as TurnFrame['spec'],
    at: 0,
  };
}

const LONG_Q = 'What can I do in the city over a long summer weekend with kids?';
const frames = [frame(LONG_Q)];
const chapters: Chapter[] = [
  {
    id: 'c1',
    title: 'Chicago: summer itinerary',
    color: 'var(--presence)',
    moments: [{ frameIndex: 0, question: frames[0].question }],
  } as unknown as Chapter,
];

function renderRail(props: Partial<Parameters<typeof SessionRail>[0]> = {}) {
  return render(
    <SessionRail
      chapters={chapters}
      frames={frames}
      currentIndex={0}
      onJump={vi.fn()}
      resumed={false}
      chatOpen={false}
      onToggleChat={vi.fn()}
      {...props}
    />,
  );
}

describe('SessionRail — collapse toggle', () => {
  it('shows the toggle (expanded) and fires the handler on click', () => {
    const onToggleCollapse = vi.fn();
    const { container } = renderRail({ collapsed: false, onToggleCollapse });
    const btn = container.querySelector('.rail-collapse');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.side-rail')?.classList.contains('is-collapsed')).toBe(false);
    fireEvent.click(btn as Element);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('marks the aside collapsed and flips aria-expanded when collapsed', () => {
    const { container } = renderRail({ collapsed: true, onToggleCollapse: vi.fn() });
    expect(container.querySelector('.side-rail')?.classList.contains('is-collapsed')).toBe(true);
    expect(container.querySelector('.rail-collapse')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('omits the toggle when no handler is given (the scripted Demo)', () => {
    const { container } = renderRail();
    expect(container.querySelector('.rail-collapse')).toBeNull();
    expect(container.querySelector('.rail-collapsed-label')).toBeNull();
  });
});

describe('SessionRail — past conversations footer', () => {
  it('shows the footer and fires the handler when there are past conversations', () => {
    const onOpenPast = vi.fn();
    const { container } = renderRail({ onOpenPast });
    const btn = container.querySelector('.rail-past');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toMatch(/Past conversations/);
    fireEvent.click(btn as Element);
    expect(onOpenPast).toHaveBeenCalledTimes(1);
  });

  it('hides the footer when there are no past conversations (no handler)', () => {
    const { container } = renderRail();
    expect(container.querySelector('.rail-foot')).toBeNull();
    expect(container.querySelector('.rail-past')).toBeNull();
  });
});

describe('SessionRail — readable titles', () => {
  it('carries the full question in the row title so a clipped row stays readable', () => {
    const { container } = renderRail();
    expect(container.querySelector('.sess-row')?.getAttribute('title')).toBe(LONG_Q);
  });

  it('carries the full chapter name in the label title', () => {
    const { container } = renderRail();
    expect(container.querySelector('.sess-chapter-label')?.getAttribute('title')).toBe(
      'Chicago: summer itinerary',
    );
  });
});
