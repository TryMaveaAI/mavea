import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import { placeDimensions } from '../src/canvas/blocks/media/dimensionLayout';
import { arrowSegment } from '../src/canvas/blocks/media/boardArrow';
import { nameSpot, separateTokens } from '../src/canvas/blocks/media/pitchTokens';
import { SportsPitch } from '../src/canvas/blocks/media/SportsPitch';
import type { SportKind } from '../src/canvas/blocks/media/types';
import { labelStates, placeRingBadges } from '../src/canvas/blocks/media/sitePlanBadges';
import { fitItemLabel } from '../src/canvas/blocks/media/itemLabel';
import { wedgeLabel } from '../src/canvas/blocks/media/wheelGeometry';
import { grainSegments } from '../src/canvas/blocks/media/grainline';
import { placeAxisLabels } from '../src/canvas/blocks/layout/beatAxis';
import { specimenStack } from '../src/canvas/blocks/layout/specimenStack';
import { clockHour, timeIcon } from '../src/canvas/blocks/everyday/timeOfDay';
import { tagTone } from '../src/canvas/blocks/tables/tagTone';
import { ExpressionHeatmap } from '../src/canvas/blocks/tables/ExpressionHeatmap';
import { TreeTable } from '../src/canvas/blocks/tables/TreeTable';
import { SparkTable } from '../src/canvas/blocks/tables/SparkTable';
import { WorkoutPlan } from '../src/canvas/blocks/everyday/WorkoutPlan';
import { layoutFamily } from '../src/canvas/blocks/everyday/familyLayout';
import { ageTicks, claimBreakeven } from '../src/canvas/blocks/everyday/claimMath';
import {
  initials,
  rectSideCounts,
  tableLabel,
} from '../src/canvas/blocks/everyday/seatingGeometry';
import { PRAYER_VB_W, placeSlotLabels } from '../src/canvas/blocks/everyday/prayerLabels';
import { RelationshipMap } from '../src/canvas/blocks/everyday/RelationshipMap';
import { VaxSchedule } from '../src/canvas/blocks/everyday/VaxSchedule';
import { panelDomains, panelUnit } from '../src/canvas/blocks/tables/panelScale';
import { SmallMultiples } from '../src/canvas/blocks/tables/SmallMultiples';
import { placePeakLabels, scaleTicks } from '../src/canvas/blocks/tables/spectrumAxis';
import { SpectrumTable } from '../src/canvas/blocks/tables/SpectrumTable';
import { BillOfMaterials } from '../src/canvas/blocks/tables/BillOfMaterials';
import { CollectionTracker } from '../src/canvas/blocks/tables/CollectionTracker';
import { milestoneSide } from '../src/canvas/blocks/tables/milestoneSide';
import { RiskMatrix } from '../src/canvas/blocks/tables/RiskMatrix';
import type { FamilyPerson } from '../src/canvas/blocks/everyday/types';
import type { DimensionLine } from '../src/canvas/blocks/media/types';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('placeDimensions', () => {
  // An L-bracket: 100 wide, 60 tall, drawing y grows upward.
  const outline = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ];

  it('dimensions each span on the side of the part it faces', () => {
    const dims: DimensionLine[] = [
      { from: [0, 0], to: [100, 0], label: 'bottom' },
      { from: [0, 60], to: [100, 60], label: 'top' },
      { from: [0, 0], to: [0, 60], label: 'left' },
      { from: [100, 0], to: [100, 60], label: 'right' },
    ];
    expect(placeDimensions(outline, dims).map((p) => p.side)).toEqual([
      'bottom',
      'top',
      'left',
      'right',
    ]);
  });

  it('stacks overlapping spans on one side, shortest nearest the part', () => {
    const overall: DimensionLine = { from: [0, 0], to: [100, 0], label: '100' };
    const flange: DimensionLine = { from: [0, 0], to: [18, 0], label: '18' };
    const web: DimensionLine = { from: [18, 0], to: [100, 0], label: '82' };
    const placed = placeDimensions(outline, [overall, flange, web]);
    const tier = (d: DimensionLine) => placed.find((p) => p.d === d)!.tier;
    expect(tier(flange)).toBe(0);
    // The web touches the flange end to end: the arrowheads would meet, so it steps out.
    expect(tier(web)).toBe(1);
    expect(tier(overall)).toBe(2);
  });

  it('leaves spans that do not overlap on the same tier', () => {
    const a: DimensionLine = { from: [0, 0], to: [30, 0], label: '30' };
    const b: DimensionLine = { from: [60, 0], to: [100, 0], label: '40' };
    expect(placeDimensions(outline, [a, b]).map((p) => p.tier)).toEqual([0, 0]);
  });
});

describe('arrowSegment', () => {
  it('leaves the moving piece from its edge and stops at an empty square’s centre', () => {
    const seg = arrowSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, false)!;
    expect(seg).toEqual({ x1: 10, y1: 0, x2: 100, y2: 0 });
  });

  it('stops at the edge of a piece standing on the target', () => {
    const seg = arrowSegment({ x: 0, y: 0 }, { x: 0, y: 100 }, 10, true)!;
    expect(seg.y1).toBeCloseTo(10);
    expect(seg.y2).toBeCloseTo(90);
  });

  it('draws nothing for a move too short to show past the pieces', () => {
    expect(arrowSegment({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, true)).toBeNull();
  });
});

