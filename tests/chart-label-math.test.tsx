// Pure placement and arithmetic helpers behind the charts1/charts2/finance/stats blocks, plus the
// few render-level behaviours that came from the same layout fixes.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { signedUnit, waterfallLabel, radialLabel } from '../src/canvas/blocks/charts1/chartMath';
import {
  clearQuadrant,
  besideMarker,
  placeClear,
  splitTwo,
  labelStride,
  youdenIndex,
  evenTicks,
} from '../src/canvas/blocks/charts2/chartMath';
import { tickLabelSpot, amountLabelSide } from '../src/canvas/blocks/finance/cashflowLabels';
import { pctVested } from '../src/canvas/blocks/finance/vesting';
import { deltaMove } from '../src/canvas/blocks/stats/deltaMove';
import { Statpair } from '../src/canvas/blocks/stats/Statpair';
import { Sparkstat } from '../src/canvas/blocks/stats/Sparkstat';
import { RocCurve } from '../src/canvas/blocks/charts2/RocCurve';

describe('charts1 label math', () => {
  it('puts a real minus in front of the currency symbol', () => {
    expect(signedUnit(-148, '$k')).not.toContain('$-');
    expect(signedUnit(-148, '$k').startsWith('−')).toBe(true);
    expect(waterfallLabel(712, '$k').startsWith('+')).toBe(true);
    expect(waterfallLabel(5404, '$k', true).startsWith('+')).toBe(false);
  });

  it('hangs a ring label outward, anchored away from the ring', () => {
    const c = { x: 100, y: 100 };
    expect(radialLabel({ x: 150, y: 100 }, c, 6).anchor).toBe('start');
    expect(radialLabel({ x: 50, y: 100 }, c, 6).anchor).toBe('end');
    const top = radialLabel({ x: 100, y: 50 }, c, 6);
    expect(top.anchor).toBe('middle');
    expect(top.y).toBeLessThan(50);
  });
});

describe('charts2 label math', () => {
  it('picks the quadrant a line leaves empty', () => {
    // Rising line: above-left. Falling line flipped: below-left.
    expect(clearQuadrant(true)).toMatchObject({ anchor: 'end' });
    expect(clearQuadrant(true).dy).toBeLessThan(0);
    const falling = clearQuadrant(false, true);
    expect(falling.anchor).toBe('end');
    expect(falling.dy).toBeGreaterThan(0);
  });

  it('hangs a marker label right unless it would leave the plot', () => {
    expect(besideMarker(10, 30, 100).anchor).toBe('start');
    expect(besideMarker(90, 30, 100).anchor).toBe('end');
  });

  it('takes the first clear candidate and avoids boxes and lines', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 };
    const blocker = { x: 0, y: 0, w: 20, h: 20 };
    const a = { x: 5, y: 5, w: 10, h: 10 };
    const b = { x: 50, y: 50, w: 10, h: 10 };
    expect(placeClear([a, b], bounds, [], [blocker])).toBe(b);
    const line = [
      { x: 0, y: 55 },
      { x: 100, y: 55 },
    ];
    expect(placeClear([b, a], bounds, [line])).toBe(a);
  });

  it('splits a label at its most balanced space', () => {
    expect(splitTwo('Backyard subsoil')).toEqual(['Backyard', 'subsoil']);
    expect(splitTwo('Loam')).toBeNull();
  });

  it('thins labels only when they would collide', () => {
    expect(labelStride(['Jan', 'Feb', 'Mar'], 600, 9)).toBe(1);
    expect(labelStride(Array(24).fill('September'), 200, 9)).toBeGreaterThan(1);
  });

  it("defaults the ROC operating point to the best Youden's J", () => {
    const pts = [
      { fpr: 0, tpr: 0 },
      { fpr: 0.05, tpr: 0.8 },
      { fpr: 0.2, tpr: 0.9 },
      { fpr: 1, tpr: 1 },
    ];
    expect(youdenIndex(pts)).toBe(1);
    expect(youdenIndex([])).toBe(0);
  });

  it('labels a time axis on one whole-number stride', () => {
    const t = evenTicks(12, 6);
    expect(t).toEqual([0, 2, 4, 6, 8, 10]);
    const gaps = new Set(t.slice(1).map((v, i) => v - t[i]));
    expect(gaps.size).toBe(1);
    expect(evenTicks(5, 6)).toEqual([0, 1, 2, 3, 4]);
    expect(evenTicks(1, 6)).toEqual([0]);
    expect(evenTicks(0, 6)).toEqual([]);
    for (const n of [7, 13, 30, 61]) expect(evenTicks(n, 6).length).toBeLessThanOrEqual(6);
  });
});

