import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateBend, isValidBendFormula, formatBendValue } from '../src/lib/bend';
import { validateLiveResponse, FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';
import { BendStrip } from '../src/canvas/BendStrip';
import type { BendSpec } from '../src/data/conversation';

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
});
