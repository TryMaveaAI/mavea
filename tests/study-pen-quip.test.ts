// The margin quip is the ONE line a hand scrawls beside an object. It has exactly two jobs:
// say something about THIS object, and fit the margin. A stock sentence repeated beside every
// card is wallpaper — it shipped once, and this is what stops it shipping again.
import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { penQuip } from '../src/live/content/penQuip';
import { assumptionIn, studyPromptIn } from '../src/live/content/notableIn';

const MARGIN_CAP = 46;

function block(type: string, props: unknown): Block {
  return { type, id: `${type}-1`, col: 12, num: '1', props } as Block;
}

const CASES: { name: string; block: Block }[] = [
  {
    name: 'insight',
    block: block('insight', { title: 'ARR', stat: '$15.1M', delta: '+21.8%', summary: 'grew' }),
  },
  {
    name: 'kpi',
    block: block('kpi', {
      kpis: [
        { label: 'ARR', val: '$15.1M' },
        { label: 'Churn', val: '2.8%' },
      ],
    }),
  },
  {
    name: 'breakdown',
    block: block('breakdown', {
      rows: [
        { name: 'Payroll', pct: 62, val: '$53K' },
        { name: 'Infra', pct: 21, val: '$18K' },
        { name: 'GTM', pct: 17, val: '$14K' },
      ],
    }),
  },
  {
    name: 'chart',
    block: block('chart', {
      labels: ['Q1', 'Q2', 'Q3'],
      series: [{ name: 'ARR', data: [12.4, 13.8, 15.1] }],
    }),
  },
  {
    name: 'compare',
    block: block('compare', {
      options: [{ name: 'Rail' }, { name: 'Car' }],
      criteria: [
        { name: 'Cost', cells: [{ win: true }, {}] },
        { name: 'Speed', cells: [{ win: true }, {}] },
      ],
    }),
  },
  {
    name: 'checks',
    block: block('checks', {
      items: [{ status: 'fail' }, { status: 'pass' }, { status: 'pass' }],
    }),
  },
  {
    name: 'list',
    block: block('list', { items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }),
  },
  {
    name: 'donut',
    block: block('donut', {
      rows: [
        { label: 'North America', pct: 55 },
        { label: 'EMEA', pct: 30 },
      ],
    }),
  },
];

