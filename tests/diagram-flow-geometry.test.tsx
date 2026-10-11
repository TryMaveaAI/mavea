import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import { NODE_R as BT_NODE_R, rimToRim } from '../src/canvas/blocks/diagrams/binaryTreeLayout';
import { outputPins, evaluateCircuit } from '../src/canvas/blocks/diagrams/logicGatesLayout';
import type { Level } from '../src/canvas/blocks/diagrams/logicGatesLayout';
import { LogicGates } from '../src/canvas/blocks/diagrams/LogicGates';
import { BADGE_INSET, treeMetrics } from '../src/canvas/blocks/diagrams/recursionTreeLayout';
import { payloadLines } from '../src/canvas/blocks/diagrams/protocolStackLayout';
import { cardHeight, nodeLines } from '../src/canvas/blocks/diagrams/causationChainLayout';
import { edgeLabelCentre } from '../src/canvas/blocks/diagrams/diagramFlowLayout';
import {
  BOX_W_MAIN,
  BOX_W_SIDE,
  HUB_R,
  boxText,
  hubLayout,
} from '../src/canvas/blocks/diagrams/fiveForcesLayout';
import { FiveForces } from '../src/canvas/blocks/diagrams/FiveForces';
import type { FiveForceEntry } from '../src/canvas/blocks/diagrams/types';
import { emotionPoints } from '../src/canvas/blocks/flows/journeyMapLayout';
import { JourneyMap } from '../src/canvas/blocks/flows/JourneyMap';
import { labelSpot, routeRun } from '../src/canvas/blocks/diagrams/pipingLayout';
import { routeWires, type RoutedPart } from '../src/canvas/blocks/diagrams/circuitRoute';
import {
  elbow,
  returnPathIds,
  signAt,
  type Placed as ControlPlaced,
} from '../src/canvas/blocks/diagrams/controlBlockLayout';
import {
  ASCENT,
  LABEL_GAP as CW_LABEL_GAP,
  NODE_R as CW_NODE_R,
  RING_R,
  frameFor,
  stageText,
} from '../src/canvas/blocks/diagrams/cycleWheelLayout';
import { edgeLabelSpots } from '../src/canvas/blocks/diagrams/synthesisRouteLayout';
import { edgeLabelAt } from '../src/canvas/blocks/diagrams/trieLayout';
import {
  NODE_R as FW_NODE_R,
  linkCurve,
  placeOrganismLabels,
} from '../src/canvas/blocks/diagrams/foodWebLayout';
import { placeLabels } from '../src/canvas/blocks/diagrams/plasmidLayout';
import { skillEdgePath } from '../src/canvas/blocks/flows/skillTreeLayout';
import { dagEdgePath } from '../src/canvas/blocks/flows/planDagLayout';
import { captionSlots, repeatsDate } from '../src/canvas/blocks/flows/chronoLayout';
import { Roadmap } from '../src/canvas/blocks/flows/Roadmap';

type Pt = { x: number; y: number };

/** Every number in an SVG path, as points. */
const pathPoints = (d: string): Pt[] => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }));
};

/** Distance from a point to the segment a→b. */
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** True when any sample of the segment a→b falls inside the box centred at c. */
const segmentHitsBox = (a: Pt, b: Pt, c: Pt, w: number, h: number) => {
  for (let k = 0; k <= 60; k++) {
    const x = a.x + ((b.x - a.x) * k) / 60;
    const y = a.y + ((b.y - a.y) * k) / 60;
    if (Math.abs(x - c.x) < w / 2 && Math.abs(y - c.y) < h / 2) return true;
  }
  return false;
};

describe('binary tree edges', () => {
  it('run rim to rim, so no line shows through a translucent node', () => {
    const e = rimToRim({ x: 0, y: 0 }, { x: 30, y: 60 })!;
    expect(Math.hypot(e.x1, e.y1)).toBeCloseTo(BT_NODE_R);
    expect(Math.hypot(e.x2 - 30, e.y2 - 60)).toBeCloseTo(BT_NODE_R);
  });

  it('draw nothing between discs that touch', () => {
    expect(rimToRim({ x: 0, y: 0 }, { x: BT_NODE_R * 2, y: 0 })).toBeNull();
  });
});

