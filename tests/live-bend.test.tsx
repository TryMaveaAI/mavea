import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateBend, isValidBendFormula, formatBendValue } from '../src/lib/bend';
import { validateLiveResponse, FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';
import { BendStrip } from '../src/canvas/BendStrip';
import { bendBlock } from '../src/canvas/bendBlock';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import type { BendSpec, Block, ConversationSpec } from '../src/data/conversation';

primeExtendedRegistry(EXTENDED_REGISTRY);

// Bendable answers: the whitelist evaluator does real arithmetic and nothing else, the
// schema only keeps a fully-valid bend (resolved to a real block), and the strip recomputes
// its outputs live as the slider moves.

afterEach(cleanup);

describe('bend formula evaluator', () => {
  it('does arithmetic with precedence, parens and unary minus', () => {
    expect(evaluateBend('x*0.3', 5000)).toBe(1500);
    expect(evaluateBend('(x-1000)/2 + 10', 5000)).toBe(2010);
    expect(evaluateBend('-x + 100', 40)).toBe(60);
    expect(evaluateBend('x*2+1*3', 10)).toBe(23); // * binds tighter than +
  });

  it('rejects anything outside the whitelist — no eval, ever', () => {
    for (const evil of [
      'x; alert(1)',
      'Math.max(x,1)',
      'x**2',
      'window',
      'x)(',
      '',
      '5/0*x && 1',
    ]) {
      expect(evaluateBend(evil, 1), evil).toBeNull();
    }
    expect(isValidBendFormula('x*0.3')).toBe(true);
    expect(isValidBendFormula('100')).toBe(false); // must reference x
  });

  it('formats values readably', () => {
    expect(formatBendValue(2100)).toBe('2,100');
    expect(formatBendValue(3.456)).toBe('3.46');
  });
});

describe('schema buildBend', () => {
  const payload = (bend: unknown) => ({
    title: 'Budget',
    sub: '',
    narration: 'Here is the plan.',
    blocks: [
      { type: 'insight', props: { title: 'Plan', body: 'x', conf: 90 } },
      { type: 'kpi', props: { items: [{ label: 'Needs', value: '$2,500' }] } },
    ],
    bend,
  });

  it('keeps a valid bend, resolved to the indexed block id', () => {
    const v = validateLiveResponse(
      payload({
        index: 1,
        label: 'Monthly budget',
        param: { value: 5000, min: 2000, max: 9000, step: 100, unit: '$' },
        outputs: [
          { label: 'Needs', formula: 'x*0.5', unit: '$' },
          { label: 'Wants', formula: 'x*0.3', unit: '$' },
        ],
      }),
      FRONTIER_BLOCK_TYPES,
    );
    expect(v?.bend).toBeTruthy();
    expect(v!.bend!.blockId).toBe(v!.blocks[1].id);
    expect(v!.bend!.outputs).toHaveLength(2);
  });

  it('drops the whole bend on a bad formula, bad range, or bad index', () => {
    const bad = [
      {
        index: 1,
        label: 'B',
        param: { value: 1, min: 0, max: 10, step: 1 },
        outputs: [{ label: 'Evil', formula: 'alert(x)' }],
      },
      {
        index: 1,
        label: 'B',
        param: { value: 1, min: 10, max: 0, step: 1 },
        outputs: [{ label: 'O', formula: 'x*2' }],
      },
      {
        index: 99,
        label: 'B',
        param: { value: 1, min: 0, max: 10, step: 1 },
        outputs: [{ label: 'O', formula: 'x*2' }],
      },
    ];
    for (const b of bad) {
      expect(validateLiveResponse(payload(b), FRONTIER_BLOCK_TYPES)?.bend).toBeUndefined();
    }
  });
});

describe('BendStrip', () => {
  const bend: BendSpec = {
    blockId: 'b1',
    label: 'Monthly budget',
    param: { value: 5000, min: 2000, max: 9000, step: 100, unit: '$' },
    outputs: [{ label: 'Wants', formula: 'x*0.3', unit: '$' }],
  };

  it('recomputes outputs live as the slider moves, formula in the tooltip', () => {
    render(<BendStrip bend={bend} />);
    expect(screen.getByText('1,500')).toBeTruthy(); // 5000 * 0.3
    fireEvent.change(screen.getByLabelText('Bend Monthly budget'), { target: { value: 7000 } });
    expect(screen.getByText('2,100')).toBeTruthy();
    expect(screen.getByText('Wants').closest('li')?.title).toContain(
      'x'.replace('x', '(Monthly budget)'),
    );
  });

  it('recomputes the attached budget card, not only the readouts below it', () => {
    const block: Block = {
      id: 'b1',
      type: 'budgetallocator',
      col: 12,
      props: {
        title: 'Allocate the full $5,000',
        income: 5000,
        incomeLabel: 'Monthly income',
        unit: '$',
        envelopes: [
          { label: 'Housing', amount: 1500, group: 'fixed' },
          { label: 'Dining', amount: 500, group: 'flexible' },
        ],
      },
    };
    const spec: ConversationSpec = {
      id: 'live',
      workspace: 'Live',
      title: 'Budget',
      sub: '',
      opener: '',
      context: [],
      blocks: [block],
      proof: null,
      bend,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    };
    const { container } = render(
      <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} bend={bend} />,
    );

    fireEvent.change(screen.getByLabelText('Bend Monthly budget'), { target: { value: 5400 } });
    expect(container.querySelector('.card-eyebrow')).toHaveTextContent('Allocate the full $5,400');
    expect(container.querySelector('.ba-income-val')).toHaveTextContent('$5,400');
    expect(container.querySelector('.ba-env-amt')).toHaveTextContent('$1,620');
    expect(container.querySelector('.ba-rem-val')).toHaveTextContent('$3,240');
  });
});

