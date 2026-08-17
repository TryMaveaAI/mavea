// live-evidence-figures.test.tsx — "no orphan pixels" reaching an ORDINARY answer.
//
// The living world has always refused to print a number with nothing behind it. Every other answer
// printed its numbers straight out of block props, so the rule held on exactly one surface. The
// evidence drawer is where that asymmetry is answered: the figures are read out of the blocks
// (content/fromAnswer) and grounded against the sentences the answer's OWN sources contain, by the
// same two gates a world's node value passes — the sentence must be in the corpus AND must state the
// number.
//
// The distinction the panel exists to draw is GROUNDED vs the model's own, so both are pinned here,
// including the wording: a quotation is shown in quotation marks and a caveat never is.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Block, WebSource } from '../src/data/conversation';
import { LiveEvidence } from '../src/live/LiveEvidence';

afterEach(cleanup);

const chart = (data: number[]): Block =>
  ({
    id: 'b0',
    type: 'chart',
    props: {
      title: 'Revenue',
      unit: '$bn',
      labels: ['2023', '2024'],
      series: [{ name: 'Revenue', color: 'var(--insight)', data }],
    },
  }) as unknown as Block;

const drawer = (blocks: Block[], sources: WebSource[] = []) =>
  render(
    <LiveEvidence
      open
      onClose={() => {}}
      claim="How did the quarter go?"
      sources={sources}
      blocks={blocks}
    />,
  );

describe('the figures in an answer', () => {
  it('lists every figure the blocks print, with what backs it', () => {
    const { container } = drawer([chart([12, 30])]);
    expect(screen.getByText('The figures in this answer')).toBeTruthy();
    const rows = container.querySelectorAll('.evidence-figure');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Revenue · 2023');
  });

  it('says GROUNDED and shows the sentence, when a source states the number', () => {
    const snippet = 'Revenue was $30.0 billion in the quarter, up 122% on the year.';
    const { container } = drawer(
      [chart([12, 30])],
      [{ title: 'Results', url: 'https://example.test/q2', snippet }],
    );
    const quoted = [...container.querySelectorAll('.evidence-figure')].find((r) =>
      r.textContent?.includes('GROUNDED'),
    );
    expect(quoted, 'no figure resolved as grounded').toBeTruthy();
    // In quotation marks, because it IS a quote — the class supplies them.
    expect(quoted!.querySelector('.evidence-quote')?.textContent).toContain('$30.0 billion');
    expect(container.querySelector('.evidence-note')?.textContent).toContain('stated by a source');
  });

  it('says so plainly when nothing is sourced, rather than dressing it up', () => {
    const { container } = drawer([chart([12, 30])]);
    expect(container.querySelector('.evidence-note')?.textContent).toBe(
      "None of these is stated by a source — they are the model's own.",
    );
    for (const row of container.querySelectorAll('.evidence-figure')) {
      expect(row.textContent).toContain('ILLUSTRATIVE');
      // A model's own caveat is NOT a quotation, and must never be shown in quotation marks.
      expect(row.querySelector('.evidence-quote')).toBeNull();
      // Nor is the GENERIC caveat repeated per row: the summary line above has already said it, and
      // four copies of one sentence add nothing after the first.
      expect(row.querySelector('.evidence-caveat')).toBeNull();
    }
  });

  it('will not ground a number the cited sentence does not contain', () => {
    // The sentence is real and in the corpus; it says nothing about 30. Verbatim alone is not enough.
    const { container } = drawer(
      [chart([12, 30])],
      [{ title: 'Results', url: 'https://example.test/q2', snippet: 'The quarter closed ahead.' }],
    );
    expect(container.textContent).not.toContain('GROUNDED');
  });

  it('shows no section at all for an answer whose shapes carry no figures', () => {
    const prose = {
      id: 'b1',
      type: 'insight',
      props: { title: 'What happened', summary: 'A lot.' },
    } as unknown as Block;
    const { container } = drawer([prose]);
    expect(screen.queryByText('The figures in this answer')).toBeNull();
    expect(container.querySelectorAll('.evidence-figure')).toHaveLength(0);
  });

  it('is absent, not empty, when the host passes no blocks', () => {
    render(<LiveEvidence open onClose={() => {}} claim="Anything" sources={[]} />);
    expect(screen.queryByText('The figures in this answer')).toBeNull();
  });
});