describe('logic gates', () => {
  const halfAdder = [
    { id: 'sum', kind: 'XOR' as const, inputs: ['a', 'b'] },
    { id: 'carry', kind: 'AND' as const, inputs: ['a', 'b'] },
  ];

  it('gives a gate whose result feeds nothing its own output pin', () => {
    expect(outputPins(halfAdder, { from: 'sum', label: 'S' })).toEqual([
      { from: 'sum', label: 'S' },
      { from: 'carry', label: 'Carry' },
    ]);
  });

  it('evaluates every gate from the inputs, and leaves a dangling source unknown', () => {
    const levels = evaluateCircuit(
      [...halfAdder, { id: 'odd', kind: 'OR', inputs: ['a', 'missing'] }],
      new Map<string, Level>([
        ['a', 1],
        ['b', 1],
      ]),
    );
    expect(levels.get('sum')).toBe(0);
    expect(levels.get('carry')).toBe(1);
    expect(levels.get('odd')).toBeNull();
  });

  it('survives a feedback loop without recursing forever', () => {
    const levels = evaluateCircuit(
      [
        { id: 'p', kind: 'AND', inputs: ['a', 'q'] },
        { id: 'q', kind: 'AND', inputs: ['a', 'p'] },
      ],
      new Map<string, Level>([['a', 1]]),
    );
    expect(levels.get('p')).toBeNull();
  });

  it('adds the evaluated carry as a column of the truth table', () => {
    const { container } = render(
      <LogicGates
        title="Half adder"
        inputs={[
          { id: 'a', label: 'A', value: 1 },
          { id: 'b', label: 'B', value: 1 },
        ]}
        gates={halfAdder}
        output={{ from: 'sum', label: 'S' }}
        truth={[
          { row: [0, 0], out: 0 },
          { row: [1, 1], out: 0 },
        ]}
      />,
    );
    const heads = Array.from(container.querySelectorAll('.dg-lg-truth th')).map(
      (th) => th.textContent,
    );
    expect(heads).toContain('Carry');
    const lastRow = Array.from(container.querySelectorAll('.dg-lg-truth tbody tr')).at(-1)!;
    expect(lastRow.lastElementChild?.textContent).toBe('1');
  });
});

describe('recursion tree spacing', () => {
  it('spaces sibling calls so a badge never reaches the next box', () => {
    for (const [calls, results] of [
      [['fib(1)'], ['1']],
      [['mergeSort([5,2,9,1])'], ['[1,2,5,9]']],
    ]) {
      const m = treeMetrics(calls, results);
      const badgeRight = m.boxW / 2 - BADGE_INSET + m.badgeW / 2;
      expect(m.pitch - m.boxW / 2).toBeGreaterThan(badgeRight);
    }
  });
});

describe('protocol stack payload', () => {
  it('keeps "Your request" whole on two lines', () => {
    const { lines, clipped } = payloadLines('Your request', 40);
    expect(clipped).toBe(false);
    expect(lines.join(' ')).toBe('Your request');
  });
});

describe('causation chain cards', () => {
  it('shows a three-line label whole and grows the card to hold it', () => {
    const label = 'Higher input costs versus slower demand growth across the region';
    const lines = nodeLines(label);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(' ')).toBe(label);
    expect(cardHeight(3)).toBeGreaterThan(cardHeight(2));
  });

  it('never meets an ellipsis with a trailing full stop', () => {
    const lines = nodeLines(
      'Retail margins compressed as discounters expand vs. the long-run trend of premium brands holding share through every downturn since the nineties',
    );
    expect(lines.at(-1)).toMatch(/…$/);
    expect(lines.at(-1)).not.toMatch(/[.,;:]…$/);
  });
});

