import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec, CompositeProps } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// The composite block is a model-arranged sub-grid of OTHER blocks, rendered by TopicCanvas
// itself so each region goes through the same vetted render path. These tests confirm the
// recursion renders children, respects the per-region span, and is depth-capped so a
// pathological self-nested payload can't recurse without bound.

function specForBlock(block: Block): ConversationSpec {
  return {
    id: 'money',
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks: [block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

function composite(props: CompositeProps): Block {
  return { type: 'composite', id: 'c1', delay: 0, props } as Block;
}

function renderCanvas(block: Block) {
  return render(
    <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
  );
}

describe('composite block rendering', () => {
  it('renders each region’s child block through the real path', () => {
    const { container, getByText } = renderCanvas(
      composite({
        title: 'Two views',
        regions: [
          {
            block: {
              type: 'kpi',
              id: 'k',
              props: { title: 'Metrics', kpis: [{ val: '9', label: 'Open' }] },
            } as Block,
            span: 5,
          },
          {
            block: {
              type: 'list',
              id: 'l',
              props: { title: 'Why', items: ['alpha', 'beta'] },
            } as Block,
            span: 7,
          },
        ],
      }),
    );
    expect(container.querySelector('.cmp-grid')).toBeTruthy();
    expect(container.querySelectorAll('.cmp-cell')).toHaveLength(2);
    // the children actually rendered their content
    expect(getByText('alpha')).toBeTruthy();
    expect(getByText('Metrics')).toBeTruthy();
  });

  it('applies the per-region span to the cell', () => {
    const { container } = renderCanvas(
      composite({
        title: 'Spans',
        regions: [
          {
            block: { type: 'list', id: 'a', props: { title: 'A', items: ['x'] } } as Block,
            span: 4,
          },
          {
            block: { type: 'list', id: 'b', props: { title: 'B', items: ['y'] } } as Block,
            span: 8,
          },
        ],
      }),
    );
    const cells = container.querySelectorAll<HTMLElement>('.cmp-cell');
    expect(cells[0].style.getPropertyValue('--cmp-span')).toBe('4');
    expect(cells[1].style.getPropertyValue('--cmp-span')).toBe('8');
  });

  it('does not render a composite nested beyond the depth cap', () => {
    // an outer composite whose region is itself a composite whose region is a third
    // composite — the deepest one must be cut off (renders nothing) rather than recurse.
    const inner = composite({
      title: 'Inner',
      regions: [
        { block: { type: 'list', id: 'li', props: { title: 'LI', items: ['deep'] } } as Block },
        { block: { type: 'list', id: 'li2', props: { title: 'LI2', items: ['deep2'] } } as Block },
      ],
    });
    const middle = composite({
      title: 'Middle',
      regions: [
        { block: inner },
        { block: { type: 'list', id: 'lm', props: { title: 'LM', items: ['mid'] } } as Block },
      ],
    });
    const outer = composite({
      title: 'Outer',
      regions: [
        { block: middle },
        { block: { type: 'list', id: 'lo', props: { title: 'LO', items: ['top'] } } as Block },
      ],
    });
    const { queryByText } = renderCanvas(outer);
    // depth 0 (outer) and 1 (middle) render; depth 2 (inner) is capped → its text is absent
    expect(queryByText('top')).toBeTruthy();
    expect(queryByText('mid')).toBeTruthy();
    expect(queryByText('deep')).toBeNull();
  });
});
