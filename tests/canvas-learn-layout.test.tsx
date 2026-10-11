import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { layoutCellLabels } from '../src/canvas/blocks/learn/cellLabels';
import { HELIX_W, helixGeometry } from '../src/canvas/blocks/learn/dnaHelixLayout';
import { segmentHitsBox } from '../src/canvas/blocks/learn/labelPlace';
import { placeVectorLabels } from '../src/canvas/blocks/learn/vectorLabels';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import { MathML } from '../src/canvas/blocks/learn/mathml';
import { ParticleModel } from '../src/canvas/blocks/learn/ParticleModel';
import { CrossSection } from '../src/canvas/blocks/learn/CrossSection';
import { BodyMap } from '../src/canvas/blocks/learn/BodyMap';
import { NumberBond } from '../src/canvas/blocks/learn/NumberBond';
import { ClockFace } from '../src/canvas/blocks/learn/ClockFace';
import { VseprMolecule } from '../src/canvas/blocks/learn/VseprMolecule';
import { NumberLine } from '../src/canvas/blocks/learn/NumberLine';
import { PolarPlot } from '../src/canvas/blocks/learn/PolarPlot';
import { TaylorSeries } from '../src/canvas/blocks/learn/TaylorSeries';
import { YieldCalc } from '../src/canvas/blocks/learn/YieldCalc';
import { Odontogram } from '../src/canvas/blocks/learn/Odontogram';
import { GridTransform } from '../src/canvas/blocks/learn/GridTransform';
import { TitrationCurve } from '../src/canvas/blocks/learn/TitrationCurve';
import { monotonePath } from '../src/canvas/blocks/learn/smoothPath';
import { profileHitsBox, profileYAt } from '../src/canvas/blocks/learn/energyLayout';
import { supersessions } from '../src/canvas/blocks/learn/teachDiagramLayout';

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe('cell diagram label columns', () => {
  const opts = { shellLeft: 40, shellRight: 252, top: 10, bottom: 230, gap: 12 };

  it('puts labels outside the cell, balanced, and never stacked on one another', () => {
    // Seven organelles all on the left half: the column would otherwise hold every one of them.
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `o${i}`,
      gx: 60 + i * 8,
      gy: 100 + i * 2,
    }));
    const labels = layoutCellLabels(items, opts);
    const left = labels.filter((l) => l.side === 'left');
    const right = labels.filter((l) => l.side === 'right');
    expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
    for (const l of left) expect(l.x).toBeLessThan(opts.shellLeft);
    for (const l of right) expect(l.x).toBeGreaterThan(opts.shellRight);
    for (const column of [left, right]) {
      const ys = column.map((l) => l.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(11.9);
    }
  });
});

