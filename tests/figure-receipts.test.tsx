// A figure a card prints can open the sentence that states it — and ONLY a figure a source states.
// The canvas knows a block's id and the text it prints; the answer's ContentGraph knows which
// figures its own sources ground. These pin the join: what becomes a control, what stays plain text,
// and that a printed figure which no longer matches its receipt (a bend, a shared label) finds none.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Block } from '../src/data/conversation';
import { answerToContent } from '../src/live/content/fromAnswer';
import { figureIndex, receiptFor } from '../src/live/content/figureIndex';
import { KpiGrid } from '../src/canvas/KpiGrid';
import {
  FigureBlockContext,
  FigureReceiptsContext,
  type FigureReceipts,
} from '../src/canvas/figures/figureContext';

const kpis = (): Block =>
  ({
    id: 'live-2',
    type: 'kpi',
    props: {
      title: 'The scale',
      kpis: [
        { val: '36%', label: 'Activation rate' },
        { val: '58%', label: '30-day retention' },
      ],
    },
  }) as unknown as Block;

const intro = { id: 'live-1', type: 'insight', props: { title: 'Intro' } } as unknown as Block;
const SOURCE = 'Activation rate fell to 36% this quarter, the lowest in two years.';

function graph(blocks: Block[]) {
  return answerToContent(
    {
      title: 'Q3',
      blocks,
      sources: [{ title: 'Board pack', url: 'https://example.test/q3', snippet: SOURCE }],
    },
    SOURCE,
  );
}

describe('figureIndex', () => {
  const blocks = [intro, kpis()];
  const index = figureIndex(blocks, graph(blocks));

  it('addresses a grounded figure by the id of the block that prints it', () => {
    const id = receiptFor(index, 'live-2', 'Activation rate', '36%');
    expect(id).toBeDefined();
    const value = index.trust.values.get(id!);
    expect(value?.kind).toBe('grounded');
    expect(value?.kind === 'grounded' && value.resolution.receipt.quote).toBe(SOURCE);
  });

  it('gives a figure no source states no receipt', () => {
    expect(receiptFor(index, 'live-2', '30-day retention', '58%')).toBeUndefined();
  });

  it('refuses a printed figure that is not the number its source states', () => {
    // A bent card, or a second figure sharing the label, prints something else.
    expect(receiptFor(index, 'live-2', 'Activation rate', '41%')).toBeUndefined();
    expect(receiptFor(index, 'live-1', 'Activation rate', '36%')).toBeUndefined();
  });
});

describe('a money figure', () => {
  const MONEY = 'Revenue for the second quarter was $96.2 billion, up 56% from a year ago.';
  const revenue = (val: string): Block =>
    ({
      id: 'live-2',
      type: 'kpi',
      props: { title: 'The quarter', kpis: [{ val, label: 'Revenue' }] },
    }) as unknown as Block;
  const indexOf = (block: Block, source: string) =>
    figureIndex(
      [intro, block],
      answerToContent(
        {
          title: 'Q2',
          blocks: [intro, block],
          sources: [{ title: '10-Q', url: 'https://example.test/q2', snippet: source }],
        },
        source,
      ),
    );

  it('opens the sentence that states it in billions', () => {
    // Every grounded answer's headline figure looks like this; with only percentages in the
    // fixtures, none of them could ever become a receipt.
    const index = indexOf(revenue('$96.2B'), MONEY);
    expect(receiptFor(index, 'live-2', 'Revenue', '$96.2B')).toBeDefined();
  });

  it('finds nothing when the source states the same digits at another scale', () => {
    const index = indexOf(revenue('$96.2B'), 'Revenue for the quarter was $96.2 million.');
    expect(receiptFor(index, 'live-2', 'Revenue', '$96.2B')).toBeUndefined();
  });
});

describe('a printed figure', () => {
  const renderKpis = (receipts: FigureReceipts | null) =>
    render(
      <FigureReceiptsContext.Provider value={receipts}>
        <FigureBlockContext.Provider value="live-2">
          <KpiGrid {...(kpis() as Extract<Block, { type: 'kpi' }>).props} />
        </FigureBlockContext.Provider>
      </FigureReceiptsContext.Provider>,
    );

  it('opens its receipt when a source states it, and stays plain text when none does', () => {
    const blocks = [intro, kpis()];
    const index = figureIndex(blocks, graph(blocks));
    const open = vi.fn();
    renderKpis({ idFor: (b, l, s) => receiptFor(index, b, l, s), open });

    const sourced = screen.getByRole('button', { name: /36%.*Activation rate.*source/ });
    expect(sourced.closest('.kpi-val')).not.toBeNull();
    fireEvent.click(sourced);
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^block:1:/), sourced);

    expect(screen.queryByRole('button', { name: /58%/ })).toBeNull();
    expect(screen.getByText('58%').tagName).toBe('DIV');
  });

  it('renders exactly as before outside a host that has receipts', () => {
    renderKpis(null);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