describe('finance helpers', () => {
  it('moves a period number off an outflow shaft', () => {
    expect(tickLabelSpot(100, 10, [])).toEqual({ x: 100, anchor: 'middle' });
    const spot = tickLabelSpot(100, 10, [101]);
    expect(spot.anchor).toBe('end');
    expect(spot.x).toBeLessThan(101);
  });

  it('steps an amount label away from a longer neighbouring shaft', () => {
    const self = { x: 100, len: 20 };
    expect(amountLabelSide(self, 30, [])).toBe('centre');
    expect(amountLabelSide(self, 30, [{ x: 104, len: 40 }])).toBe('left');
    expect(amountLabelSide(self, 30, [{ x: 96, len: 40 }])).toBe('right');
    expect(
      amountLabelSide(self, 30, [
        { x: 96, len: 40 },
        { x: 104, len: 40 },
      ]),
    ).toBeNull();
  });

  it('vests nothing before the cliff, the cliff tranche at it, all at the end', () => {
    expect(pctVested(11, 12, 48)).toBe(0);
    expect(pctVested(12, 12, 48)).toBe(25);
    expect(pctVested(24, 12, 48)).toBe(50);
    expect(pctVested(48, 12, 48)).toBe(100);
    expect(pctVested(60, 12, 48)).toBe(100);
    expect(pctVested(-1, 12, 48)).toBe(0);
  });
});

describe('stats helpers and blocks', () => {
  it("reads a delta's direction off its own sign before the authored verdict", () => {
    expect(deltaMove('−0.6 pts', 'up')).toBe('down');
    expect(deltaMove('+4%', 'down')).toBe('up');
    expect(deltaMove('at this burn', 'down', [1, 3])).toBe('up');
    expect(deltaMove(undefined, 'down')).toBe('down');
  });

  it('names what the Statpair ratio divides', () => {
    const { container } = render(
      <Statpair
        title="Calories"
        left={{ value: '2,240', label: 'Intake', weight: 2240 }}
        right={{ value: '2,610', label: 'Burned', weight: 2610 }}
        ratioLabel="daily deficit"
      />,
    );
    const label = container.querySelector('.sp-ratio-l')?.textContent ?? '';
    expect(label).toContain('Intake / Burned');
    expect(label).toContain('daily deficit');
    expect(container.querySelector('.sp-ratio-v')?.textContent).toBe('0.86');
  });

  it('keeps the Sparkstat crosshair for the pointer and the marker round', () => {
    const { container } = render(
      <Sparkstat
        title="Resting HR"
        value="54 bpm"
        points={[
          { v: 58, label: 'then' },
          { v: 54, label: 'now' },
        ]}
      />,
    );
    // At rest: no crosshair line, and the marker is an HTML dot (a stretched SVG circle squashes).
    expect(container.querySelector('.ss-svg line')).toBeNull();
    expect(container.querySelector('.ss-svg circle')).toBeNull();
    expect(container.querySelector('.ss-dot')).not.toBeNull();
  });
});

describe('RocCurve', () => {
  it('opens on the best trade-off, not the (0, 0) corner', () => {
    const { container } = render(
      <RocCurve
        title="ROC"
        curves={[
          {
            name: 'Model',
            points: [
              { fpr: 0, tpr: 0 },
              { fpr: 0.08, tpr: 0.92 },
              { fpr: 0.3, tpr: 0.97 },
              { fpr: 1, tpr: 1 },
            ],
          },
        ]}
      />,
    );
    expect(container.textContent).toContain('0.920');
  });
});