describe('diagram flow edge labels', () => {
  it('sit beside the curve midpoint, clear of it on the convex side', () => {
    for (const [nx, ny] of [
      [0, -1],
      [1, 0],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ]) {
      const arc = { midX: 100, midY: 100, nx, ny };
      const c = edgeLabelCentre(arc, 40, 14);
      expect(Math.abs(c.x - 100) >= 20 || Math.abs(c.y - 100) >= 7).toBe(true);
      // on the bow's side, not the other
      expect((c.x - 100) * nx + (c.y - 100) * ny).toBeGreaterThan(0);
    }
  });
});

describe('five forces hub', () => {
  it('fits each caption line to the chord at its own height', () => {
    for (const industry of ['Airlines', 'AI coding assistants', 'Industrial robotics']) {
      const hub = hubLayout(industry);
      expect(hub.sub.join(' ')).toBe(industry);
      hub.sub.forEach((ln, i) => {
        const y = hub.subY[i];
        const far = Math.max(Math.abs(y - 15.5 * 0.78), Math.abs(y + 15.5 * 0.22));
        const chord = Math.sqrt(HUB_R * HUB_R - far * far);
        expect(estimateTextWidth(ln, 15.5, false) / 2).toBeLessThanOrEqual(chord);
      });
    }
  });
});

describe('five forces boxes', () => {
  const notes = [
    'A handful of frontier labs set the price and the pace.',
    'Switching cost is low until data + workflow lock-in builds.',
    'Every regulated buyer runs a six-month security review before a pilot, then another before rollout.',
  ];

  it('shows a side note whole, wrapped to the box at its real width', () => {
    for (const w of [BOX_W_SIDE, BOX_W_MAIN]) {
      for (const note of notes) {
        const box = boxText('Model API providers', note, w);
        expect(box.cut).toBe(false);
        expect(box.noteLines.join(' ')).toBe(note);
        for (const ln of box.noteLines) {
          expect(estimateTextWidth(ln, 15.5, false), ln).toBeLessThanOrEqual(w - 24);
        }
      }
    }
  });

  it('grows the box, and the figure, rather than cutting a long note', () => {
    const short = boxText('Buyers', notes[0], BOX_W_SIDE);
    const long = boxText('Buyers', notes[2], BOX_W_SIDE);
    expect(long.noteLines.length).toBeGreaterThan(3);
    expect(long.h).toBeGreaterThan(short.h);

    const forces = (note: string): FiveForceEntry[] => [
      { id: 'newEntrants', label: 'New entrants', strength: 'high', note: 'Cheap APIs.' },
      { id: 'suppliers', label: 'Model API providers', strength: 'medium', note },
      { id: 'buyers', label: 'Enterprise buyers', strength: 'medium', note },
      { id: 'substitutes', label: 'General chat LLMs', strength: 'high', note: 'Free tiers.' },
    ];
    const boxes = (note: string) => {
      const { container } = render(
        <FiveForces title="Forces" industry="AI coding assistants" forces={forces(note)} />,
      );
      const vbH = Number(
        container.querySelector('svg.dg-svg')!.getAttribute('viewBox')!.split(' ')[3],
      );
      const rects = Array.from(container.querySelectorAll('rect.ff-box')).map((r) => ({
        x: Number(r.getAttribute('x')),
        y: Number(r.getAttribute('y')),
        w: Number(r.getAttribute('width')),
        h: Number(r.getAttribute('height')),
      }));
      const text = Array.from(container.querySelectorAll('text.ff-box-note'))
        .map((t) => Array.from(t.querySelectorAll('tspan'), (s) => s.textContent).join(' '))
        .join(' | ');
      return { vbH, rects, text };
    };
    const a = boxes(notes[0]);
    const b = boxes(notes[2]);
    expect(b.text).toContain(notes[2]);
    expect(b.text).not.toContain('…');
    expect(b.vbH).toBeGreaterThan(a.vbH);
    // The grown side boxes still clear the N/S pair they overlap horizontally.
    for (const { rects, vbH } of [a, b]) {
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const p = rects[i];
          const q = rects[j];
          const apart =
            p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
          expect(apart, `boxes ${i} and ${j} overlap`).toBe(true);
        }
        expect(rects[i].y).toBeGreaterThanOrEqual(0);
        expect(rects[i].y + rects[i].h).toBeLessThanOrEqual(vbH);
      }
    }
  });
});