describe('separateTokens', () => {
  it('parts every disc from every other and keeps them inside the pitch', () => {
    const points = [
      { x: 50, y: 40 },
      { x: 51, y: 40 },
      { x: 50, y: 41 },
      { x: 50, y: 40 }, // coincident with the first
      { x: 2, y: 2 },
    ];
    const out = separateTokens(points, 8.6, { w: 100, h: 80 }, 4);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThanOrEqual(4);
      expect(out[i].x).toBeLessThanOrEqual(96);
      expect(out[i].y).toBeGreaterThanOrEqual(4);
      expect(out[i].y).toBeLessThanOrEqual(76);
      for (let j = i + 1; j < out.length; j++) {
        expect(dist(out[i], out[j])).toBeGreaterThan(8.6 - 0.05);
      }
    }
  });

  it('leaves discs that already clear each other where they were authored', () => {
    const points = [
      { x: 20, y: 20 },
      { x: 60, y: 60 },
    ];
    expect(separateTokens(points, 8, { w: 100, h: 100 }, 4)).toEqual(points);
  });
});

describe('sports pitch board coordinates', () => {
  const SPORTS: SportKind[] = ['soccer', 'basketball', 'football', 'tennis', 'baseball'];
  const pitchOf = (container: HTMLElement) => {
    const svg = container.querySelector('.sp-wrap svg')!;
    const [, , w, h] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const discs = Array.from(svg.querySelectorAll('circle[r="3.5"]'), (c) => ({
      x: Number(c.getAttribute('cx')),
      y: Number(c.getAttribute('cy')),
    }));
    const lines = Array.from(svg.querySelectorAll('line[marker-end]'), (l) => ({
      x1: Number(l.getAttribute('x1')),
      y1: Number(l.getAttribute('y1')),
      x2: Number(l.getAttribute('x2')),
      y2: Number(l.getAttribute('y2')),
    }));
    return { w, h, discs, lines };
  };

  it.each(SPORTS)('puts a y=100 row on the bottom line, inside the %s pitch', (sport) => {
    const row = [10, 30, 50, 70, 90].map((x, i) => ({ label: `P${i}`, x, y: 100 }));
    const mid = { label: 'M', x: 50, y: 50 };
    const { container } = render(
      <SportsPitch title="Board" sport={sport} positions={[...row, mid]} />,
    );
    const { h, discs: all } = pitchOf(container);
    // Halfway down the board is halfway down the pitch, whatever its proportions.
    expect(all[5].y).toBeCloseTo(h / 2, 6);
    const discs = all.slice(0, 5);
    for (const d of discs) {
      expect(d.y + 3.5).toBeLessThanOrEqual(h);
      expect(d.y).toBeGreaterThan(h - 3.5 - 1);
    }
    // A full-width row stays a row: nothing piled onto its neighbours by the clamp.
    for (let i = 1; i < discs.length; i++) expect(discs[i].x - discs[i - 1].x).toBeGreaterThan(7);
  });

  it.each(SPORTS)('starts a %s play at its player and stops at the receiver rim', (sport) => {
    const positions = [
      { label: 'A', x: 20, y: 80 },
      { label: 'B', x: 70, y: 30 },
    ];
    const { container } = render(
      <SportsPitch
        title="Board"
        sport={sport}
        positions={positions}
        plays={[
          { from: [20, 80], to: [70, 30], kind: 'pass' },
          { from: [70, 30], to: [95, 95], kind: 'run' },
        ]}
      />,
    );
    const { w, h, discs, lines } = pitchOf(container);
    expect(lines).toHaveLength(2);
    const [pass, run] = lines;
    expect(pass.x1).toBeCloseTo(discs[0].x, 6);
    expect(pass.y1).toBeCloseTo(discs[0].y, 6);
    expect(Math.hypot(pass.x2 - discs[1].x, pass.y2 - discs[1].y)).toBeCloseTo(3.5, 6);
    expect(run.x1).toBeCloseTo(discs[1].x, 6);
    expect(run.y1).toBeCloseTo(discs[1].y, 6);
    // An open-space end maps through the same board → viewBox transform as a player.
    expect(run.x2).toBeCloseTo(0.95 * w, 6);
    expect(run.y2).toBeCloseTo(0.95 * h, 6);
  });
});

describe('nameSpot', () => {
  const pitch = { w: 100, h: 65 };
  it('hangs a name under its disc when there is room', () => {
    expect(nameSpot({ x: 50, y: 30 }, 3.5, 2, 10, pitch)).toEqual({ x: 50, y: 30 + 3.5 + 2.2 });
  });
  it('puts a goal-line name over the disc rather than past the touchline', () => {
    const at = nameSpot({ x: 50, y: 61.8 }, 3.5, 2, 10, pitch);
    expect(at.y).toBeLessThan(61.8 - 3.5);
    expect(at.y + 2 * 0.25).toBeLessThanOrEqual(65);
  });
  it('slides a long name inward at a sideline, and never moves the disc', () => {
    const disc = { x: 4, y: 30 };
    const at = nameSpot(disc, 3.5, 2, 22, pitch);
    expect(at.x - 11).toBeGreaterThanOrEqual(0);
    expect(disc).toEqual({ x: 4, y: 30 });
    expect(nameSpot({ x: 97, y: 30 }, 3.5, 2, 22, pitch).x + 11).toBeLessThanOrEqual(100);
  });
});

