import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Pedigree } from '../src/canvas/blocks/learn/Pedigree';
import {
  GENO_DY,
  NAME_DY,
  ROW_GAP,
  SYM,
  probandArrow,
  sibshipBarY,
} from '../src/canvas/blocks/learn/pedigreeLayout';
import { assignCladeColumns } from '../src/canvas/blocks/learn/phyloLayout';
import { PhyloTree } from '../src/canvas/blocks/learn/PhyloTree';
import { GeometryCanvas } from '../src/canvas/blocks/learn/GeometryCanvas';

const lines = (c: HTMLElement) =>
  [...c.querySelectorAll('line')].map((l) => ({
    x1: Number(l.getAttribute('x1')),
    y1: Number(l.getAttribute('y1')),
    x2: Number(l.getAttribute('x2')),
    y2: Number(l.getAttribute('y2')),
  }));

describe('pedigree geometry', () => {
  it('hangs the sibship bar below the parent row genotype line', () => {
    const childY = 200;
    const parentGenotypeBaseline = childY - ROW_GAP + SYM + GENO_DY;
    // Italic descenders reach ~3 units below the baseline; the bar must clear them.
    expect(sibshipBarY(childY) - parentGenotypeBaseline).toBeGreaterThanOrEqual(6);
    expect(sibshipBarY(childY)).toBeLessThan(childY - SYM);
  });

  it('keeps the proband arrow above a wide name', () => {
    const cy = 100;
    const nameCapTop = cy + SYM + NAME_DY - 7;
    for (const label of ['II-2', 'Proband (Maria)', 'III-12']) {
      const a = probandArrow(0, cy, label);
      const ys = [a.y1, a.y2, ...a.head.split(' ').map((p) => Number(p.split(',')[1]))];
      expect(Math.max(...ys)).toBeLessThan(nameCapTop);
    }
  });

  it('extends the sibship bar to a drop that lands outside the children', () => {
    // II-3 × II-4 get pushed right by the de-overlap pass, so their midpoint sits past both
    // of their children; the bar has to reach it or the drop leads nowhere.
    const { container } = render(
      <Pedigree
        title="t"
        people={[
          { id: 'g1', sex: 'male', label: 'I-1' },
          { id: 'g2', sex: 'female', label: 'I-2', partner: 'g1' },
          { id: 'c1', sex: 'female', label: 'II-1', parents: ['g2', 'g1'] },
          { id: 'c2', sex: 'male', label: 'II-2', parents: ['g2', 'g1'] },
          { id: 'c3', sex: 'female', label: 'II-3', parents: ['g2', 'g1'], partner: 'm1' },
          { id: 'm1', sex: 'male', label: 'II-4' },
          { id: 'd1', sex: 'unknown', label: 'III-1', parents: ['c3', 'm1'] },
          { id: 'd2', sex: 'female', label: 'III-2', parents: ['c3', 'm1'] },
        ]}
      />,
    );
    const groups = [...container.querySelectorAll<HTMLElement>('.ped-links')];
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      const [, drop, bar] = lines(g);
      expect(bar.y1).toBe(bar.y2);
      expect(drop.y2).toBe(bar.y1);
      expect(drop.x1).toBeGreaterThanOrEqual(Math.min(bar.x1, bar.x2) - 0.01);
      expect(drop.x1).toBeLessThanOrEqual(Math.max(bar.x1, bar.x2) + 0.01);
    }
  });
});

describe('phylotree clade columns', () => {
  it('puts a nested clade inside the one that encloses it', () => {
    const { column, offsets, total } = assignCladeColumns([
      { y1: 50, y2: 120, labelPx: 50 }, // Hominini: Human..Bonobo
      { y1: 80, y2: 120, labelPx: 20 }, // Pan: Chimpanzee, Bonobo
    ]);
    expect(column).toEqual([1, 0]);
    // The outer bracket starts past the inner bracket AND the inner one's name.
    expect(offsets[1]).toBeGreaterThanOrEqual(20);
    expect(total).toBeGreaterThan(offsets[1] + 50);
  });

  it('lets disjoint clades share a column', () => {
    const { column, offsets } = assignCladeColumns([
      { y1: 0, y2: 30, labelPx: 40 },
      { y1: 40, y2: 90, labelPx: 40 },
    ]);
    expect(column).toEqual([0, 0]);
    expect(offsets).toEqual([0]);
  });

  it('draws nested clade brackets at different x', () => {
    const { container } = render(
      <PhyloTree
        title="t"
        root={{
          children: [
            { name: 'Orangutan' },
            {
              children: [
                { name: 'Gorilla' },
                {
                  children: [
                    { name: 'Human' },
                    { children: [{ name: 'Chimpanzee' }, { name: 'Bonobo' }] },
                  ],
                },
              ],
            },
          ],
        }}
        clades={[
          { label: 'Hominini', tips: ['Human', 'Chimpanzee', 'Bonobo'] },
          { label: 'Pan', tips: ['Chimpanzee', 'Bonobo'] },
        ]}
      />,
    );
    const xs = [...container.querySelectorAll('.phy-clade-lbl')].map((t) =>
      Number(t.getAttribute('x')),
    );
    expect(xs).toHaveLength(2);
    expect(Math.abs(xs[0] - xs[1])).toBeGreaterThan(20);
  });
});