describe('piping runs', () => {
  it('leave and enter each fitting at its port, never through the glyph', () => {
    const { points, out, in: into } = routeRun({ x: 0, y: 0 }, { x: 60, y: 40 });
    expect(out).toBe('right');
    expect(into).toBe('top');
    expect(points[0].x).toBeGreaterThan(8);
    expect(points.at(-1)!.y).toBeLessThan(40 - 8);
  });

  it('moves a tag off any side a pipe uses', () => {
    expect(labelSpot(new Set()).y).toBeGreaterThan(0);
    expect(labelSpot(new Set(['bottom'])).y).toBeLessThan(0);
    expect(labelSpot(new Set(['bottom', 'top'])).anchor).toBe('start');
  });
});

describe('circuit wiring', () => {
  const parts: RoutedPart[] = [
    { id: 'bat', kind: 'battery', x: 20, y: 40 },
    { id: 'r', kind: 'resistor', x: 60, y: 20 },
    { id: 'lamp', kind: 'bulb', x: 60, y: 60 },
  ];
  const wires = [
    { from: 'bat', to: 'r' },
    { from: 'r', to: 'lamp' },
    { from: 'lamp', to: 'bat' },
  ];

  it('reads a series loop as one loop: each part uses both of its leads', () => {
    const routes = routeWires(parts, wires);
    for (const p of parts) {
      const ends = routes.flatMap((r) => [r.points[0], r.points.at(-1)!]);
      const leads = new Set(
        ends
          .filter((e) => Math.abs(e.y - p.y) < 0.5 && Math.abs(Math.abs(e.x - p.x) - 7) < 0.5)
          .map((e) => Math.sign(e.x - p.x)),
      );
      expect(leads.size, `${p.id} uses one lead`).toBe(2);
    }
  });

  it('routes a large netlist in bounded time, every wire drawn', () => {
    // The flip search re-routes every wire per trial; unbudgeted, 90 wires took ~4s.
    const big: RoutedPart[] = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      kind: (['resistor', 'capacitor', 'bulb', 'node'] as const)[i % 4],
      x: (i % 8) * 40,
      y: Math.floor(i / 8) * 30,
    }));
    const net = Array.from({ length: 90 }, (_, i) => ({
      from: `p${i % 60}`,
      to: `p${(i * 7 + 3) % 60}`,
    }));
    const t = performance.now();
    const routes = routeWires(big, net);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(routes).toHaveLength(net.filter((w) => w.from !== w.to).length);
  });

  it('never runs a wire across a part it does not connect', () => {
    const routes = routeWires(parts, wires);
    routes.forEach((r) => {
      const { from, to } = wires[r.index];
      for (const p of parts) {
        if (p.id === from || p.id === to) continue;
        for (let k = 1; k < r.points.length; k++) {
          expect(segDist(p, r.points[k - 1], r.points[k])).toBeGreaterThan(3);
        }
      }
    });
  });
});