describe('sports pitch on a phone card', () => {
  it('grows its type to the legibility floor instead of painting 5px names', () => {
    // A 278px card stretches the 100-unit board ~2.8x, where an authored 2-unit name is ~5.6px.
    const rect = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(278);
    try {
      const { container } = render(
        <SportsPitch
          title="Board"
          sport="soccer"
          positions={[
            { label: 'GK', x: 50, y: 92, name: 'Goalkeeper' },
            { label: 'CDM', x: 50, y: 60, name: 'Rodri' },
          ]}
        />,
      );
      const svg = container.querySelector('.sp-wrap svg')!;
      const vbW = Number(svg.getAttribute('viewBox')!.split(/\s+/)[2]);
      const scale = 278 / vbW;
      const texts = Array.from(svg.querySelectorAll('text'));
      expect(texts.length).toBeGreaterThanOrEqual(4);
      for (const t of texts)
        expect(Number(t.getAttribute('font-size')) * scale).toBeGreaterThanOrEqual(9);
      // The discs grow with their codes, so a three-letter code still sits inside one.
      const r = Number(
        svg.querySelector('circle[fill="rgba(255,255,255,0.9)"]')?.getAttribute('r'),
      );
      expect(r * scale).toBeGreaterThan(15);
    } finally {
      rect.mockRestore();
    }
  });
});

describe('placeRingBadges', () => {
  const ring = (inset: number) => [
    { x: inset, y: inset },
    { x: 100 - inset, y: inset },
    { x: 100 - inset, y: 80 - inset },
    { x: inset, y: 80 - inset },
  ];
  const building = [
    { x: 35, y: 30 },
    { x: 65, y: 30 },
    { x: 65, y: 50 },
    { x: 35, y: 50 },
  ];

  it('gives nested setback rings badges that clear the building and each other', () => {
    const r = 3;
    const badges = placeRingBadges([ring(5), ring(10), ring(15)], building, [], r);
    expect(badges).toHaveLength(3);
    for (let i = 0; i < badges.length; i++) {
      const inside =
        badges[i].x > 35 - r &&
        badges[i].x < 65 + r &&
        badges[i].y > 30 - r &&
        badges[i].y < 50 + r;
      expect(inside).toBe(false);
      for (let j = i + 1; j < badges.length; j++) {
        expect(dist(badges[i], badges[j])).toBeGreaterThanOrEqual(r * 2);
      }
    }
  });

  it('keeps clear of badges already placed', () => {
    const taken = [{ x: 5, y: 5 }];
    const [badge] = placeRingBadges([ring(5)], building, taken, 3);
    expect(dist(badge, taken[0])).toBeGreaterThan(6);
  });
});

describe('labelStates', () => {
  it.each([
    ['Side · 2.5 ft', 2.5, true],
    ['Side · 2x5 ft', 2.5, false],
    ['Side · 12.5 ft', 2.5, false],
    ['Side · 2.55 ft', 2.5, false],
    ['120 ft followed by 20 ft', 20, true],
    ['Side · 1,000 ft', 1000, true],
    ['Side · 1000 ft', 1000, false],
  ])('matches literal bounded offsets in %s', (label, offset, expected) => {
    expect(labelStates(label, offset)).toBe(expected);
  });

  it('spots an offset the label already states', () => {
    expect(labelStates('Front yard · 20 ft', 20)).toBe(true);
    expect(labelStates('Front yard', 20)).toBe(false);
    // 120 is not 20.
    expect(labelStates('Rear · 120 ft', 20)).toBe(false);
  });
});

describe('fitItemLabel', () => {
  it('keeps a name that fits on one line', () => {
    expect(fitItemLabel('Rug', { w: 40, h: 20 }, 6, 2)).toEqual({ lines: ['Rug'], fs: 6 });
  });

  it('wraps a two-word name on a narrow piece rather than shrinking it', () => {
    const fit = fitItemLabel('Coffee table', { w: 14, h: 14 }, 6, 2)!;
    expect(fit.lines).toEqual(['Coffee', 'table']);
    for (const line of fit.lines) {
      expect(estimateTextWidth(line, fit.fs, true)).toBeLessThanOrEqual(14 + 1e-6);
    }
  });

  it('cuts with an ellipsis at the floor size, or gives up when nothing fits', () => {
    const cut = fitItemLabel('Extraordinarily', { w: 12, h: 4 }, 6, 2.4)!;
    expect(cut.fs).toBe(2.4);
    expect(cut.lines[0].endsWith('…')).toBe(true);
    expect(estimateTextWidth(cut.lines[0], 2.4, true)).toBeLessThanOrEqual(12);
    expect(fitItemLabel('TV unit', { w: 20, h: 1 }, 6, 2.4)).toBeNull();
  });
});

