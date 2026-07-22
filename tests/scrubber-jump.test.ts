import { reducer, INITIAL, type LiveTurnState } from '../src/live/useLiveTurn';
import type { TurnFrame } from '../src/live/history';
import type { ConversationSpec } from '../src/data/conversation';

function spec(title: string): ConversationSpec {
  return { id: 'live', title, sub: '', blocks: [], suggests: [] } as unknown as ConversationSpec;
}
function frame(title: string): TurnFrame {
  return { question: 'q', narration: '', mode: 'replace', tour: [], spec: spec(title), at: 0 };
}

const withFrames: LiveTurnState = {
  ...INITIAL,
  spec: spec('live head'),
  frames: [frame('first'), frame('second')],
  turn: 2,
  spot: 'block-3',
};

describe('useLiveTurn reducer — scrubber jump', () => {
  it('jumps the view to a past frame and clears the spotlight', () => {
    const after = reducer(withFrames, { type: 'jump', index: 0 });
    expect(after.viewIndex).toBe(0);
    expect(after.spot).toBeNull();
    // the live head spec is untouched (only the view changes)
    expect(after.spec?.title).toBe('live head');
  });

  it('ignores an out-of-range jump (no-op)', () => {
    expect(reducer(withFrames, { type: 'jump', index: 9 })).toBe(withFrames);
    expect(reducer(withFrames, { type: 'jump', index: -1 })).toBe(withFrames);
  });

  it('snaps back to the live head when a new turn starts', () => {
    const jumped = reducer(withFrames, { type: 'jump', index: 0 });
    expect(jumped.viewIndex).toBe(0);
    expect(reducer(jumped, { type: 'start' }).viewIndex).toBeNull();
  });

  it('clears the view when a fresh canvas is restored from the Library', () => {
    const jumped = reducer(withFrames, { type: 'jump', index: 0 });
    const restored = reducer(jumped, {
      type: 'restore',
      spec: spec('resumed'),
      question: 'resume',
      at: 1000,
    });
    expect(restored.viewIndex).toBeNull();
  });

  it('starts at the live head (viewIndex null) by default', () => {
    expect(INITIAL.viewIndex).toBeNull();
  });
});

describe('useLiveTurn reducer — composed-thread preview', () => {
  it('shows a composed spec in place of any frame and clears the jump', () => {
    const jumped = reducer(withFrames, { type: 'jump', index: 0 });
    const preview = reducer(jumped, { type: 'preview', spec: spec('this thread') });
    expect(preview.viewOverride?.title).toBe('this thread');
    expect(preview.viewIndex).toBeNull();
    // frames + live head are untouched — it is a non-destructive view
    expect(preview.frames).toBe(withFrames.frames);
    expect(preview.spec?.title).toBe('live head');
  });

  it('clears the preview with a null spec', () => {
    const preview = reducer(withFrames, { type: 'preview', spec: spec('thread') });
    expect(reducer(preview, { type: 'preview', spec: null }).viewOverride).toBeNull();
  });

  it('drops the preview on jump, a new turn, and a restore', () => {
    const preview = reducer(withFrames, { type: 'preview', spec: spec('thread') });
    expect(reducer(preview, { type: 'jump', index: 1 }).viewOverride).toBeNull();
    expect(reducer(preview, { type: 'start' }).viewOverride).toBeNull();
    expect(
      reducer(preview, { type: 'restore', spec: spec('resumed'), question: 'r', at: 1 })
        .viewOverride,
    ).toBeNull();
  });

  it('starts with no preview by default', () => {
    expect(INITIAL.viewOverride).toBeNull();
  });
});