describe('control block wiring', () => {
  const block = (id: string, cx: number, cy: number): ControlPlaced => ({
    id,
    renderId: id,
    label: id,
    kind: 'block',
    cx,
    cy,
    halfW: 30,
    halfH: 14,
  });

  it('finds blocks that live only on the return path', () => {
    const ids = returnPathIds(
      [
        { id: 'sum', label: 'Σ', kind: 'sum' },
        { id: 'plant', label: 'Plant', kind: 'block' },
        { id: 'sensor', label: 'Sensor', kind: 'block' },
      ],
      [
        { from: 'sum', to: 'plant' },
        { from: 'plant', to: 'sensor', feedback: true },
        { from: 'sensor', to: 'sum', feedback: true },
      ],
    );
    expect([...ids]).toEqual(['sensor']);
  });

  it('bends a feedback wire out of one side and into another, stopping at the rim', () => {
    const pts = elbow(block('a', 200, 50), block('b', 100, 150));
    expect(pts[0]).toEqual({ x: 200, y: 64 });
    const last = pts.at(-1)!;
    expect(last.y).toBe(150);
    expect(last.x).toBeGreaterThan(130);
  });

  it('sets a sign beside the wire, behind its arrowhead', () => {
    const p = signAt({ x: 100, y: 50 }, { x: 1, y: 0 });
    expect(p.x).toBeLessThan(100 - 14);
    expect(p.y).toBeLessThan(50);
  });
});

describe('cycle wheel frame', () => {
  it('leaves room above the top disc for its label and caption', () => {
    const stages = [
      { label: 'Evaporation from oceans and lakes', caption: 'Sun heats the surface water' },
      { label: 'Condensation' },
      { label: 'Precipitation' },
      { label: 'Collection' },
    ];
    const { cy, vbh } = frameFor(stages);
    const topText = cy - RING_R - CW_NODE_R - CW_LABEL_GAP - stageText(stages[0]).span - ASCENT;
    expect(topText).toBeGreaterThanOrEqual(0);
    expect(vbh).toBeGreaterThan(cy + RING_R + CW_NODE_R);
  });
});

describe('edge labels clear their own line', () => {
  it('synthesis conditions and yield never sit on a slanted arrow', () => {
    const s = { x: 0, y: 0 };
    const t = { x: 200, y: 120 };
    const c = { x: 100, y: 60 };
    const spots = edgeLabelSpots(s, c, t, 'NaBH4, MeOH', '92%');
    const overW = estimateTextWidth('NaBH4, MeOH', 15, true);
    const underW = estimateTextWidth('92%', 14, true);
    expect(segmentHitsBox(s, t, spots.over, overW, 15 * 1.2)).toBe(false);
    expect(segmentHitsBox(s, t, spots.under, underW, 14 * 1.2)).toBe(false);
  });

  it('a trie letter never sits on a straight-down edge', () => {
    const parent = { x: 50, y: 0 };
    const child = { x: 50, y: 60 };
    const at = edgeLabelAt(parent, child, 'w');
    expect(segmentHitsBox(parent, child, at, estimateTextWidth('w', 12, true), 12)).toBe(false);
  });
});

describe('food web', () => {
  it('trims each link to the discs, the head end short by the arrowhead', () => {
    const { s, t } = linkCurve({ x: 0, y: 200 }, { x: 0, y: 0 });
    expect(Math.hypot(s.x, s.y - 200)).toBeGreaterThanOrEqual(FW_NODE_R);
    expect(Math.hypot(t.x, t.y)).toBeGreaterThan(FW_NODE_R);
  });

  it('bows a link two tiers up round the organism standing between its ends', () => {
    const between = { x: 100, y: 150 };
    const { s, c, t } = linkCurve({ x: 100, y: 240 }, { x: 100, y: 60 }, [between]);
    let closest = Infinity;
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const x = (1 - u) ** 2 * s.x + 2 * u * (1 - u) * c.x + u ** 2 * t.x;
      const y = (1 - u) ** 2 * s.y + 2 * u * (1 - u) * c.y + u ** 2 * t.y;
      closest = Math.min(closest, Math.hypot(x - between.x, y - between.y));
    }
    expect(closest).toBeGreaterThan(FW_NODE_R + 6);
  });

  it('keeps the usual gentle bow when nothing is in the way', () => {
    expect(linkCurve({ x: 0, y: 200 }, { x: 0, y: 0 }, [{ x: 300, y: 100 }])).toEqual(
      linkCurve({ x: 0, y: 200 }, { x: 0, y: 0 }),
    );
  });

  it('moves a name off the arc that arrives under its disc', () => {
    const placed = [
      { id: 'fox', label: 'Red fox', tier: 1, cx: 100, cy: 60, slot: 140 },
      { id: 'vole', label: 'Field vole', tier: 0, cx: 100, cy: 220, slot: 140 },
    ];
    const curves = [linkCurve({ x: 100, y: 220 }, { x: 100, y: 60 })];
    const spots = placeOrganismLabels(placed, curves, { l: 0, r: 200, t: 0, b: 300 });
    const fox = spots.get('fox')!;
    expect(fox.lines.join(' ')).toBe('Red fox');
    expect(fox.box.b < 60 || fox.anchor !== 'middle').toBe(true);
  });
});