describe('wedgeLabel', () => {
  it('fits a name along a wide wedge and reverses the arc on the lower half', () => {
    const upper = wedgeLabel('Joy', 0, 45, 30, 44, 2)!;
    const lower = wedgeLabel('Joy', 180, 45, 30, 44, 2)!;
    expect(upper.fontSize).toBeGreaterThanOrEqual(2);
    // The sweep flag flips so text on the bottom of the wheel still reads upright.
    expect(upper.d).toMatch(/ 0 [01] 1 /);
    expect(lower.d).toMatch(/ 0 [01] 0 /);
  });

  it('drops a name that cannot fit the arc at the floor size', () => {
    expect(wedgeLabel('Anticipation and vigilance', 0, 10, 30, 44, 3)).toBeNull();
    // A band too thin for a line of type.
    expect(wedgeLabel('Joy', 0, 90, 40, 42, 3)).toBeNull();
  });
});

describe('grainSegments', () => {
  const piece = { x: 0, y: 0, w: 40, h: 100 };

  it('breaks the grainline around the label so it never runs through it', () => {
    const label = { top: 45, bottom: 55, halfWidth: 12 };
    const runs = grainSegments(piece, label, 5);
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      const crosses = r.y1 < label.bottom && r.y2 > label.top && Math.abs(r.x - 20) < 12;
      expect(crosses).toBe(false);
    }
    expect(runs[0].start && !runs[0].end).toBe(true);
    expect(!runs[1].start && runs[1].end).toBe(true);
  });

  it('moves beside the label on a short, wide piece, or drops the line when there is no room', () => {
    const strap = { x: 0, y: 0, w: 100, h: 20 };
    const [beside] = grainSegments(strap, { top: 4, bottom: 16, halfWidth: 20 }, 4);
    expect(beside.x).toBeGreaterThan(50 + 20);
    expect(
      grainSegments({ x: 0, y: 0, w: 30, h: 20 }, { top: 4, bottom: 16, halfWidth: 14 }, 4),
    ).toEqual([]);
  });
});

describe('placeAxisLabels', () => {
  it('steps bunched beat names into a second row instead of printing over each other', () => {
    const points = [
      { x: 3, text: 'Opening image' },
      { x: 30, text: 'Theme stated' },
      { x: 60, text: 'Catalyst' },
      { x: 280, text: 'Finale' },
    ];
    const placed = placeAxisLabels(points, 320, 10);
    expect(placed.map((p) => p.text)).toEqual(points.map((p) => p.text));
    for (let i = 0; i < placed.length; i++) {
      const wi = estimateTextWidth(placed[i].text, 10, true);
      expect(placed[i].x - wi / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(placed[i].x + wi / 2).toBeLessThanOrEqual(320 + 1e-6);
      for (let j = i + 1; j < placed.length; j++) {
        if (placed[i].row !== placed[j].row) continue;
        const wj = estimateTextWidth(placed[j].text, 10, true);
        expect(Math.abs(placed[i].x - placed[j].x)).toBeGreaterThanOrEqual((wi + wj) / 2);
      }
    }
    expect(new Set(placed.map((p) => p.row)).size).toBeGreaterThan(1);
  });
});

describe('specimenStack', () => {
  it('gives every named face a fallback of its own kind', () => {
    expect(specimenStack('Inter')).toBe('"Inter", system-ui, sans-serif');
    expect(specimenStack('Fraunces')).toBe('"Fraunces", Georgia, serif');
    expect(specimenStack('Source Sans Pro')).toMatch(/sans-serif$/);
    expect(specimenStack('JetBrains Mono')).toMatch(/monospace$/);
    expect(specimenStack('Inter, sans-serif')).toBe('Inter, sans-serif, system-ui, sans-serif');
    expect(specimenStack('  ')).toBeUndefined();
  });
});

describe('dose times', () => {
  it('reads the hour with its AM/PM', () => {
    expect(clockHour('2:00 PM')).toBe(14);
    expect(clockHour('12:00 AM')).toBe(0);
    expect(clockHour('12 PM')).toBe(12);
    expect(clockHour('6pm')).toBe(18);
    expect(clockHour('14:00')).toBe(14);
    expect(clockHour('noon')).toBe(12);
    expect(clockHour('with breakfast')).toBeUndefined();
  });

  it('puts a sun on daytime doses and a moon on overnight ones', () => {
    expect(timeIcon('2:00 PM')).toBe('sun');
    expect(timeIcon('10:00 PM')).toBe('moon');
    expect(timeIcon('12:00 AM')).toBe('moon');
    expect(timeIcon('6:00 AM')).toBe('sun');
    expect(timeIcon('bedtime')).toBe('moon');
    expect(timeIcon('as needed')).toBe('clock');
  });
});

describe('tagTone', () => {
  it('colours a severity word by its severity, anything else by its row', () => {
    expect(tagTone('critical', 'var(--insight)')).toBe('var(--danger)');
    expect(tagTone('At risk', 'var(--insight)')).toBe('var(--danger)');
    expect(tagTone('watch', 'var(--insight)')).toBe('var(--warning)');
    expect(tagTone('new', 'var(--insight)')).toBe('var(--insight)');
  });

  it('paints a critical tag in the danger colour even on a calm row', () => {
    const { container } = render(
      <TreeTable
        title="Backlog"
        nodes={[{ label: 'Search', value: '108', tag: 'critical', color: 'var(--insight)' }]}
      />,
    );
    const tag = container.querySelector<HTMLElement>('.tt-tag')!;
    expect(tag.style.color).toBe('var(--danger)');
  });
});

describe('table cell fills', () => {
  it('fills every expression cell opaquely, so its derived ink has a real colour to read', () => {
    const { container } = render(
      <ExpressionHeatmap
        title="Expression"
        genes={['A', 'B']}
        samples={['s1', 's2']}
        values={[
          [0, 2.5],
          [-3, 0.4],
        ]}
      />,
    );
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.eh-cell'));
    expect(cells.length).toBe(4);
    for (const c of cells) {
      const fill = c.style.getPropertyValue('--eh-fill');
      expect(fill).toMatch(/var\(--surface-elevated\)\)$/);
      expect(fill).not.toMatch(/transparent/);
    }
  });
});

