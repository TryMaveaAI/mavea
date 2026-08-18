import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import type { ConversationScene, ConversationVideoOptions } from '../src/clip/conversation/types';

// The stage is judged here on what it composes, not on how the canvas paints — a real TopicCanvas
// would drag every block family into this test for no added signal. The bare [data-spot-id]
// children stand in for the cards the spotlight centres on.
vi.mock('../src/canvas', () => ({
  TopicCanvas: ({ data, spot }: { data: ConversationSpec; spot: string | null }) => (
    <div data-testid="topic-canvas" data-title={data.title} data-spot={spot ?? ''}>
      <div data-spot-id="live-1" />
      <div data-spot-id="live-2" />
    </div>
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
  audio: true,
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

// jsdom lays nothing out, so give the spotlight math a real geometry: a 400px-tall canvas whose
// cards sit at fixed layout offsets. The stage reads offsetTop/offsetHeight (never client rects —
// those move with the entrance animation), so these stubs are exactly the numbers it consumes.
const SPOT_TOP: Record<string, number> = { 'live-1': 300, 'live-2': 900 };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return SPOT_TOP[this.dataset.spotId ?? ''] ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.spotId) return 80;
    return this.classList.contains('topic-wrap') ? 2000 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.spotId) return this.closest('.topic-wrap');
    return this.classList.contains('topic-wrap') ? this.closest('.cvs-canvas') : null;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('cvs-canvas') ? 400 : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('centres a cued card by transform, from layout offsets the entrance cannot skew', () => {
    const { container, rerender } = render(
      <ConversationStage scene={scene({ spot: 'live-1' })} options={options} />,
    );
    const wrap = container.querySelector<HTMLElement>('.topic-wrap')!;
    // live-1: an 80px card 300px down a 400px window → 300 - (400 - 80) / 2, shifted up.
    expect(wrap.style.getPropertyValue('--cvs-shift')).toBe('-140px');
    // live-2 sits below the fold — the whole point of the transform is that this offset reaches
    // the exported raster, which never reproduced a scroll position.
    rerender(<ConversationStage scene={scene({ spot: 'live-2' })} options={options} />);
    expect(wrap.style.getPropertyValue('--cvs-shift')).toBe('-740px');
  });

  it('holds the current offset on a beat with no cue instead of gliding home', () => {
    const { container, rerender } = render(
      <ConversationStage scene={scene({ spot: 'live-2' })} options={options} />,
    );
    const wrap = container.querySelector<HTMLElement>('.topic-wrap')!;
    expect(wrap.style.getPropertyValue('--cvs-shift')).toBe('-740px');
    // The body beat after a question carries no spot — it used to smooth-scroll back to the top,
    // which is the "random scrolls" the export showed between every cue.
    rerender(<ConversationStage scene={scene({ spot: null })} options={options} />);
    expect(wrap.style.getPropertyValue('--cvs-shift')).toBe('-740px');
    // A cue whose card is not on this canvas holds the frame too, rather than jumping anywhere.
    rerender(<ConversationStage scene={scene({ spot: 'absent' })} options={options} />);
    expect(wrap.style.getPropertyValue('--cvs-shift')).toBe('-740px');
  });

  it('starts a new turn back at the top', () => {
    const { container, rerender } = render(
      <ConversationStage scene={scene({ spot: 'live-2' })} options={options} />,
    );
    rerender(
      <ConversationStage
        scene={scene({ turnIndex: 1, frame: frame('And sunsets?', 'Longer path') })}
        options={options}
      />,
    );
    expect(
      container.querySelector<HTMLElement>('.topic-wrap')!.style.getPropertyValue('--cvs-shift'),
    ).toBe('0px');
  });

  it('keys the glide transition off the glide prop so a cut stays a cut', () => {
    // jsdom applies no stylesheets, so the contract under test is the attribute the CSS keys on:
    // only [data-glide='true'] carries the 420ms transform transition.
    const { container, rerender } = render(<ConversationStage scene={scene()} options={options} />);
    expect(container.querySelector('.topic-wrap')?.getAttribute('data-glide')).toBe('true');
    rerender(<ConversationStage scene={scene()} options={options} glide={false} />);
    expect(container.querySelector('.topic-wrap')?.getAttribute('data-glide')).toBe('false');
  });
});
