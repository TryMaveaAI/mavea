import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { asideFor } from '../src/live/content/asideFor';
import { notableIn, studyPromptIn } from '../src/live/content/notableIn';
import type { ContentGraph } from '../src/live/content/types';

/** A registry holding just what asideFor reads: ids that encode a block index, and a status. */
function graph(
  values: { id: string; raw: string; grounded: boolean }[],
  illustrative = false,
): ContentGraph {
  const map = new Map(
    values.map((v) => [
      v.id,
      v.grounded
        ? { kind: 'grounded', resolution: { value: 1, raw: v.raw }, receipts: [{ quote: 'q' }] }
        : { kind: 'illustrative', resolution: { value: 1, raw: v.raw }, receipts: [] },
    ]),
  );
  return {
    title: 't',
    entities: [],
    relations: [],
    facts: [],
    trust: { values: map, usedIn: [] },
    ...(illustrative ? { illustrative: true } : {}),
  } as unknown as ContentGraph;
}

describe('asideFor — Mavéa says what she can and cannot back', () => {
  it('says nothing when the block carries no readable figures', () => {
    expect(asideFor(graph([]), 0)).toBeNull();
    // A figure on a DIFFERENT block is not this block's business.
    expect(asideFor(graph([{ id: 'block:3:x', raw: '5', grounded: true }]), 0)).toBeNull();
  });

  it('names the figure it cannot back, and flags itself', () => {
    const a = asideFor(
      graph([
        { id: 'block:0:churn', raw: '2.8%', grounded: true },
        { id: 'block:0:ltv', raw: '3.8x', grounded: false },
      ]),
      0,
    );
    expect(a?.flagged).toBe(true);
    expect(a?.text).toContain('2.8%');
    expect(a?.text).toContain('3.8x');
    // The admission is the point — it must actually say it cannot stand behind the second one.
    expect(a?.text).toMatch(/can't|illustrative/i);
  });

  it('does not flag a block whose every figure is sourced', () => {
    const a = asideFor(
      graph([
        { id: 'block:1:arr', raw: '$15.1M', grounded: true },
        { id: 'block:1:prior', raw: '$12.4M', grounded: true },
      ]),
      1,
    );
    expect(a?.flagged).toBe(false);
    expect(a?.text).toMatch(/traces back/i);
  });

  it('reports a wholly illustrative graph as a genre, not as a defect per figure', () => {
    const a = asideFor(graph([{ id: 'block:0:g', raw: '9.8', grounded: false }], true), 0);
    expect(a?.flagged).toBe(true);
    expect(a?.text).toMatch(/illustrate the shape/i);
    // Naming a worked example's numbers as unbacked would read as a bug, not as honesty.
    expect(a?.text).not.toContain('9.8');
  });

  it('never prints a figure the registry did not resolve', () => {
    const a = asideFor(graph([{ id: 'block:0:only', raw: '42', grounded: false }]), 0);
    expect(a?.text).toContain('42');
    expect(a?.text).not.toMatch(/\b(?!42)\d+(\.\d+)?\b/);
  });
});

describe('Study observations — a different layer from the spoken tour', () => {
  it('turns an inferred headline into an assumption check instead of repeating its note', () => {
    const block = {
      type: 'insight',
      id: 'forecast',
      col: 4,
      props: {
        title: 'Next quarter ARR',
        stat: '$16.1M',
        delta: '+6.6%',
        summary: 'Assumes monthly churn rises to 3.5%.',
        conf: 'inferred',
      },
      note: 'The voice already explained this forecast.',
    } as Block;

    const observation = notableIn(block);
    expect(observation?.kind).toBe('caution');
    expect(observation?.text).toContain('scenario output');
    expect(observation?.text).toContain('3.5%');
    expect(observation?.text).not.toContain(block.note);
  });

  it('reads the gauge relationship rather than narrating its label', () => {
    const block = {
      type: 'gauge',
      id: 'churn',
      col: 6,
      props: { title: 'Projected churn', value: 3.5, max: 5, band: 'Warning' },
    } as Block;

    expect(notableIn(block)?.text).toMatch(/70%.*Warning/);
  });

  it('uses a Study interaction prompt when an object has no structural observation', () => {
    const block = {
      type: 'quotes',
      id: 'voice',
      col: 6,
      props: { quotes: [{ text: 'A claim', who: 'Source' }] },
      note: 'Do not recycle this sentence.',
    } as Block;

    const prompt = studyPromptIn(block);
    expect(prompt.kind).toBe('question');
    expect(prompt.text).toMatch(/nearby object/i);
    expect(prompt.text).not.toContain(block.note);
  });
});