describe('DNA helix geometry', () => {
  it('ends every rung on its two strands and keeps the letters off the strands', () => {
    const { rungs } = helixGeometry(14);
    for (const r of rungs) {
      // The strands are mirror images about the centre line.
      expect(r.x1 + r.x2).toBeCloseTo(HELIX_W, 6);
      for (const [base, end] of [
        [r.base1, r.x1],
        [r.base2, r.x2],
      ] as const) {
        expect(Math.abs(base.x - end)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('moves the letters outside a pair seen edge-on at a crossover', () => {
    const { rungs } = helixGeometry(21);
    const narrow = rungs.filter((r) => Math.abs(r.x1 - r.x2) < 20);
    expect(narrow.length).toBeGreaterThan(0);
    for (const r of narrow) {
      const lo = Math.min(r.x1, r.x2);
      const hi = Math.max(r.x1, r.x2);
      for (const base of [r.base1, r.base2]) expect(base.x < lo || base.x > hi).toBe(true);
    }
  });
});

describe('segmentHitsBox', () => {
  const box = { x1: 10, y1: 10, x2: 20, y2: 20 };
  it('finds a segment passing through, and one that ends inside', () => {
    expect(segmentHitsBox(0, 15, 30, 15, box, 0)).toBe(true);
    expect(segmentHitsBox(0, 0, 15, 15, box, 0)).toBe(true);
  });
  it('misses a segment that stops short or passes beside', () => {
    expect(segmentHitsBox(0, 15, 8, 15, box, 0)).toBe(false);
    expect(segmentHitsBox(0, 25, 30, 25, box, 0)).toBe(false);
    expect(segmentHitsBox(0, 0, 30, 5, box, 0)).toBe(false);
  });
});

describe('vector labels', () => {
  it('keeps the names of two arrows along the same line apart', () => {
    // v₂ and Av₂ coincide when λ = 1: a fixed offset stacks the two names.
    const arrows = [
      { x0: 150, y0: 120, x1: 130, y1: 95, label: 'v₂' },
      { x0: 150, y0: 120, x1: 130, y1: 95, label: 'Av₂' },
    ];
    const [a, b] = placeVectorLabels(arrows, { width: 300, height: 248, fontSize: 11 });
    const wa = estimateTextWidth('v₂', 11, true);
    const wb = estimateTextWidth('Av₂', 11, true);
    const apartX = Math.abs(a!.x - b!.x) >= (wa + wb) / 2;
    const apartY = Math.abs(a!.y - b!.y) >= 13;
    expect(apartX || apartY).toBe(true);
  });
});

describe('MathML scripted identifiers', () => {
  it('sets a Unicode subscript as a real msub so it sizes as a script', () => {
    const { container } = render(<MathML node={{ t: 'ident', v: 'Eₐ' }} />);
    const sub = container.querySelector('msub');
    expect(sub).not.toBeNull();
    expect(sub!.children[0]!.textContent).toBe('E');
    expect(sub!.children[1]!.textContent).toBe('a');
  });
});

describe('ParticleModel spread', () => {
  it('never lets two liquid or gas particles overlap', () => {
    const { container } = render(
      <ParticleModel
        title="Phases"
        panels={[
          { phase: 'liquid', particleCount: 18 },
          { phase: 'gas', particleCount: 18 },
        ]}
      />,
    );
    for (const panel of container.querySelectorAll('.lr-pm-panel')) {
      const dots = [...panel.querySelectorAll('.lr-pm-dot')].map((c) => [
        num(c, 'cx'),
        num(c, 'cy'),
        num(c, 'r'),
      ]);
      expect(dots.length).toBe(18);
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const d = Math.hypot(dots[i]![0]! - dots[j]![0]!, dots[i]![1]! - dots[j]![1]!);
          expect(d).toBeGreaterThan(dots[i]![2]! + dots[j]![2]!);
        }
      }
    }
  });
});

describe('CrossSection concentric rings', () => {
  it('draws a layer too thin to see at true scale as a visible ring', () => {
    const { container } = render(
      <CrossSection
        title="Earth"
        orientation="concentric"
        layers={[
          { name: 'Crust', thickness: 35 },
          { name: 'Mantle', thickness: 2865 },
          { name: 'Outer core', thickness: 2255 },
          { name: 'Inner core', thickness: 1216 },
        ]}
      />,
    );
    const radii = [...container.querySelectorAll('circle.lr-xs-ring')].map((c) => num(c, 'r'));
    expect(radii).toHaveLength(4);
    expect(radii[0]! - radii[1]!).toBeGreaterThanOrEqual(4.99);
    // The rest still share the radius in proportion: the mantle outweighs the outer core.
    expect(radii[1]! - radii[2]!).toBeGreaterThan(radii[2]! - radii[3]!);
  });
});

describe('BodyMap legend', () => {
  it('names a muscle lit on both sides once', () => {
    const { container } = render(
      <BodyMap
        title="Run"
        regions={[
          { id: 'leftThigh', label: 'Quads', note: 'drive' },
          { id: 'rightThigh', label: 'Quads', note: 'drive' },
          { id: 'core', label: 'Core' },
        ]}
      />,
    );
    const names = [...container.querySelectorAll('.bm-legend-name')].map((n) => n.textContent);
    expect(names).toEqual(['Quads', 'Core']);
  });
});

describe('NumberBond connectors', () => {
  it('starts and ends each connector on the circles, not inside them', () => {
    const { container } = render(<NumberBond whole={10} parts={[6, 4]} />);
    const circles = [...container.querySelectorAll('circle')].map((c) => ({
      cx: num(c, 'cx'),
      cy: num(c, 'cy'),
      r: num(c, 'r'),
    }));
    const links = [...container.querySelectorAll('line.nb-link')];
    expect(links).toHaveLength(2);
    for (const l of links) {
      for (const [x, y] of [
        [num(l, 'x1'), num(l, 'y1')],
        [num(l, 'x2'), num(l, 'y2')],
      ] as const) {
        for (const c of circles) expect(Math.hypot(x - c.cx, y - c.cy)).toBeGreaterThan(c.r);
      }
    }
  });
});

describe('ClockFace hands', () => {
  it('stops the minute hand short of the numeral it points at', () => {
    const { container } = render(<ClockFace time="3:40" />);
    const minute = container.querySelector('line.lr-cf-hand--minute')!;
    const numeral = [...container.querySelectorAll('text.lr-cf-numeral')].find(
      (t) => t.textContent === '8',
    )!;
    const cx = num(minute, 'x1');
    const cy = num(minute, 'y1');
    const handLen = Math.hypot(num(minute, 'x2') - cx, num(minute, 'y2') - cy);
    const numeralR = Math.hypot(num(numeral, 'x') - cx, num(numeral, 'y') - cy);
    // A numeral reaches about half an em towards the centre; the hand ends before that.
    expect(handLen).toBeLessThan(numeralR - 15 * 0.5);
  });
});

describe('VseprMolecule lone pairs', () => {
  it('keeps two lone pairs readable as two pairs, close to the central atom', () => {
    const { container } = render(
      <VseprMolecule
        title="Water"
        central="O"
        bonds={[{ atom: 'H' }, { atom: 'H' }]}
        lonePairs={2}
        shape="bent"
      />,
    );
    const pairs = [...container.querySelectorAll('.lr-vse-lone')].map((g) =>
      [...g.querySelectorAll('circle')].map((c) => [num(c, 'cx'), num(c, 'cy')] as const),
    );
    expect(pairs).toHaveLength(2);
    const within = Math.hypot(
      pairs[0]![0]![0] - pairs[0]![1]![0],
      pairs[0]![0]![1] - pairs[0]![1]![1],
    );
    let between = Infinity;
    for (const a of pairs[0]!) {
      for (const b of pairs[1]!) between = Math.min(between, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    expect(between).toBeGreaterThan(within * 1.8);
    const central = container.querySelector('circle.lr-vse-central-bg')!;
    const [px, py] = pairs[0]![0]!;
    const fromCentre = Math.hypot(px - num(central, 'cx'), py - num(central, 'cy'));
    expect(fromCentre - num(central, 'r')).toBeLessThan(20);
  });
});

describe('NumberLine axis ends', () => {
  it('runs the arrowhead past an interval that ends at the maximum', () => {
    const { container } = render(
      <NumberLine title="Where" min={0} max={100} intervals={[{ from: 70, to: 100 }]} />,
    );
    const arrows = [...container.querySelectorAll('polyline.lr-nl-arrow')].map((p) =>
      p
        .getAttribute('points')!
        .split(' ')
        .map((pt) => Number(pt.split(',')[0])),
    );
    const rightTip = Math.max(...arrows.flat());
    const endDots = [...container.querySelectorAll('circle')].map(
      (c) => num(c, 'cx') + num(c, 'r'),
    );
    expect(rightTip).toBeGreaterThan(Math.max(...endDots) + 4);
  });
});

describe('PolarPlot ring value', () => {
  it('labels the outer ring with the curves’ own reach, not a fixed 1', () => {
    const { container } = render(<PolarPlot fn="2 + cos(t)" />);
    expect(container.querySelector('.pp-scale-lbl')!.textContent).toBe('3');
  });
});

describe('TaylorSeries key', () => {
  it('says which curve is which and keeps the dash for the exact function alone', () => {
    const { container } = render(<TaylorSeries title="sin x" fn="sin" showTerms={4} />);
    expect(container.querySelector('.lr-ts-legend')!.textContent).toContain('Exact function');
    const dashed = [...container.querySelectorAll('svg [stroke-dasharray]')];
    expect(dashed).toHaveLength(1);
    expect(dashed[0]!.tagName.toLowerCase()).toBe('path');
  });
});

describe('YieldCalc formulas', () => {
  it('subscripts atom counts but leaves coefficients full size', () => {
    const { container } = render(
      <YieldCalc
        title="Yield"
        reaction="N2 + 3 H2 -> 2 NH3"
        theoreticalYield={10}
        actualYield={8}
      />,
    );
    const reaction = container.querySelector('.lr-yc-reaction')!;
    expect([...reaction.querySelectorAll('sub')].map((s) => s.textContent)).toEqual([
      '2',
      '2',
      '3',
    ]);
    expect(reaction.textContent).toBe('N2 + 3 H2 → 2 NH3');
  });
});

describe('Odontogram arch letters', () => {
  it('sets U and L clear of the first tooth', () => {
    const { container } = render(<Odontogram teeth={[]} />);
    const firstTooth = Math.min(
      ...[...container.querySelectorAll('rect.odo-tooth')].map((r) => num(r, 'x')),
    );
    for (const t of container.querySelectorAll('text.odo-arch-lbl')) {
      const right = num(t, 'x') + estimateTextWidth(t.textContent ?? '', 9, true) / 2;
      expect(right).toBeLessThan(firstTooth);
    }
  });
});

describe('GridTransform readout', () => {
  it('gives the matrix, determinant and area their own row instead of the plot', () => {
    const { container } = render(
      <GridTransform
        matrix={[
          [2, 1],
          [1, 2],
        ]}
      />,
    );
    expect(container.querySelector('.gtf-readout .gtf-matrix')).not.toBeNull();
    const svgText = container.querySelector('svg')!.textContent ?? '';
    expect(svgText).not.toMatch(/det/i);
  });
});

describe('TitrationCurve axis title', () => {
  it('sets the volume title on its own row below the tick labels', () => {
    const { container } = render(
      <TitrationCurve
        title="Titration"
        points={[
          { volumeMl: 0, pH: 3 },
          { volumeMl: 25, pH: 8.7 },
          { volumeMl: 50, pH: 12 },
        ]}
      />,
    );
    const title = container.querySelector('text.lr-tc-axlbl')!;
    const xTicks = [...container.querySelectorAll('text.lr-tc-tick')].filter(
      (t) => t.getAttribute('text-anchor') === 'middle',
    );
    expect(xTicks.length).toBeGreaterThan(0);
    const lowestTick = Math.max(...xTicks.map((t) => num(t, 'y')));
    expect(num(title, 'y') - lowestTick).toBeGreaterThanOrEqual(10);
  });
});

describe('monotonePath', () => {
  it('passes through every sample and never overshoots a peak or dips under a zero floor', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 50 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ];
    const d = monotonePath(pts);
    for (const p of pts) expect(d).toContain(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    // Every control point's y stays inside the data's own range.
    const ys = [...d.matchAll(/-?\d+\.\d+,(-?\d+\.\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });
});

describe('energy profile sampling', () => {
  const pts = [
    { x: 0, y: 100 },
    { x: 50, y: 20 },
    { x: 100, y: 80 },
  ];
  it('reads the drawn profile at its control points and between them', () => {
    expect(profileYAt(pts, 0)).toBeCloseTo(100, 6);
    expect(profileYAt(pts, 50)).toBeCloseTo(20, 6);
    expect(profileYAt(pts, 25)).toBeCloseTo(60, 1);
    expect(profileYAt(pts, 101)).toBeNull();
  });
  it('knows when a label box sits on the curve', () => {
    expect(profileHitsBox(pts, { x1: 45, y1: 15, x2: 55, y2: 25 })).toBe(true);
    expect(profileHitsBox(pts, { x1: 45, y1: 60, x2: 55, y2: 70 })).toBe(false);
  });
});

describe('teach diagram label supersession', () => {
  it('retires a label when a later step writes to the same spot, and shares its legend slot', () => {
    const at = { x: 10, y: 10, side: 'right' as const };
    const elsewhere = { x: 40, y: 10, side: 'right' as const };
    const { until, finals, slot } = supersessions([0, 1, 1], [at, at, elsewhere]);
    expect(until[0]).toBe(1);
    expect(until[1]).toBe(Infinity);
    expect(finals).toEqual([1, 2]);
    expect(slot[0]).toBe(slot[1]);
  });
  it('keeps two callouts at one spot in the same step', () => {
    const at = { x: 10, y: 10 };
    const { until } = supersessions([0, 0], [at, at]);
    expect(until).toEqual([Infinity, Infinity]);
  });
});