// Every card follows the slider by identity: a figure equal to the input, or to an output at the
// authored input, IS that quantity. Anything that cannot be told apart stays as authored.
describe('bendBlock — the rest of the canvas follows the slider', () => {
  const bend: BendSpec = {
    blockId: 'live-8',
    label: 'Monthly contribution',
    param: { value: 200, min: 0, max: 1000, step: 10, unit: '$' },
    outputs: [{ label: 'Total deposited (10 years)', formula: 'x*12*10', unit: '$' }],
  };
  const insight = (props: Record<string, unknown>): Block =>
    ({ id: 'live-2', type: 'insight', num: '01', props: { title: 'Saving', ...props } }) as Block;

  it('moves the input and every output wherever the card states them', () => {
    const out = bendBlock(
      insight({ summary: 'Putting <b>$200</b> a month away deposits $24,000 by 2035.' }),
      bend,
      300,
    );
    expect(out.props).toMatchObject({
      summary: 'Putting <b>$300</b> a month away deposits $36,000 by 2035.',
    });
  });

  it('moves a numeric prop that is the quantity, and keeps the block when nothing matches', () => {
    const kpi = {
      id: 'live-3',
      type: 'kpi',
      props: {
        title: 'Plan',
        kpis: [
          { label: 'Deposited', value: 24000 },
          { label: 'Years', value: 10 },
        ],
      },
    } as unknown as Block;
    expect(bendBlock(kpi, bend, 250).props).toMatchObject({
      kpis: [{ value: 30000 }, { value: 10 }],
    });
    const untouched = insight({ summary: 'Start early; compounding does the rest.' });
    expect(bendBlock(untouched, bend, 250)).toBe(untouched);
    expect(bendBlock(insight({ summary: '$200' }), bend, 200).props).toMatchObject({
      summary: '$200',
    });
  });

  it('leaves a figure in another unit, inside markup, or shared by two quantities as authored', () => {
    expect(
      bendBlock(insight({ summary: '200 hours, <a href="/p/200">link</a>' }), bend, 300).props,
    ).toMatchObject({ summary: '200 hours, <a href="/p/200">link</a>' });

    const twin: BendSpec = {
      ...bend,
      outputs: [{ label: 'Same', formula: 'x*2-x', unit: '$' }],
    };
    // x and 400-x are both 200 at the authored input but part ways once dragged: the card cannot
    // say which it means, so neither moves it.
    const ambiguous: BendSpec = {
      ...bend,
      outputs: [{ label: 'Other', formula: '400-x', unit: '$' }],
    };
    expect(bendBlock(insight({ summary: '$200' }), twin, 300).props).toMatchObject({
      summary: '$300',
    });
    expect(bendBlock(insight({ summary: '$200' }), ambiguous, 300).props).toMatchObject({
      summary: '$200',
    });
  });
  it('never moves scale, geometry or code that happens to equal the input', () => {
    const price: BendSpec = {
      blockId: 'live-1',
      label: 'Price',
      param: { value: 100, min: 50, max: 200, step: 5, unit: '$' },
      outputs: [],
    };
    const gauge = {
      id: 'live-4',
      type: 'gauge',
      props: { title: 'Margin', value: 62, max: 100, target: 100 },
    } as unknown as Block;
    expect(bendBlock(gauge, price, 150)).toBe(gauge);
    expect(
      bendBlock(insight({ summary: 'At $100 a seat, after the $100M round.' }), price, 150).props,
    ).toMatchObject({ summary: 'At $150 a seat, after the $100M round.' });
    const code = {
      id: 'live-5',
      type: 'svgblock',
      props: { title: 'Plot', d: 'M100 100 L 200 100', code: 'cost = $100' },
    } as unknown as Block;
    expect(bendBlock(code, price, 150)).toBe(code);
  });

  it('moves a figure that reads like a year when its unit says it is the quantity', () => {
    const income: BendSpec = {
      blockId: 'live-1',
      label: 'Income',
      param: { value: 2000, min: 1000, max: 5000, step: 100, unit: '$' },
      outputs: [{ label: 'Needs', formula: 'x*0.5', unit: '$' }],
    };
    expect(
      bendBlock(insight({ summary: 'Income $2,000 in 2026: needs $1,000.' }), income, 3000).props,
    ).toMatchObject({ summary: 'Income $3,000 in 2026: needs $1,500.' });
  });

  it('leaves prose alone when the bend names no unit, and a row in another unit alone', () => {
    const seats: BendSpec = {
      blockId: 'live-1',
      label: 'Seats',
      param: { value: 50, min: 10, max: 100, step: 1 },
      outputs: [],
    };
    const text = insight({ summary: 'Loop range(50) over 50 seats.' });
    expect(bendBlock(text, seats, 80)).toBe(text);
    const kpi = {
      id: 'live-3',
      type: 'kpi',
      props: { title: 'Plan', kpis: [{ label: 'Weight', value: 24000, unit: 'kg' }] },
    } as unknown as Block;
    expect(bendBlock(kpi, bend, 300)).toBe(kpi);
  });
});