describe('plasmid labels', () => {
  it('ladder a crowded cloning site so no two labels on a side overlap', () => {
    const sites = ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NotI'].map((text, i) => ({
      key: text,
      deg: 30 + i * 2,
      text,
      color: 'var(--presence)',
    }));
    const ys = placeLabels(sites)
      .map((l) => l.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(5);
  });
});

describe('skill tree and plan connectors', () => {
  it('a prerequisite edge leaves one pill rim and lands on the next', () => {
    const pts = pathPoints(skillEdgePath({ x: 100, y: 40 }, { x: 220, y: 160 }, 120));
    expect(pts[0].y).toBeGreaterThan(40);
    expect(pts.at(-1)!.y).toBeLessThan(160);
  });

  it('an edge inside one tier arcs over the row instead of along it', () => {
    const pts = pathPoints(skillEdgePath({ x: 100, y: 80 }, { x: 300, y: 80 }, 120));
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(80);
  });

  it('a first-tier arc in a tall tree peaks inside the box', () => {
    // Five tiers at 620px: rowGap 93, so the first tier's pills top out at 27.5px.
    const [start, c1] = pathPoints(skillEdgePath({ x: 100, y: 46.5 }, { x: 300, y: 46.5 }, 93));
    // A symmetric cubic peaks at t = 0.5: a quarter of the way from its end to its control.
    expect(start.y / 4 + (3 * c1.y) / 4).toBeGreaterThanOrEqual(0);
    expect(c1.y).toBeLessThan(start.y);
  });

  it('a plan dependency stops short of the node it points at', () => {
    const pts = pathPoints(dagEdgePath({ x: 50, y: 100 }, { x: 250, y: 40 }, 40));
    expect(pts[0].x).toBe(90);
    expect(pts.at(-1)!.x).toBeLessThan(210);
  });
});

describe('chronological captions', () => {
  it('never overlap and stay on the axis, however the events cluster', () => {
    const xs = [10, 18, 24, 300, 560, 590];
    const slots = captionSlots(xs, 600, 150);
    slots.forEach((s, i) => {
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.left + s.width).toBeLessThanOrEqual(600);
      if (i > 0) expect(s.left).toBeGreaterThanOrEqual(slots[i - 1].left + slots[i - 1].width);
    });
  });

  it('read off the marker at the ends rather than from the card edge', () => {
    const [first, , last] = captionSlots([24, 300, 576], 600, 150);
    expect(first.align).toBe('start');
    expect(first.left).toBeGreaterThan(0);
    expect(last.align).toBe('end');
    expect(last.left + last.width).toBeLessThan(600);
  });

  it('stagger events on one date into rows instead of zero-width captions', () => {
    const xs = [100, 300, 300, 300, 500];
    const slots = captionSlots(xs, 640, 150, 40);
    for (const s of slots) expect(s.width).toBeGreaterThanOrEqual(40);
    expect(Math.max(...slots.map((s) => s.row))).toBeGreaterThan(0);
    // Within a row, captions still never overlap and stay on the axis.
    for (let r = 0; r < 3; r++) {
      const row = slots.filter((s) => s.row === r).sort((a, b) => a.left - b.left);
      row.forEach((s, i) => {
        expect(s.left).toBeGreaterThanOrEqual(0);
        expect(s.left + s.width).toBeLessThanOrEqual(640);
        if (i > 0) expect(s.left).toBeGreaterThanOrEqual(row[i - 1].left + row[i - 1].width);
      });
    }
  });

  it('keep one row when every caption already fits', () => {
    expect(captionSlots([24, 300, 576], 600, 150, 40).every((s) => s.row === 0)).toBe(true);
  });

  it('still give every marker a pressable caption past the row limit', () => {
    // Each row holds two events on one date (one reads left of it, one right); seven overflow.
    const slots = captionSlots(Array<number>(7).fill(300), 640, 150, 40);
    expect(slots.some((s) => s.width === 40)).toBe(true);
    for (const s of slots) {
      expect(s.width).toBeGreaterThanOrEqual(40);
      // A caption read off its marker sits within a dot's radius plus the air of it.
      expect(s.left).toBeLessThanOrEqual(300 + 10);
      expect(s.left + s.width).toBeGreaterThanOrEqual(300 - 10);
    }
  });

  it('drop an axis-end label that repeats the nearest date', () => {
    expect(repeatsDate('900 AD', '~900 AD')).toBe(true);
    expect(repeatsDate('Today', 'Day 1')).toBe(false);
    expect(repeatsDate(undefined, '1800s')).toBe(false);
  });
});

