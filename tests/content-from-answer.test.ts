// content-from-answer.test.ts — an ORDINARY answer's numbers, put on the world's footing.
//
// The living world's rule is that a figure with nothing behind it does not render. Every other answer
// prints its numbers straight out of block props, so a chart's 140 and a KPI's "$1.2M" reach the
// screen on the model's word alone. This producer reads those shapes into facts with trust values,
// grounded against the turn's own sources by the same pair of gates a world's node value passes:
// the sentence must be verbatim in the corpus AND must contain the number.
//
// What it refuses matters as much as what it reads. A shape it cannot parse yields nothing — a figure
// asserted on a field nobody read is the orphan pixel this exists to prevent.
import { describe, expect, it } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { answerToContent } from '../src/live/content/fromAnswer';
import { numberOf } from '../src/live/trust';

const answer = (blocks: Block[], sources?: ConversationSpec['sources']) => ({
  title: 'How did the quarter go?',
  blocks,
  ...(sources ? { sources } : {}),
});

const chart = (): Block =>
  ({
    id: 'b0',
    type: 'chart',
    props: {
      title: 'Revenue',
      unit: '$bn',
      labels: ['2023', '2024'],
      series: [{ name: 'Revenue', color: 'var(--insight)', data: [12, 30] }],
    },
  }) as unknown as Block;

const kpi = (): Block =>
  ({
    id: 'b1',
    type: 'kpi',
    props: {
      title: 'The scale',
      kpis: [
        { val: '$30.0M', label: 'Revenue' },
        { val: 'up sharply', label: 'Direction' },
      ],
    },
  }) as unknown as Block;

describe('answerToContent', () => {
  it('turns a chart into one fact per point, each addressed by its own value id', () => {
    const graph = answerToContent(answer([chart()]));
    expect(graph.facts).toHaveLength(2);
    expect(graph.facts.map((f) => f.at)).toEqual(['2023', '2024']);
    // The fact holds no number: the registry is the only route a figure has to the screen.
    expect(Object.keys(graph.facts[0])).not.toContain('value');
    expect(graph.facts.every((f) => graph.trust.values.has(f.valueId))).toBe(true);
  });

  it('resolves a figure the turn SOURCED as grounded, with the sentence that states it', () => {
    const corpus = 'Revenue was $30.0 billion in the quarter, up 122% on the year.';
    const graph = answerToContent(
      answer([chart()], [{ title: 'Results', url: 'https://example.test/q2', snippet: corpus }]),
      corpus,
    );
    const backed = [...graph.trust.values.values()].find((v) => numberOf(v) === 30)!;
    expect(backed.kind).toBe('grounded');
    expect(backed.kind === 'grounded' && backed.resolution.receipt.quote).toContain(
      '$30.0 billion',
    );
    expect(backed.kind === 'grounded' && backed.resolution.receipt.host).toBe('example.test');
  });

  it('resolves a figure nothing sourced as ILLUSTRATIVE, never as measured', () => {
    // The honest reading of a model figure with no receipt. It still renders — it just cannot wear a
    // GROUNDED badge, which is the same call the world makes on an unsourced value.
    const graph = answerToContent(answer([chart()]));
    expect([...graph.trust.values.values()].every((v) => v.kind === 'illustrative')).toBe(true);
  });

  it('will not ground a number the cited sentence does not contain', () => {
    // The sentence is real and in the corpus; it says nothing about 30. Verbatim alone is not enough,
    // exactly as it is not enough for a world's node value.
    const corpus = 'The quarter closed ahead of guidance.';
    const graph = answerToContent(answer([chart()]), corpus);
    expect([...graph.trust.values.values()].every((v) => v.kind === 'illustrative')).toBe(true);
  });

  it('reads a KPI only where its value is a clean single token', () => {
    const graph = answerToContent(answer([kpi()]));
    // "up sharply" is not a figure to underwrite, and is not turned into one.
    expect(graph.facts).toHaveLength(1);
    const only = graph.trust.values.get(graph.facts[0].valueId)!;
    expect(only.label).toBe('Revenue');
    expect(numberOf(only)).toBe(30_000_000); // parseAmount reads k/M, and only a clean token
  });

  it('reads a breakdown row by the share the renderer actually draws', () => {
    const block = {
      id: 'b2',
      type: 'breakdown',
      props: {
        title: 'Where it went',
        rows: [
          { name: 'Rent', val: '$40k', pct: 40 },
          { name: 'Wages', val: '$60k', pct: 60 },
        ],
      },
    } as unknown as Block;
    const graph = answerToContent(answer([block]));
    expect(graph.facts).toHaveLength(2);
    expect([...graph.trust.values.values()].map((v) => numberOf(v))).toEqual([40, 60]);
  });

  it('yields nothing for a shape it cannot read, rather than guessing at one', () => {
    const prose = {
      id: 'b3',
      type: 'insight',
      props: { title: 'What happened', summary: 'A lot.' },
    };
    const graph = answerToContent(answer([prose as unknown as Block]));
    expect(graph.facts).toEqual([]);
    expect(graph.entities).toEqual([]);
    expect(graph.trust.values.size).toBe(0);
  });

  it('registers every figure against the block that prints it', () => {
    const graph = answerToContent(answer([chart()]));
    const usedIn = graph.trust.usedIn.get(graph.facts[0].valueId)!;
    expect(usedIn[0]).toMatchObject({ surface: 'block', label: 'Revenue' });
  });

  it('gives two blocks measuring the same thing distinct ids', () => {
    const graph = answerToContent(answer([chart(), chart()]));
    const ids = graph.facts.map((f) => f.valueId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('survives an answer with no blocks', () => {
    const graph = answerToContent(answer([]));
    expect(graph.facts).toEqual([]);
    expect(graph.title).toBe('How did the quarter go?');
  });
});