describe('SparkTable', () => {
  it('colours a change by the series colour, not by its sign', () => {
    const { container } = render(
      <SparkTable
        title="Panel"
        rows={[
          {
            name: 'LDL',
            value: '138',
            delta: '+11',
            deltaDir: 'up',
            color: 'var(--warning)',
            series: [1, 2],
          },
          { name: 'HDL', value: '58', delta: '+5', deltaDir: 'up', series: [1, 2] },
        ]}
      />,
    );
    const [ldl, hdl] = Array.from(container.querySelectorAll<HTMLElement>('.sk-delta'));
    expect(ldl.style.color).toContain('var(--warning)');
    // No colour given: the sign convention stands.
    expect(hdl.style.color).toBe('');
    expect(hdl.classList.contains('up')).toBe(true);
  });
});

describe('WorkoutPlan', () => {
  it('counts one set in the singular and adds "reps" only to a count', () => {
    const { container } = render(
      <WorkoutPlan
        title="Plan"
        sessions={[
          {
            day: 'Tue',
            exercises: [
              { name: 'Warm-up', sets: 1, reps: '10 min easy' },
              { name: 'Squat', sets: 3, reps: '8-10' },
            ],
          },
        ]}
      />,
    );
    const badges = Array.from(container.querySelectorAll('.wp-badge')).map((b) => b.textContent);
    expect(badges).toEqual(['1 set', '10 min easy', '3 sets', '8-10 reps']);
  });
});

describe('layoutFamily', () => {
  const MATE = 108 / 128;
  const people: FamilyPerson[] = [
    { id: 'gma', name: 'Eleanor', partner: 'gpa' },
    { id: 'gpa', name: 'Harold' },
    { id: 'gma2', name: 'Rosa' },
    { id: 'gpa2', name: 'Miguel', partner: 'gma2' },
    { id: 'mom', name: 'Carla', parents: ['gma', 'gpa'], partner: 'dad' },
    { id: 'dad', name: 'James', parents: ['gma2', 'gpa2'] },
    { id: 'aunt', name: 'Sofia', parents: ['gma', 'gpa'] },
    { id: 'you', name: 'You', parents: ['mom', 'dad'] },
    { id: 'sib', name: 'Nate', parents: ['mom', 'dad'] },
    { id: 'kid', name: 'Maya', parents: ['you'] },
  ];

  // Every couple sits side by side with nobody between them (so its mating line crosses no
  // card), every sibling set is one contiguous run (so its bar crosses no card), and no two
  // cards in a row overlap.
  const assertClean = (list: FamilyPerson[]) => {
    const { rows, slot, partnerOf, groups } = layoutFamily(list, MATE);
    for (const row of rows) {
      const xs = row.map((id) => slot.get(id)!);
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(MATE - 1e-9);
      for (const id of row) {
        const m = partnerOf.get(id);
        if (m && row.includes(m)) expect(Math.abs(row.indexOf(m) - row.indexOf(id))).toBe(1);
      }
    }
    for (const g of groups) {
      const row = rows.find((r) => r.includes(g.childIds[0]))!;
      const idx = g.childIds.map((c) => row.indexOf(c)).sort((a, b) => a - b);
      const span = row.slice(idx[0], idx[idx.length - 1] + 1);
      // Only the siblings themselves, or a sibling's partner, may sit inside the run.
      for (const id of span) {
        const ok = g.childIds.includes(id) || g.childIds.includes(partnerOf.get(id) ?? '');
        expect(ok).toBe(true);
      }
    }
  };

  it('keeps both sets of grandparents apart and siblings together', () => {
    assertClean(people);
    const { rows } = layoutFamily(people, MATE);
    expect(rows[0]).toEqual(['gma', 'gpa', 'gma2', 'gpa2']);
    // The aunt sits on her sister's outer side, away from the in-law.
    expect(rows[1]).toEqual(['aunt', 'mom', 'dad']);
  });

  it('does not depend on listing order', () => {
    assertClean([...people].reverse());
    const { rows } = layoutFamily([...people].reverse(), MATE);
    const top = rows[0];
    // Each couple adjacent, and the couples follow the side their children landed on.
    const voss = Math.min(top.indexOf('gma'), top.indexOf('gpa'));
    const delgado = Math.min(top.indexOf('gma2'), top.indexOf('gpa2'));
    const momLeft = rows[1].indexOf('mom') < rows[1].indexOf('dad');
    expect(voss < delgado).toBe(momLeft);
  });

  it('places a married-in partner with no parents of record beside their spouse', () => {
    const list: FamilyPerson[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', partner: 'a' },
      { id: 'c', name: 'C', parents: ['a', 'b'] },
      { id: 'd', name: 'D', parents: ['a', 'b'], partner: 'e' },
      { id: 'e', name: 'E' },
      { id: 'f', name: 'F', parents: ['d', 'e'] },
    ];
    assertClean(list);
  });
});

