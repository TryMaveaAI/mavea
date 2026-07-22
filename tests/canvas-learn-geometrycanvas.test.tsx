import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GeometryCanvas } from '../src/canvas/blocks/learn/GeometryCanvas';
import type { GeoPoint, GeoVector } from '../src/canvas/blocks/learn/types';

// Regression coverage for two real bugs: point labels used a fixed 3px pixel offset that
// assumed short single-character labels ("A", "B") — long labels or a cluster of 10+ points
// overlapped illegibly. Vector labels used a fixed 10px perpendicular offset from the midpoint,
// which collided once vectors clustered or a label was wider than the vector was long.

/** Axis-aligned box a <text> node's visible glyphs occupy, from its own attributes (no DOM
    text metrics in jsdom) — mirrors the same per-char estimate the component itself uses. */
function textBox(el: SVGTextElement) {
  const x = Number(el.getAttribute('x'));
  const y = Number(el.getAttribute('y'));
  const fontSize = 9; // .lr-gc-pt-lbl / .lr-gc-vec-lbl font-size
  const charW = fontSize * 0.62;
  const w = (el.textContent ?? '').length * charW;
  const h = fontSize * 1.15;
  const anchor = el.getAttribute('text-anchor') ?? 'start';
  const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { left, right: left + w, top: y - h / 2, bottom: y + h / 2 };
}

function overlaps(a: ReturnType<typeof textBox>, b: ReturnType<typeof textBox>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function manyPoints(n: number, longLabels: boolean): GeoPoint[] {
  // Cram points close together (a tight cluster within a couple of data units) so the demo
  // fixture's generous spacing can't hide the bug — this is the "10+ points" failure case.
  return Array.from({ length: n }, (_, i) => ({
    x: (i % 5) * 0.6,
    y: Math.floor(i / 5) * 0.6,
    label: longLabels ? `Vertex ${i} (measured)` : String.fromCharCode(65 + (i % 26)),
  }));
}

describe('GeometryCanvas point labels', () => {
  it('spaces out labels for a dense cluster of points with no overlap', () => {
    const points = manyPoints(12, false);
    const { container } = render(<GeometryCanvas title="Cluster" points={points} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels).toHaveLength(12);
    const boxes = labels.map(textBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('gives long labels enough clearance from their own point (not the old fixed 3px)', () => {
    const points = manyPoints(6, true);
    const { container } = render(<GeometryCanvas title="Long labels" points={points} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels).toHaveLength(6);
    const boxes = labels.map(textBox);
    // No two long labels may collide even though they sit on a tight grid.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('stays within the fixed SVG viewBox regardless of label count', () => {
    const points = manyPoints(20, true);
    const { container } = render(<GeometryCanvas title="Many" points={points} />);
    // The card-eyebrow icon is also an <svg> — select the plot itself, not the icon.
    const svg = container.querySelector('svg.lr-gc-svg')!;
    const [, , vbW, vbH] = (svg.getAttribute('viewBox') ?? '0 0 320 256').split(' ').map(Number);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-pt-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    // The clipPath only bounds the plotted geometry, not point labels (they intentionally sit
    // just outside dots near the plot edge) — but they must still land within the drawable
    // frame, not fly off into arbitrary territory the card can't show.
    for (const box of labels.map(textBox)) {
      expect(box.left).toBeGreaterThan(-40);
      expect(box.right).toBeLessThan(vbW + 40);
      expect(box.top).toBeGreaterThan(-40);
      expect(box.bottom).toBeLessThan(vbH + 40);
    }
  });
});

describe('GeometryCanvas vector labels', () => {
  it('clears each label off its own short shaft on a cluster of radiating vectors', () => {
    // Six short vectors radiating from nearly the same origin with longer-than-single-char
    // labels — the old fixed 10px push couldn't clear a wide label off a short shaft, so the
    // label's box straddled its own line (and, once several radiate from one point, each
    // other). Each label's box must clear its own vector's midpoint by at least half its width.
    const vectors: GeoVector[] = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return {
        x: 0,
        y: 0,
        dx: Math.cos(angle) * 0.8,
        dy: Math.sin(angle) * 0.8,
        label: `Force ${i}`,
      };
    });
    const { container } = render(<GeometryCanvas title="Forces" vectors={vectors} />);
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.lr-gc-vec-lbl'));
    const lines = Array.from(container.querySelectorAll<SVGLineElement>('line.lr-gc-vec'));
    expect(labels).toHaveLength(6);
    expect(lines).toHaveLength(6);
    for (let i = 0; i < labels.length; i++) {
      const x = Number(labels[i].getAttribute('x'));
      const y = Number(labels[i].getAttribute('y'));
      const w = (labels[i].textContent ?? '').length * (9 * 0.62);
      const x1 = Number(lines[i].getAttribute('x1'));
      const y1 = Number(lines[i].getAttribute('y1'));
      const x2 = Number(lines[i].getAttribute('x2'));
      const y2 = Number(lines[i].getAttribute('y2'));
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const distFromMid = Math.hypot(x - midX, y - midY);
      expect(distFromMid).toBeGreaterThan(w / 2);
    }
  });

  it('scales the perpendicular offset past the old fixed 10px for a long label', () => {
    // Same short vector, geometrically identical to what the old fixed-10px placement handled —
    // only the label length changes, so any offset growth is attributable to the fix.
    const vectors: GeoVector[] = [{ x: 0, y: 0, dx: 0.15, dy: 0.05, label: 'Displacement vector' }];
    const { container } = render(<GeometryCanvas title="Short vector" vectors={vectors} />);
    const label = container.querySelector<SVGTextElement>('text.lr-gc-vec-lbl');
    expect(label).toBeTruthy();
    const x = Number(label!.getAttribute('x'));
    const y = Number(label!.getAttribute('y'));
    const line = container.querySelector<SVGLineElement>('line.lr-gc-vec')!;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpOffset = Math.hypot(x - midX, y - midY);
    // The old code placed every vector label exactly 10px from the midpoint regardless of
    // label length; a label this long must now push out well beyond that fixed distance.
    expect(perpOffset).toBeGreaterThan(15);
  });

  it('does not grow the offset for a short label on a normal-length vector (no regression)', () => {
    const vectors: GeoVector[] = [{ x: 0, y: 0, dx: 2, dy: 1, label: 'v' }];
    const { container } = render(<GeometryCanvas title="Normal vector" vectors={vectors} />);
    const label = container.querySelector<SVGTextElement>('text.lr-gc-vec-lbl');
    const line = container.querySelector<SVGLineElement>('line.lr-gc-vec')!;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const x = Number(label!.getAttribute('x'));
    const y = Number(label!.getAttribute('y'));
    const perpOffset = Math.hypot(x - midX, y - midY);
    // Stays near the historical 10px floor — a one-character label shouldn't trigger the
    // width-driven growth that long labels need.
    expect(perpOffset).toBeGreaterThanOrEqual(10);
    expect(perpOffset).toBeLessThan(13);
  });
});
