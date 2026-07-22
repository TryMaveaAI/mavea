import { render } from '@testing-library/react';
import type { Block, ConversationSpec } from '../src/data/conversation';

// The family gate: while a needed block-family chunk is still in flight, TopicCanvas must
// not hold a BLANK grid — skeleton cards fill the tracks the real cards will take. The
// placeholder keeps the very same .card-grid div (ref + classes) so the responsive-grid
// observer and the note-gutter reservation survive the swap, and it announces itself as a
// loading state. Once the families land, the skeletons vanish and the real cards mount.
const gate = vi.hoisted(() => ({ ready: false }));
vi.mock('../src/canvas/blocks/useBlockFamilies', () => ({
  useBlockFamilies: () => gate.ready,
}));

import { TopicCanvas } from '../src/canvas/TopicCanvas';

function spec(blocks: Block[]): ConversationSpec {
  return {
    id: 't',
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
  };
}

const blocks: Block[] = [
  {
    type: 'insight',
    id: 'i1',
    col: 6,
    num: '1',
    props: { title: 'Revenue', summary: 's', conf: 'inferred' },
  },
  { type: 'list', col: 6, props: { title: 'Notes', items: ['a'] } },
] as Block[];

describe('TopicCanvas — family-gate skeletons', () => {
  it('shows skeletons inside the intact placeholder grid while families load', () => {
    gate.ready = false;
    const { container } = render(
      <TopicCanvas data={spec(blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    const grid = container.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    // The placeholder announces itself as a loading state…
    expect(grid!.getAttribute('role')).toBe('status');
    expect(grid!.getAttribute('aria-busy')).toBe('true');
    expect(grid!.getAttribute('aria-label')).toBeTruthy();
    // …and holds one skeleton per incoming block, no real cards yet.
    expect(grid!.querySelectorAll('.skel-card')).toHaveLength(2);
    expect(container.querySelector('.card:not(.skel-card)')).toBeNull();
  });

  it('mounts the real cards (and no skeletons) once the families are ready', () => {
    gate.ready = true;
    const { container } = render(
      <TopicCanvas data={spec(blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelectorAll('.skel-card')).toHaveLength(0);
    const grid = container.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    // The loaded grid is content, not a status region.
    expect(grid!.getAttribute('role')).toBeNull();
    expect(container.querySelectorAll('.card:not(.skel-card)').length).toBeGreaterThan(0);
  });
});