describe('the pen quip is about the object, not about nothing', () => {
  for (const { name, block: b } of CASES) {
    it(`${name} scrawls a line that fits the margin`, () => {
      const quip = penQuip(b, 0);
      expect(quip, `${name} produced no quip`).toBeTruthy();
      expect(quip!.length).toBeLessThanOrEqual(MARGIN_CAP);
      expect(quip!.trim()).toBe(quip);
    });
  }

  it('never writes the same line beside two different KINDS of object', () => {
    // The failure this exists for: one stock question ("What would have to change for this to
    // stop being true?") beside every card in the answer.
    const quips = CASES.map(({ block: b }) => penQuip(b, 0)).filter(Boolean) as string[];
    expect(new Set(quips).size).toBe(quips.length);
  });

  it('varies its phrasing between two same-kind objects in one answer', () => {
    // Three lists in one answer must not repeat one sentence three times; the block's own index
    // seeds the choice, so the variation is deterministic rather than random.
    const list = CASES.find((c) => c.name === 'list')!.block;
    const first = penQuip(list, 0);
    const second = penQuip(list, 1);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('reads the object it is about: the quip carries that block’s own figures', () => {
    expect(penQuip(CASES[0].block, 0)).toContain('+21.8%');
    expect(penQuip(CASES[2].block, 0)).toContain('Payroll');
    expect(penQuip(CASES[5].block, 0)).toContain('1 failed');
  });

  it('keeps the margin clean rather than inventing a remark it cannot ground', () => {
    // Prose, images, diagrams: nothing structural to read, so nothing is written.
    expect(penQuip(block('prose', { text: 'A paragraph.' }), 0)).toBeNull();
    expect(penQuip(block('list', { items: [{ text: 'only one' }] }), 0)).toBeNull();
    expect(penQuip(block('chart', { labels: ['Q1'], series: [] }), 0)).toBeNull();
  });
});

describe('the quip states the finding, not the shape of the card', () => {
  it('a clearance grid names the row that came out clean', () => {
    const block = {
      type: 'clearancematrix',
      id: 'cm',
      col: 12,
      num: '1',
      props: {
        title: 'Fiber vs. copper',
        rows: ['Fiber Optic', 'Copper Cable'],
        columns: ['Interference', 'Distance', 'Speed'],
        cells: [
          { row: 'Fiber Optic', col: 'Interference', level: 'safe' },
          { row: 'Fiber Optic', col: 'Distance', level: 'safe' },
          { row: 'Fiber Optic', col: 'Speed', level: 'safe' },
          { row: 'Copper Cable', col: 'Interference', level: 'avoid' },
          { row: 'Copper Cable', col: 'Distance', level: 'caution' },
          { row: 'Copper Cable', col: 'Speed', level: 'caution' },
        ],
      },
    } as unknown as Block;
    expect(penQuip(block, 0)).toBe('Fiber Optic: clear on all 3');
  });

  it('a comparison matrix adds up the wins the grid never totals', () => {
    const block = {
      type: 'comparematrix',
      id: 'x',
      col: 12,
      num: '1',
      props: {
        title: 'Schools of ethics',
        cols: ['Deontology', 'Utilitarianism'],
        rows: [
          { label: 'Predictability', cells: [{}, {}], best: 0 },
          { label: 'Flexibility', cells: [{}, {}], best: 1 },
          { label: 'Simplicity', cells: [{}, {}], best: 0 },
        ],
      },
    } as unknown as Block;
    expect(penQuip(block, 0)).toBe('Deontology: 2/3 rows');
  });

  it('a timeline says where it lands, not how many boxes it drew', () => {
    const block = {
      type: 'timeline',
      id: 't',
      col: 12,
      num: '1',
      props: {
        events: [{ title: 'Draft' }, { title: 'Review' }, { title: 'Ship it' }],
      },
    } as unknown as Block;
    expect(penQuip(block, 0)).toBe('3 steps → Ship it');
  });
});

describe('the note voices read the slide, not a template', () => {
  const chart = {
    type: 'chart',
    id: 'c',
    col: 12,
    num: '1',
    props: {
      title: 'ARR trajectory',
      labels: ['Q1', 'Q2', 'Q3'],
      series: [{ name: 'ARR', data: [12, 13, 15] }],
    },
  } as unknown as Block;
  const split = {
    type: 'breakdown',
    id: 'b',
    col: 12,
    num: '2',
    props: {
      title: 'Burn',
      rows: [
        { name: 'Payroll', pct: 62 },
        { name: 'Infra', pct: 21 },
        { name: 'GTM', pct: 17 },
      ],
    },
  } as unknown as Block;
  const list = {
    type: 'list',
    id: 'l',
    col: 12,
    num: '3',
    props: { title: 'Moves', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
  } as unknown as Block;

  it('names what THIS object assumes, not what its kind assumes', () => {
    const a = assumptionIn(chart).text;
    const b = assumptionIn(split).text;
    const c = assumptionIn(list).text;
    expect(new Set([a, b, c]).size).toBe(3);
    // Each cites something the card actually renders.
    expect(a).toContain('ARR');
    expect(a).toContain('Q3');
    expect(b).toContain('Payroll');
    expect(c).toContain('3');
  });

  it('asks a pressure-test about the thing on the card', () => {
    const a = studyPromptIn(chart).text;
    const b = studyPromptIn(split).text;
    const c = studyPromptIn(list).text;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toContain('ARR');
    expect(b).toContain('Payroll');
    expect(c).toContain('3');
  });

  it('never repeats one sentence across the objects of an answer', () => {
    const answer = [chart, split, list];
    const lines = answer.flatMap((b, i) => [
      assumptionIn(b).text,
      studyPromptIn(b).text,
      penQuip(b, i) ?? '',
    ]);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('the notes speak at the reader’s level', () => {
  const inferred = {
    type: 'insight',
    id: 'i',
    col: 12,
    num: '1',
    props: {
      title: 'ARR',
      stat: '$15.1M',
      delta: '+21.8%',
      summary: 'from $12.4M',
      conf: 'inferred',
    },
  } as unknown as Block;

  it('says the same FACT three ways, never a different fact', () => {
    const simple = assumptionIn(inferred, 'simple').text;
    const standard = assumptionIn(inferred, 'standard').text;
    const deep = assumptionIn(inferred, 'deep').text;
    expect(new Set([simple, standard, deep]).size).toBe(3);
    // The claim under discussion is the same in all three; only the explaining changes.
    for (const line of [simple, standard, deep]) expect(line).toContain('$15.1M');
    expect(simple.length).toBeLessThan(deep.length);
  });

  it('defaults to standard when no level is given', () => {
    expect(assumptionIn(inferred)).toEqual(assumptionIn(inferred, 'standard'));
  });
});