describe('roadmap grid', () => {
  it('pins each divider cell to its own quarter column', () => {
    const { container } = render(
      <Roadmap
        title="Plan"
        quarters={['Q1', 'Q2', 'Q3']}
        lanes={[{ name: 'Build', items: [{ label: 'API', startQ: 0, spanQ: 3 }] }]}
      />,
    );
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.fl-rm-cell'));
    expect(cells.map((c) => c.style.gridColumn)).toEqual(['1', '2', '3']);
  });
});

describe('flow fills that sit over a track', () => {
  const css = readFileSync('src/canvas/blocks/flows/styles.css', 'utf8');
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    return css.slice(at, css.indexOf('}', at));
  };

  it('mix over the surface, so the track never shows through', () => {
    for (const sel of [
      '.fl-rm-bar',
      '.fl-wz-node.is-done .fl-wz-bubble',
      '.fl-wz-node.is-active .fl-wz-bubble',
      '.fl-rm-bar.is-on',
    ]) {
      expect(rule(sel), sel).toMatch(/background:\s*color-mix\([^;]*var\(--surface-elevated\)\)/);
    }
  });

  it('keeps every journey row on one shared label column', () => {
    expect(rule('.fl-jm-row')).toMatch(/grid-template-columns:\s*subgrid/);
  });
});

describe('journey emotion dots', () => {
  it('centre each dot on its own stage column, for any stage count', () => {
    for (let n = 1; n <= 8; n++) {
      const pts = emotionPoints(Array.from({ length: n }, (_, i) => (i % 5) - 2));
      pts.forEach((p, i) => {
        const left = (i / n) * 100;
        const right = ((i + 1) / n) * 100;
        expect(p.x).toBeCloseTo((left + right) / 2, 6);
      });
    }
  });

  it('keeps an out-of-range or missing score inside the row', () => {
    const ys = emotionPoints([9, -9, Number.NaN]).map((p) => p.y);
    expect(ys).toEqual([10, 90, 50]);
  });

  it('places the rendered dots where the layout says', () => {
    const stages = ['Discover', 'Install', 'Migrate'].map((name, i) => ({
      name,
      action: `Step ${i + 1}`,
      emotion: i - 1,
      touchpoints: [],
    }));
    const { container } = render(<JourneyMap title="Journey" stages={stages} />);
    const lefts = Array.from(container.querySelectorAll<HTMLElement>('.fl-jm-emodot'), (d) =>
      parseFloat(d.style.left),
    );
    expect(lefts.map((x) => Math.round(x * 100) / 100)).toEqual([16.67, 50, 83.33]);
  });
});
