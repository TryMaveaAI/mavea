// The "See this thread together" affordance: present and enabled the moment a thread has two
// or more moments to compose (not hover-revealed — hidden-until-hover made it undiscoverable),
// and absent entirely on a one-moment thread (a disabled ghost there was pure noise).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionRail } from '../src/live/voice/SessionRail';
import type { Chapter, Moment } from '../src/live/scrubber/chapters';
import type { TurnFrame } from '../src/live/history';
import type { ConversationSpec } from '../src/data/conversation';

function frame(question: string): TurnFrame {
  return {
    question,
    narration: '',
    mode: 'replace',
    tour: [],
    spec: { title: question, sub: '', blocks: [] } as unknown as ConversationSpec,
    at: 1000,
  };
}

function moment(frameIndex: number): Moment {
  return { frameIndex, question: `q${frameIndex}`, icon: 'mic', mode: 'replace', elements: [] };
}

function chapter(id: string, title: string, frameIndices: number[]): Chapter {
  return { id, title, color: 'var(--presence)', moments: frameIndices.map(moment) };
}

describe('SessionRail — the thread-compose button', () => {
  it('shows an enabled button on a multi-moment thread and none on a one-moment thread', () => {
    render(
      <SessionRail
        chapters={[chapter('ch-0', 'Tokyo', [0, 1]), chapter('ch-2', 'Budget', [2])]}
        frames={[frame('tokyo'), frame('plan it'), frame('budget')]}
        currentIndex={0}
        onJump={() => {}}
        onSeeTogether={() => {}}
        resumed={false}
        chatOpen={false}
        onToggleChat={() => {}}
      />,
    );

    const together = screen.getAllByRole('button', { name: /moments of this thread together/i });
    expect(together).toHaveLength(1); // Tokyo only — Budget (one moment) renders no button
    expect(together[0]).toBeEnabled();
    expect(together[0]).toHaveAccessibleName('See all 2 moments of this thread together');
    expect(screen.queryByLabelText(/one moment/i)).not.toBeInTheDocument();
  });
});
