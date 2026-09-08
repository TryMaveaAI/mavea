// What the last turn did to the canvas, made visible: which cards it edited, which it added,
// and one line saying so.
//
// The danger here is not the chrome, it is the LIE. Block ids are positional and reused across
// turns — `live-3` in turn 4 is a different object from `live-3` in turn 5 — so a delta applied
// to the wrong canvas marks an unrelated card as edited. That is worse than no marks at all,
// and it is the bug class this codebase has already lost four separate effects to.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { answerSignature } from '../src/data/conversation';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

primeExtendedRegistry(EXTENDED_REGISTRY);

const insight = (id: string, title: string): Block =>
  ({ type: 'insight', id, num: '1', col: 6, props: { title, body: 'b' } }) as unknown as Block;

// The live id is the CONSTANT 'live' for every answer of a session — which is exactly why a
// delta has to be scoped by content signature and not by spec id.
const spec = (blocks: Block[], id = 'live'): ConversationSpec =>
  ({
    id,
    workspace: 'T',
    title: 'T',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  }) as unknown as ConversationSpec;

const three = () => [
  insight('live-1', 'Alpha'),
  insight('live-2', 'Beta'),
  insight('live-3', 'Gamma'),
];

function mount(revision: Parameters<typeof TopicCanvas>[0]['revision'], blocks = three()) {
  return render(
    <TopicCanvas
      data={spec(blocks)}
      spot={null}
      built={{}}
      onProve={() => {}}
      onAskBlock={() => {}}
      onLens={() => {}}
      viewMode="board"
      onViewMode={() => {}}
      revision={revision}
    />,
  );
}

const sigOf = (blocks: Block[]) => answerSignature({ id: 'live', blocks });

describe('the marks a turn leaves', () => {
  it('marks what it edited and what it added, and nothing else', () => {
    const blocks = three();
    const { container } = mount(
      { sig: sigOf(blocks), changedIds: ['live-1'], addedIds: ['live-3'] },
      blocks,
    );
    const rev = (id: string) =>
      container.querySelector(`[data-spot-id="${id}"]`)!.getAttribute('data-rev');
    expect(rev('live-1')).toBe('edit');
    expect(rev('live-3')).toBe('add');
    expect(rev('live-2')).toBeNull();
    expect(container.textContent).toContain('Edited');
    expect(container.textContent).toContain('New');
  });

  it('says what the turn did once, in one line, and takes you to it', () => {
    const blocks = three();
    const onLens = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec(blocks)}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
        onLens={onLens}
        viewMode="board"
        onViewMode={() => {}}
        revision={{ sig: sigOf(blocks), changedIds: ['live-1'], addedIds: ['live-3'] }}
      />,
    );
    const pill = container.querySelector('.rev-pill') as HTMLButtonElement;
    expect(pill.textContent).toBe('1 edited · 1 new');
    fireEvent.click(pill);
    // It opens the first card the turn touched — dead text naming something unreachable is
    // worse than no text.
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
  });

  it('says nothing at all when the turn changed nothing', () => {
    const blocks = three();
    const { container } = mount({ sig: sigOf(blocks), changedIds: [], addedIds: [] }, blocks);
    expect(container.querySelector('.rev-pill')).toBeNull();
    expect(container.querySelector('.rev-chip')).toBeNull();
  });

  it('says nothing when there is no delta at all (a replayed or older frame)', () => {
    const { container } = mount(null);
    expect(container.querySelector('.rev-pill')).toBeNull();
    expect(container.querySelector('[data-rev]')).toBeNull();
  });

  // THE regression this file exists for.
  it('refuses a delta measured against a DIFFERENT canvas', () => {
    const blocks = three();
    // Same spec id ('live', as every live answer has), same ids, different content — so only the
    // signature can tell them apart.
    const { container } = mount(
      { sig: sigOf([insight('live-1', 'Something else')]), changedIds: ['live-1'], addedIds: [] },
      blocks,
    );
    expect(container.querySelector('[data-rev]')).toBeNull();
    expect(container.querySelector('.rev-pill')).toBeNull();
  });
});

describe('an edited card starts again', () => {
  // A refine swaps props under the same id, so the component instance survives — and 252 of the
  // extended components hold their own state, so a card edited from five rows to three can be
  // left pointing at row four. Keying an edited card on the revision discards that uniformly.
  it('keys an edited card on the revision, and leaves the others alone', () => {
    const blocks = three();
    const { container, rerender } = mount(
      { sig: sigOf(blocks), changedIds: ['live-1'], addedIds: [] },
      blocks,
    );
    const before = {
      edited: container.querySelector('[data-spot-id="live-1"]'),
      untouched: container.querySelector('[data-spot-id="live-2"]'),
    };
    // A later turn edits the same slot again: the key has to change, or a card edited twice in a
    // row never replays anything.
    const next = [
      insight('live-1', 'Alpha'),
      insight('live-2', 'Beta'),
      insight('live-3', 'Delta'),
    ];
    rerender(
      <TopicCanvas
        data={spec(next)}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
        onLens={() => {}}
        viewMode="board"
        onViewMode={() => {}}
        revision={{ sig: sigOf(next), changedIds: ['live-1'], addedIds: [] }}
      />,
    );
    expect(container.querySelector('[data-spot-id="live-1"]')).not.toBe(before.edited);
    expect(container.querySelector('[data-spot-id="live-2"]')).toBe(before.untouched);
  });
});
