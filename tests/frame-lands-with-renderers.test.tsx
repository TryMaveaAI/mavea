import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { loadDemoConversation } from '../src/demo/corpus';
import { extendedRender, familiesFor, loadFamilies } from '../src/canvas/blocks/loader';

// The dev replay's follow-up brings block families its first answer never used, onto a board
// that is already showing. A live spec's id is 'live' for the whole session, so the canvas's
// first-paint gate has long since latched: each late card has to wait for its own chunk and
// draw itself when it lands. Before it did, every such card painted as its plain-text fallback
// ("No readable details…", or a bare list for a comparison matrix) and stayed that way until
// something unrelated re-rendered it.
const dev = (await loadDemoConversation('dev'))?.frames ?? [];
const studentFirst = (await loadDemoConversation('student'))?.frames[0].spec;
const live = (spec: ConversationSpec): ConversationSpec => ({ ...spec, id: 'live' });
const lateTypes = ['httpexchange', 'comparematrix'];

function Board({ spec }: { spec: ConversationSpec }) {
  return <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} />;
}

async function expectEveryCardDrawn(container: HTMLElement, spec: ConversationSpec) {
  await waitFor(() => {
    expect(container.querySelectorAll('.skel-card')).toHaveLength(0);
    expect(container.querySelectorAll('[data-spot-id]').length).toBe(spec.blocks.length);
  });
  expect(container.querySelectorAll('.fb-card, .cx-empty')).toHaveLength(0);
}

describe('a card whose family arrives after the board is showing', () => {
  it('draws a follow-up on the same live id once its chunk lands', async () => {
    const [first, followUp] = [live(dev[0].spec), live(dev[1].spec)];
    expect(followUp.blocks.map((b) => b.type)).toEqual(expect.arrayContaining(lateTypes));
    await loadFamilies(familiesFor(first.blocks));
    for (const t of lateTypes) expect(extendedRender(t)).toBeNull();

    const { container, rerender } = render(<Board spec={first} />);
    await expectEveryCardDrawn(container, first);
    rerender(<Board spec={followUp} />);
    // The cards already on the board stay up while the late ones wait.
    expect(container.querySelectorAll('.skel-card').length).toBeGreaterThan(0);
    await expectEveryCardDrawn(container, followUp);
    for (const t of lateTypes) expect(extendedRender(t)).not.toBeNull();
  });

  it('draws a restored answer over a showing board once its chunk lands', async () => {
    expect(studentFirst?.blocks[0].type).toBe('streamgraph');
    expect(extendedRender('streamgraph')).toBeNull();
    const board = live(dev[0].spec);
    const { container, rerender } = render(<Board spec={board} />);
    await expectEveryCardDrawn(container, board);
    const restored = live(studentFirst!);
    rerender(<Board spec={restored} />);
    await expectEveryCardDrawn(container, restored);
  });
});