describe('geometry canvas text', () => {
  const triangle = {
    title: 't',
    xRange: [-0.5, 4.5] as [number, number],
    yRange: [-0.5, 3] as [number, number],
    points: [
      { x: 0, y: 0, label: 'A' },
      { x: 3.46, y: 0, label: 'B' },
      { x: 0, y: 2, label: 'C' },
    ],
    segments: [
      { x1: 0, y1: 0, x2: 0, y2: 2, label: '2' },
      { x1: 3.46, y1: 0, x2: 0, y2: 2, label: 'hyp = 4' },
    ],
    angles: [
      {
        vertex: { x: 0, y: 0 },
        from: { x: 3.46, y: 0 },
        to: { x: 0, y: 2 },
        rightAngle: true,
      },
    ],
  };

  it('sets a vertical side length beside the side, not across it', () => {
    const { container } = render(<GeometryCanvas {...triangle} />);
    const side = [...container.querySelectorAll('.lr-gc-ann')].find((t) => t.textContent === '2')!;
    const axisX = Number(container.querySelector('circle')!.getAttribute('cx'));
    // The side lies on the y-axis, so outside it is the tick column; the length goes inside.
    expect(Number(side.getAttribute('x'))).toBeGreaterThan(axisX + 4);
  });

  it('puts a slanted side length outside the figure', () => {
    const { container } = render(<GeometryCanvas {...triangle} />);
    const hyp = [...container.querySelectorAll('.lr-gc-ann')].find(
      (t) => t.textContent === 'hyp = 4',
    )!;
    const xs = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
    const ys = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cy')));
    // B is (xs[1], ys[1]), C is (xs[2], ys[2]); outside the hypotenuse is up and to the right.
    const cross =
      (xs[2] - xs[1]) * (Number(hyp.getAttribute('y')) - ys[1]) -
      (ys[2] - ys[1]) * (Number(hyp.getAttribute('x')) - xs[1]);
    const crossA = (xs[2] - xs[1]) * (ys[0] - ys[1]) - (ys[2] - ys[1]) * (xs[0] - xs[1]);
    expect(Math.sign(cross)).toBe(-Math.sign(crossA));
  });

  it('drops a tick number that an annotation lands on', () => {
    const { container } = render(
      <GeometryCanvas {...triangle} annotations={[{ x: 2, y: -0.3, text: 'base' }]} />,
    );
    // x-axis numbers are the middle-anchored ticks.
    const ticks = [...container.querySelectorAll('.lr-gc-tick[text-anchor="middle"]')].map(
      (t) => t.textContent,
    );
    expect(ticks).not.toContain('2');
    expect(ticks).toContain('1');
  });

  it('keeps a vertex label out of its own right-angle mark', () => {
    const { container } = render(<GeometryCanvas {...triangle} />);
    const a = [...container.querySelectorAll('.lr-gc-pt-lbl')].find((t) => t.textContent === 'A')!;
    const dot = container.querySelector('circle')!;
    const vx = Number(dot.getAttribute('cx'));
    const vy = Number(dot.getAttribute('cy'));
    const ax = Number(a.getAttribute('x'));
    const ay = Number(a.getAttribute('y'));
    // The mark is a square of side 13 * 0.72 up and to the right of A (y-down screen coords).
    const inMark = ax >= vx && ax <= vx + 9.4 && ay <= vy && ay >= vy - 9.4;
    expect(inMark).toBe(false);
  });
});
