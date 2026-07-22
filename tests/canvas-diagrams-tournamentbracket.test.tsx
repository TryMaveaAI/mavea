import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TournamentBracket } from '../src/canvas/blocks/diagrams/TournamentBracket';
import type { TournamentMatchup } from '../src/canvas/blocks/diagrams/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

/** The outer positioning <g transform="translate(x y)"> for every rendered matchup box, in the
 *  same order `layoutBracket` builds them (round ascending, then slot ascending within a round —
 *  i.e. the same order the matchups below are authored in), so index N reads back matchup N. */
function boxTranslates(container: HTMLElement): { x: number; y: number }[] {
  return Array.from(container.querySelectorAll('g.dg-tb-box')).map((box) => {
    const [x, y] = box
      .parentElement! // the positioning <g>; box itself only carries the CSS entrance transform
      .getAttribute('transform')!
      .replace('translate(', '')
      .replace(')', '')
      .split(' ')
      .map(Number);
    return { x, y };
  });
}

describe('TournamentBracket', () => {
  it('renders an empty state for 0 matchups instead of a broken layout', () => {
    const { container } = render(<TournamentBracket title="Empty" rounds={[]} matchups={[]} />);
    expect(container.querySelector('.dg-tb-empty')).toBeTruthy();
    expect(container.querySelector('svg.dg-tb-svg')).toBeNull();
  });

  it('renders a single decided matchup with the winner bold/tinted and the loser muted', () => {
    const { container } = render(
      <TournamentBracket
        title="Final"
        rounds={['Final']}
        matchups={[{ id: 'm1', round: 0, slot: 0, a: 'Ada', b: 'Grace', winner: 'a' }]}
      />,
    );
    const names = Array.from(container.querySelectorAll('.dg-tb-name'));
    expect(names.map((n) => visibleText(n))).toEqual(['Ada', 'Grace']);
    expect(names[0].classList.contains('dg-tb-name-winner')).toBe(true);
    expect(names[1].classList.contains('dg-tb-name-loser')).toBe(true);
  });

  it('shows TBD for an undecided empty slot and BYE for an auto-advanced one', () => {
    const { container } = render(
      <TournamentBracket
        title="Bracket"
        rounds={['Wild Card', 'Final']}
        matchups={[
          { id: 'bye', round: 0, slot: 0, a: 'Ada', winner: 'a' }, // no b: a walkover
          { id: 'pending', round: 0, slot: 1, a: 'Grace' }, // b not yet known, no winner
          { id: 'final', round: 1, slot: 0 }, // neither side known yet
        ]}
      />,
    );
    const names = Array.from(container.querySelectorAll('.dg-tb-name')).map((n) => visibleText(n));
    expect(names).toContain('BYE');
    expect(names).toContain('TBD');
    expect(names).toContain('Ada');
    expect(names).toContain('Grace');
  });

  it('truncates a competitor name too long for the box, preserving the full name in a tooltip', () => {
    const longName = 'Association for Computing Machinery All-Stars';
    const { container } = render(
      <TournamentBracket
        title="Final"
        rounds={['Final']}
        matchups={[{ id: 'm1', round: 0, slot: 0, a: longName, b: 'Bytes United' }]}
      />,
    );
    const label = Array.from(container.querySelectorAll('.dg-tb-name')).find((n) =>
      visibleText(n).startsWith('Association'),
    )!;
    expect(visibleText(label).length).toBeLessThan(longName.length);
    expect(visibleText(label).endsWith('…')).toBe(true);
    expect(label.querySelector('title')?.textContent).toBe(longName);
  });

  it('renders extreme score values (zero and six digits) verbatim', () => {
    const { container } = render(
      <TournamentBracket
        title="Final"
        rounds={['Final']}
        matchups={[
          { id: 'm1', round: 0, slot: 0, a: 'A', b: 'B', scoreA: 0, scoreB: 999999, winner: 'b' },
        ]}
      />,
    );
    const scores = Array.from(container.querySelectorAll('.dg-tb-score')).map((n) =>
      visibleText(n),
    );
    expect(scores).toEqual(['0', '999999']);
  });

  it("centres a later round's match on the midpoint of the two matches that feed it", () => {
    // Matchups are authored round-ascending then slot-ascending, matching layoutBracket's own
    // build order, so boxTranslates()[i] reads back matchups[i] — no name-based lookup needed.
    const matchups: TournamentMatchup[] = [
      { id: 'qf-0', round: 0, slot: 0, a: 'Ada', b: 'Grace', winner: 'a' },
      { id: 'qf-1', round: 0, slot: 1, a: 'Alan', b: 'Edsger', winner: 'b' },
      { id: 'sf-0', round: 1, slot: 0, a: 'Ada' }, // fed by qf-0 (slot 0) and qf-1 (slot 1)
    ];
    const { container } = render(
      <TournamentBracket title="Bracket" rounds={['Semifinal', 'Final']} matchups={matchups} />,
    );
    const [qf0, qf1, sf0] = boxTranslates(container);
    expect(sf0.y).toBeCloseTo((qf0.y + qf1.y) / 2, 5);
    // The feeding column sits strictly to the left of the column it feeds.
    expect(sf0.x).toBeGreaterThan(qf0.x);
    expect(qf0.x).toBe(qf1.x);
  });

  it('lays out a large 16-team bracket (5 rounds, 15 matchups) with every box inside the viewBox', () => {
    const rounds = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final', 'Champion'];
    const matchups: TournamentMatchup[] = [];
    for (let s = 0; s < 8; s++) {
      matchups.push({
        id: `r0-${s}`,
        round: 0,
        slot: s,
        a: `Team ${s * 2}`,
        b: `Team ${s * 2 + 1}`,
      });
    }
    for (let r = 1; r < 4; r++) {
      const n = 8 >> r;
      for (let s = 0; s < n; s++) matchups.push({ id: `r${r}-${s}`, round: r, slot: s });
    }
    const { container } = render(
      <TournamentBracket title="Big bracket" rounds={rounds} matchups={matchups} />,
    );
    expect(container.querySelectorAll('.dg-tb-box-bg')).toHaveLength(matchups.length);

    const svg = container.querySelector('svg.dg-tb-svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const positioned = Array.from(container.querySelectorAll('g.dg-tb-box')).map(
      (b) => b.parentElement!,
    );
    for (const g of positioned) {
      const [tx, ty] = g
        .getAttribute('transform')!
        .replace('translate(', '')
        .replace(')', '')
        .split(' ')
        .map(Number);
      expect(tx).toBeGreaterThanOrEqual(0);
      expect(tx).toBeLessThanOrEqual(vbW);
      expect(ty).toBeGreaterThanOrEqual(0);
      expect(ty).toBeLessThanOrEqual(vbH);
    }
  });

  it('does not drop a matchup whose round index runs past the declared rounds list', () => {
    // Defensive widening: rounds only names 1 round, but a matchup claims round 2.
    const { container } = render(
      <TournamentBracket
        title="Odd data"
        rounds={['Final']}
        matchups={[{ id: 'm1', round: 2, slot: 0, a: 'A', b: 'B' }]}
      />,
    );
    expect(container.querySelectorAll('.dg-tb-box-bg')).toHaveLength(1);
  });

  it('labels the view when double is set, without rendering a losers bracket', () => {
    const { container, rerender } = render(
      <TournamentBracket
        title="Bracket"
        rounds={['Final']}
        matchups={[{ id: 'm1', round: 0, slot: 0, a: 'A', b: 'B' }]}
      />,
    );
    expect(container.querySelector('.dg-tb-note')).toBeNull();

    rerender(
      <TournamentBracket
        title="Bracket"
        rounds={['Final']}
        matchups={[{ id: 'm1', round: 0, slot: 0, a: 'A', b: 'B' }]}
        double
      />,
    );
    expect(container.querySelector('.dg-tb-note')).toBeTruthy();
    // Still exactly one column's worth of boxes — `double` doesn't add a losers-bracket column.
    expect(container.querySelectorAll('.dg-tb-box-bg')).toHaveLength(1);
  });
});
