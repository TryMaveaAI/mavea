import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SysArchDiagram } from '../src/canvas/blocks/diagrams/SysArchDiagram';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import {
  captionAt,
  fitCaption,
  route,
  stackText,
  type Footprint,
} from '../src/canvas/blocks/diagrams/whiteboard';
import { estimateTextWidth } from '../src/canvas/lib/fitText';

const box = (x: number, y: number, over: Partial<Footprint> = {}): Footprint => ({
  x,
  y,
  halfW: 75,
  halfH: 35,
  textHalfW: 90,
  textBottom: 83,
  ...over,
});

const inside = (f: Footprint, p: { x: number; y: number }) =>
  Math.abs(p.x - f.x) < f.halfW && Math.abs(p.y - f.y) < f.halfH;

describe('whiteboard connections', () => {
  it('styles the edge element itself, so the line actually paints', () => {
    // The rule once read `.sa-edge line` while the class sat ON the <line>: every connector
    // rendered with no stroke, leaving loose arrowheads and captions floating in the air.
    const css = readFileSync('src/canvas/blocks/diagrams/styles.css', 'utf8');
    expect(css).toMatch(/\.sa-edge\s*\{[^}]*stroke:/);
    const { container } = render(
      <SysArchDiagram
        title="t"
        nodes={[
          { id: 'a', label: 'Client', kind: 'client' },
          { id: 'b', label: 'API', kind: 'service' },
        ]}
        edges={[{ from: 'a', to: 'b' }]}
      />,
    );
    expect(container.querySelectorAll('line.sa-edge')).toHaveLength(1);
  });

  it('leaves and meets each shape at its rim, not inside it or out in the air', () => {
    const a = box(100, 100);
    const b = box(400, 100);
    const { s, t } = route(a, b);
    expect(inside(a, s)).toBe(false);
    expect(inside(b, t)).toBe(false);
    // within a few units of each rim
    expect(s.x - (a.x + a.halfW)).toBeLessThan(10);
    expect(b.x - b.halfW - t.x).toBeLessThan(10);
  });

  it('runs a downward edge out under the label stack rather than through it', () => {
    const a = box(100, 100);
    const b = box(100, 400);
    const { s } = route(a, b);
    expect(s.y).toBeGreaterThan(a.y + a.textBottom);
  });

  it('meets a diamond on its slanted side', () => {
    const a = box(100, 100);
    const b = box(300, 300, { halfW: 40, halfH: 40, diamond: true });
    const { t } = route(a, b);
    const d = Math.abs(t.x - b.x) / b.halfW + Math.abs(t.y - b.y) / b.halfH;
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(1.4);
  });

  it('never crosses its own trims on a packed layout', () => {
    const { s, t } = route(box(100, 100), box(160, 100));
    expect(t.x).toBeGreaterThan(s.x);
  });

  it('sets a caption clear of the line it labels, at any angle', () => {
    for (const [dx, dy] of [
      [300, 0],
      [300, 120],
      [300, -120],
      [80, 300],
    ]) {
      const s = { x: 0, y: 0 };
      const t = { x: dx, y: dy };
      const fit = fitCaption('cache-aside · TCP:5432', Math.hypot(dx, dy));
      const { x, y0 } = captionAt(s, t, fit);
      const w = Math.max(...fit.lines.map((l) => estimateTextWidth(l, fit.fontSize, true)));
      const top = y0 - fit.lineHeight / 2;
      const h = fit.lines.length * fit.lineHeight;
      // Sample the segment; no point of it may fall inside the caption's box.
      for (let k = 0; k <= 40; k++) {
        const px = (dx * k) / 40;
        const py = (dy * k) / 40;
        const hit = Math.abs(px - x) < w / 2 && py > top && py < top + h;
        expect(hit, `segment (${dx},${dy}) passes through its caption`).toBe(false);
      }
    }
  });
});

describe('whiteboard node text', () => {
  it('keeps a sub whole when the column has room for it', () => {
    const t = stackText('Dedup & Clean', 'drop dupes, strip PII', 229, 35);
    expect(t.sub).toEqual(['drop dupes, strip PII']);
    expect(t.clipped).toBe(false);
  });

  it('wraps a long sub to a second line before it cuts anything', () => {
    const t = stackText('Join', 'label-queue export joined against the warehouse', 200, 35);
    expect(t.sub.length).toBe(2);
    expect(t.sub.join(' ')).toContain('label-queue export');
  });

  it('renders the full sub in DataPipeline', () => {
    const { container } = render(
      <DataPipeline
        title="t"
        stages={[
          { id: 'a', label: 'Events', kind: 'source' },
          { id: 'b', label: 'Dedup & Clean', kind: 'transform', sub: 'drop dupes, strip PII' },
        ]}
        edges={[{ from: 'a', to: 'b', label: 'nightly batch' }]}
      />,
    );
    expect(container.querySelector('text.dp-sub')?.textContent).toBe('drop dupes, strip PII');
  });
});
