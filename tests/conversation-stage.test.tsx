import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import type { ConversationScene, ConversationVideoOptions } from '../src/clip/conversation/types';

// The stage is judged here on what it composes, not on how the canvas paints — a real TopicCanvas
// would drag every block family into this test for no added signal.
vi.mock('../src/canvas', () => ({
  TopicCanvas: ({ data, spot }: { data: ConversationSpec; spot: string | null }) => (
    <div data-testid="topic-canvas" data-title={data.title} data-spot={spot ?? ''} />
  ),
}));
vi.mock('../src/presence/Presence', () => ({
  Presence: ({ state }: { state: string }) => <div data-testid="presence" data-state={state} />,
}));
vi.mock('../src/live/annotate/AnnotationLayer', () => ({
  AnnotationLayer: () => <div data-testid="ink" />,
}));

import { ConversationStage } from '../src/clip/conversation/ConversationStage';

const block = (id: string): Block =>
  ({ type: 'insight', id, col: 6, delay: 0, props: { title: id } }) as unknown as Block;

const frame = (question: string, title: string): TurnFrame => ({
  question,
  narration: 'Because shorter wavelengths scatter more.',
  mode: 'replace',
  topicShift: true,
  tour: [],
  spec: { title, blocks: [block('live-1')] } as ConversationSpec,
  at: 100,
});

const options: ConversationVideoOptions = {
  size: '1080p',
  quality: 'high',
  captions: true,
  spotlights: true,
  penMarks: true,
  presence: true,
};

const scene = (over: Partial<ConversationScene> = {}): ConversationScene => ({
  frame: frame('Why is the sky blue?', 'Rayleigh scattering'),
  turnIndex: 0,
  startMs: 0,
  durationMs: 1_000,
  spot: null,
  caption: null,
  ink: [],
  questionOnly: false,
  ...over,
});

describe('ConversationStage', () => {
  it('states the question on the ask beat instead of showing a dimmed answer', () => {
    const { container, queryByTestId } = render(
      <ConversationStage scene={scene({ questionOnly: true })} options={options} />,
    );
    expect(container.querySelector('.cvs-ask-line')?.textContent).toBe('Why is the sky blue?');
    // The canvas is absent, not merely faded — a half-visible answer under the question is the
    // frame that read as a half-loaded page.
    expect(queryByTestId('topic-canvas')).toBeNull();
    expect(queryByTestId('presence')?.getAttribute('data-state')).toBe('thinking');
  });

  it('falls back to the answer title when a turn carries no question text', () => {
    const { container } = render(
      <ConversationStage
        scene={scene({ frame: frame('', 'Rayleigh scattering'), questionOnly: true })}
        options={options}
      />,
    );
    expect(container.querySelector('.cvs-ask-line')?.textContent).toBe('Rayleigh scattering');
  });

  it('mounts the answer canvas on the content beat and carries the spotlight into it', () => {
    const { getByTestId, container } = render(
      <ConversationStage scene={scene({ spot: 'live-1' })} options={options} />,
    );
    expect(getByTestId('topic-canvas').getAttribute('data-spot')).toBe('live-1');
    expect(container.querySelector('.cvs-ask')).toBeNull();
    expect(getByTestId('presence').getAttribute('data-state')).toBe('speaking');
  });

  it('remounts the canvas per turn so each answer plays its own entrance', () => {
    const { getByTestId, rerender } = render(
      <ConversationStage scene={scene({ turnIndex: 0 })} options={options} />,
    );
    const first = getByTestId('topic-canvas');
    rerender(
      <ConversationStage scene={scene({ turnIndex: 0, spot: 'live-1' })} options={options} />,
    );
    // Same turn: the very same node, so a spotlight move never restarts the reveal.
    expect(getByTestId('topic-canvas')).toBe(first);

    rerender(
      <ConversationStage
        scene={scene({ turnIndex: 1, frame: frame('And sunsets?', 'Longer path') })}
        options={options}
      />,
    );
    expect(getByTestId('topic-canvas')).not.toBe(first);
  });

  it('reserves the caption band whenever captions are on, not only when a line is showing', () => {
    const { container, rerender } = render(
      <ConversationStage
        scene={scene({ caption: 'Shorter wavelengths scatter.' })}
        options={options}
      />,
    );
    const stage = container.querySelector('.cvs-stage')!;
    expect(stage.getAttribute('data-captioned')).toBe('true');
    expect(container.querySelector('.cvs-caption')?.textContent).toBe(
      'Shorter wavelengths scatter.',
    );

    // A silent beat mid-turn must not hand its reserved space back, or the answer reflows under it.
    rerender(<ConversationStage scene={scene({ caption: null })} options={options} />);
    expect(container.querySelector('.cvs-stage')?.getAttribute('data-captioned')).toBe('true');
    expect(container.querySelector('.cvs-caption')).toBeNull();

    rerender(
      <ConversationStage
        scene={scene({ caption: 'x' })}
        options={{ ...options, captions: false }}
      />,
    );
    expect(container.querySelector('.cvs-stage')?.getAttribute('data-captioned')).toBe('false');
    expect(container.querySelector('.cvs-caption')).toBeNull();
  });

  it('drops the optional layers the studio turned off', () => {
    const { queryByTestId } = render(
      <ConversationStage
        scene={scene({ caption: 'spoken' })}
        options={{ ...options, presence: false, penMarks: false }}
      />,
    );
    expect(queryByTestId('presence')).toBeNull();
    expect(queryByTestId('ink')).toBeNull();
  });
});