describe('claimBreakeven', () => {
  it('solves the age the latest claim overtakes the earliest from the plotted benefits', () => {
    const t = claimBreakeven([
      { age: 62, monthly: 1540 },
      { age: 67, monthly: 2200 },
      { age: 70, monthly: 2728 },
    ])!;
    // Both running totals are equal there.
    expect(1540 * (t - 62)).toBeCloseTo(2728 * (t - 70), 6);
    expect(t).toBeCloseTo(80.37, 2);
  });

  it('has no crossing when waiting never pays more', () => {
    expect(
      claimBreakeven([
        { age: 62, monthly: 2000 },
        { age: 70, monthly: 1900 },
      ]),
    ).toBeNull();
    expect(claimBreakeven([{ age: 62, monthly: 1000 }])).toBeNull();
  });

  it('labels the age axis at a step that keeps labels apart at any width', () => {
    for (const w of [220, 400, 840]) {
      const t = ageTicks(62, 90, w);
      expect(t[0]).toBe(62);
      expect(((t[1] - t[0]) * w) / 28).toBeGreaterThanOrEqual(36);
      expect(t[t.length - 1]).toBeLessThanOrEqual(90);
    }
  });
});

describe('seating geometry', () => {
  it('takes initials from the name, never from an aside or its punctuation', () => {
    expect(initials('Pepper (the dog)')).toBe('PE');
    expect(initials('Ana María López')).toBe('AM');
    expect(initials('"Big" Jim')).toBe('BJ');
    expect(initials('(  )')).toBe('?');
  });

  it('wraps a long table name to two lines that fit the round table', () => {
    const r = 40;
    const { lines, fontSize } = tableLabel('Head table and the wedding party', { r });
    expect(lines.length).toBeLessThanOrEqual(2);
    const usable = 2 * Math.sqrt(r * r - (fontSize * 1.15) ** 2) - 8;
    for (const line of lines) {
      expect(estimateTextWidth(line, fontSize, true)).toBeLessThanOrEqual(usable + 0.5);
    }
  });

  it('shares seats by side length and caps the short ends', () => {
    for (const n of [4, 7, 10, 13, 20]) {
      const counts = rectSideCounts(n, 160, 50, 10);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
      // A 50-tall end holds two 20-wide seats at most.
      expect(counts[1]).toBeLessThanOrEqual(2);
      expect(counts[3]).toBeLessThanOrEqual(2);
      expect(Math.abs(counts[0] - counts[2])).toBeLessThanOrEqual(1);
    }
  });
});

describe('placeSlotLabels', () => {
  it('keeps every row free of overlaps and inside the arc, for close and far times alike', () => {
    for (const n of [3, 5, 8, 14]) {
      // Evening slots crowd at the right end, as real prayer times do.
      const xs = Array.from({ length: n }, (_, i) => 22 + 276 * Math.sqrt(i / Math.max(1, n - 1)));
      const widths = xs.map((_, i) => 30 + (i % 3) * 12);
      const placed = placeSlotLabels(xs, widths);
      const widest = Math.max(...widths);
      for (let row = 0; row < placed[0].rows; row++) {
        const inRow = placed
          .map((p, i) => ({ ...p, i }))
          .filter((p) => p.row === row)
          .sort((a, b) => a.x - b.x);
        for (let k = 1; k < inRow.length; k++) {
          expect(inRow[k].x - inRow[k - 1].x).toBeGreaterThanOrEqual(widest - 0.01);
        }
        for (const p of inRow) {
          expect(p.x - widest / 2).toBeGreaterThanOrEqual(-0.01);
          expect(p.x + widest / 2).toBeLessThanOrEqual(PRAYER_VB_W + 0.01);
        }
      }
    }
  });
});

describe('RelationshipMap labels', () => {
  it('sets every name outside the ring, clear of the chords between dots', () => {
    const people = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` }));
    const ties = people
      .slice(1)
      .map((p) => ({ source: 'p0', target: p.id, kind: 'ally' as const }));
    const { container } = render(<RelationshipMap title="Ties" people={people} ties={ties} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.rm-node-label'));
    expect(labels).toHaveLength(7);
    for (const l of labels) {
      const d = Math.hypot(Number(l.getAttribute('x')) - 260, Number(l.getAttribute('y')) - 160);
      // Ring radius 120 plus the dot's own 16.
      expect(d).toBeGreaterThan(136);
    }
  });
});

describe('VaxSchedule visits', () => {
  it('draws one tick per due date and stacks the shots given that day', () => {
    const { container } = render(
      <VaxSchedule
        title="Shots"
        doses={[
          { vaccine: 'DTaP', dueAt: '8 weeks', status: 'done' },
          { vaccine: 'Polio', dueAt: '8 weeks', status: 'overdue' },
          { vaccine: 'MMR', dueAt: '12 months', status: 'due' },
        ]}
      />,
    );
    expect(container.querySelectorAll('svg.vx-axis circle')).toHaveLength(2);
    expect(container.querySelectorAll('svg.vx-axis text.vx-due')).toHaveLength(2);
    const [dtap, polio] = Array.from(container.querySelectorAll('svg.vx-axis text.vx-label'));
    expect(dtap.getAttribute('x')).toBe(polio.getAttribute('x'));
    expect(Number(dtap.getAttribute('y'))).toBeLessThan(Number(polio.getAttribute('y')));
    // The shared tick takes the more urgent status.
    expect(container.querySelector('svg.vx-axis circle')?.getAttribute('fill')).toBe(
      'var(--danger)',
    );
  });
});

describe('SmallMultiples scale and tone', () => {
  const vitals = [
    { label: 'HRV (ms)', series: [52, 58, 65], stat: '65 ms' },
    { label: 'Resting HR', series: [60, 57, 54], stat: '54 bpm' },
    { label: 'Body weight', series: [178, 176, 174], stat: '174 lb' },
  ];

  it('reads a unit from the stat, then from a bracket on the label', () => {
    expect(panelUnit({ label: 'x', stat: '54 bpm' })).toBe('|bpm');
    expect(panelUnit({ label: 'x', stat: '$1.2M' })).toBe('$|m');
    expect(panelUnit({ label: 'Sleep (h)' })).toBe('|h');
    expect(panelUnit({ label: 'Revenue', stat: '42' })).toBeUndefined();
  });

  it('gives each panel its own range when the units differ, and one shared range otherwise', () => {
    const mixed = panelDomains(vitals);
    expect(mixed.shared).toBe(false);
    expect(mixed.domains).toEqual([
      [52, 65],
      [54, 60],
      [174, 178],
    ]);
    const regions = panelDomains([
      { label: 'North', series: [10, 20], stat: '$20k' },
      { label: 'South', series: [3, 5], stat: '$5k' },
    ]);
    expect(regions.shared).toBe(true);
    expect(regions.domains).toEqual([
      [3, 20],
      [3, 20],
    ]);
  });

  it('colours a fall the panel calls good as good', () => {
    const { container } = render(
      <SmallMultiples
        title="Vitals"
        kind="line"
        panels={[
          { ...vitals[1], delta: '-6', deltaDir: 'down', good: true },
          { ...vitals[0], delta: '+13', deltaDir: 'up' },
          { ...vitals[2], delta: '+4', deltaDir: 'up', good: false },
        ]}
      />,
    );
    const tones = Array.from(container.querySelectorAll('.sm-delta')).map((el) =>
      el.className.replace('sm-delta', '').trim(),
    );
    expect(tones).toEqual(['good', 'good', 'bad']);
  });
});

describe('SpectrumTable strip', () => {
  it('spaces round scale ticks at least the asked gap apart', () => {
    for (const [lo, hi, w] of [
      [0, 12, 600],
      [0, 220, 300],
      [400, 4000, 900],
    ]) {
      const ticks = scaleTicks(lo, hi, w, 60);
      expect(ticks.length).toBeGreaterThan(1);
      const pxPerUnit = w / (hi - lo);
      for (let i = 1; i < ticks.length; i++) {
        expect((ticks[i] - ticks[i - 1]) * pxPerUnit).toBeGreaterThanOrEqual(60 - 1e-6);
      }
      expect(ticks[0]).toBeGreaterThanOrEqual(lo);
      expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(hi);
    }
  });

  it('staggers close shifts into rows that never overlap', () => {
    // A 13C spectrum's aromatic carbons sit a few ppm apart.
    const xs = [100, 104, 108, 112, 300, 500];
    const widths = xs.map(() => 28);
    const placed = placePeakLabels(xs, widths, 0, 600);
    for (let row = 0; row < placed[0].rows; row++) {
      const inRow = placed.filter((p) => p.row === row).sort((a, b) => a.x - b.x);
      for (let k = 1; k < inRow.length; k++) {
        expect(inRow[k].x - inRow[k - 1].x).toBeGreaterThanOrEqual(28);
      }
    }
  });

  it('draws one stick per peak, tallest for the largest integration, and keeps the unit cased', () => {
    const { container } = render(
      <SpectrumTable
        title="Ethanol"
        technique="nmr-1h"
        peaks={[
          { x: 3.7, integration: 2 },
          { x: 2.58, integration: 1 },
          { x: 1.22, integration: 3 },
        ]}
      />,
    );
    const sticks = Array.from(container.querySelectorAll('.spt-stick'));
    expect(sticks).toHaveLength(3);
    const heights = sticks.map((l) => Number(l.getAttribute('y1')) - Number(l.getAttribute('y2')));
    // Sorted high shift to low: 3.70 (2H), 2.58 (1H), 1.22 (3H).
    expect(heights[2]).toBeGreaterThan(heights[0]);
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(container.querySelector('.spt-colh-unit')?.textContent).toBe('δ (ppm)');
    expect(container.querySelectorAll('.spt-peak-label')).toHaveLength(3);
  });
});

describe('BillOfMaterials rows', () => {
  it('never gives a part row the part-number cell class, and leaves heading cells empty', () => {
    const { container } = render(
      <BillOfMaterials
        title="Build"
        rows={[
          { label: 'Chassis', kind: 'subassembly' },
          { label: 'Plate', partNo: 'CH-100', qty: 1, unitCost: 8.5, indent: 1 },
          { label: 'Screw', qty: 12, unitCost: 0.08, indent: 1 },
        ]}
      />,
    );
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    for (const r of rows) expect(r.classList.contains('bom-part')).toBe(false);
    const [heading, plate, screw] = rows.map((r) => Array.from(r.querySelectorAll('td')));
    expect(heading.slice(1, 4).map((td) => td.textContent)).toEqual(['', '', '']);
    expect(plate[1].textContent).toBe('CH-100');
    // A part missing its number shows the body-face dash.
    expect(screw[1].querySelector('.bom-none')?.textContent).toBe('—');
  });
});

describe('CollectionTracker tiles', () => {
  it('gives the name its own line and sets the condition beside the date', () => {
    const { container } = render(
      <CollectionTracker
        title="Vinyl"
        items={[
          {
            name: 'Kind of Blue — Miles Davis, 1959 original',
            condition: 'good',
            acquiredDate: 'Mar 2022',
          },
        ]}
      />,
    );
    const name = container.querySelector('.ctk-name')!;
    expect(name.parentElement?.classList.contains('ctk-card')).toBe(true);
    const meta = container.querySelector('.ctk-meta')!;
    expect(meta.querySelector('.ctk-date')?.textContent).toBe('Mar 2022');
    expect(meta.querySelector('.ctk-condition')).not.toBeNull();
  });
});

describe('milestoneSide', () => {
  it('writes the name toward the open side, sized to the room before the next mark', () => {
    const events = [
      { at: 0, span: 0.35, label: 'Backfill' },
      { at: 0.4, label: 'Sign-off' },
      { at: 0.6, span: 0.3, label: 'Ramp' },
    ];
    // 0.05 clear to the left, 0.2 to the right.
    const s = milestoneSide(events, 1);
    expect(s.dir).toBe('right');
    expect(s.room).toBeCloseTo(0.19, 5);
    const end = milestoneSide([{ at: 0.95, label: 'Done' }], 0);
    expect(end.dir).toBe('left');
    expect(end.room).toBeCloseTo(0.94, 5);
  });
});

describe('RiskMatrix scores', () => {
  it('numbers every row and column, likelihood high to low', () => {
    const { container } = render(
      <RiskMatrix size={4} risks={[{ label: 'Outage', likelihood: 3, impact: 4 }]} />,
    );
    const y = Array.from(container.querySelectorAll('.rm-tick--y')).map((t) => t.textContent);
    const x = Array.from(container.querySelectorAll('.rm-tick--x')).map((t) => t.textContent);
    expect(y).toEqual(['4', '3', '2', '1']);
    expect(x).toEqual(['1', '2', '3', '4']);
  });
});

describe('tables stylesheet rules behind the low findings', () => {
  const css = readFileSync('src/canvas/blocks/tables/styles.css', 'utf8');
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('sorting headers keep the header case and tracking', () => {
    expect(rule('.dtr-th-btn')).toMatch(/text-transform: inherit/);
    expect(rule('.dtr-th-btn')).toMatch(/letter-spacing: inherit/);
  });

  it('centres ingredient marks on the cell, not the baseline', () => {
    expect(rule('.im-check')).toMatch(/vertical-align: middle/);
    expect(rule('.im-empty')).toMatch(/vertical-align: middle/);
  });

  it('insets the size column past the "your size" bar', () => {
    expect(rule('.sz-size')).toMatch(/padding: 9px 12px 9px 10px/);
    expect(rule('.sz-th--size')).toMatch(/padding-left: 10px/);
  });

  it('runs each dose rung bar its full height instead of a percentage that cannot resolve', () => {
    expect(rule('.dl-bar')).not.toMatch(/height: var\(--dl-h/);
  });

  it('keeps the FMEA rule and its caption in one row', () => {
    expect(rule('.fma-priority-rule')).toMatch(/display: flex/);
    expect(rule('.fma-priority-rule::after')).not.toMatch(/position: absolute/);
  });
});
