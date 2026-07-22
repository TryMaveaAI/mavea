import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CastMap } from '../src/canvas/blocks/diagrams/CastMap';
import type { CastMapLink, CastMapNode } from '../src/canvas/blocks/diagrams/types';

// CastMap rings a cast of characters and joins them with typed edges. The geometry is derived from
// the node count (radius + chip width scale so a handful and a dozen both stay legible), so these
// tests assert on the layout the component computes — every chip stays inside the padded viewBox at
// any count, dangling/self edges are dropped rather than crashing, and a long name wraps to fit its
// chip. jsdom has no SVG metrics, so we read the x/y ATTRIBUTES, not painted boxes.

const VIEW = 1000;

function nodes(n: number, faction = false): CastMapNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    name: `Character ${i}`,
    role: `Role ${i}`,
    ...(faction ? { faction: `Faction ${i % 3}` } : {}),
  }));
}
/** A ring of edges chaining n0→n1→…→n0, cycling through the relationship kinds. */
function chain(n: number): CastMapLink[] {
  const kinds: CastMapLink['kind'][] = ['ally', 'rival', 'family', 'love', 'mentor', 'betrays'];
  return Array.from({ length: n }, (_, i) => ({
    from: `n${i}`,
    to: `n${(i + 1) % n}`,
    kind: kinds[i % kinds.length],
    label: `tie ${i}`,
  }));
}

function chipRects(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect.cast-chip')).map((r) => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    w: Number(r.getAttribute('width')),
    h: Number(r.getAttribute('height')),
  }));
}

describe('CastMap', () => {
  it('renders one chip per valid node, carrying the name', () => {
    const { container } = render(<CastMap title="Cast" nodes={nodes(4)} links={chain(4)} />);
    expect(container.querySelectorAll('rect.cast-chip')).toHaveLength(4);
    const names = Array.from(container.querySelectorAll('text.cast-name title')).map(
      (t) => t.textContent,
    );
    expect(names).toContain('Character 0');
    expect(names).toContain('Character 3');
  });

  it.each([3, 6, 12])(
    'keeps every chip inside the padded viewBox at %i nodes (no NaN, no clipping)',
    (n) => {
      const { container } = render(<CastMap nodes={nodes(n, true)} links={chain(n)} />);
      const rects = chipRects(container);
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(VIEW);
        expect(r.y + r.h).toBeLessThanOrEqual(VIEW);
      }
      expect(container.querySelector('svg.cast-svg')!.getAttribute('viewBox')).not.toMatch(/NaN/);
    },
  );

  it('draws a connector per resolvable edge and drops a dangling one', () => {
    const links: CastMapLink[] = [
      { from: 'n0', to: 'n1', kind: 'ally' },
      { from: 'n0', to: 'ghost', kind: 'rival' }, // endpoint does not exist → dropped
    ];
    const { container } = render(<CastMap nodes={nodes(2)} links={links} />);
    expect(container.querySelectorAll('g.cast-edge path')).toHaveLength(1);
  });

  it('drops a self-loop (the ring cannot draw from a node to itself)', () => {
    const links: CastMapLink[] = [{ from: 'n0', to: 'n0', kind: 'ally' }];
    const { container } = render(<CastMap nodes={nodes(2)} links={links} />);
    expect(container.querySelectorAll('g.cast-edge path')).toHaveLength(0);
  });

  it('normalizes an unknown edge kind to the neutral tint without crashing', () => {
    const links = [{ from: 'n0', to: 'n1', kind: 'frenemy' as unknown as CastMapLink['kind'] }];
    const { container } = render(<CastMap nodes={nodes(2)} links={links} />);
    expect(container.querySelectorAll('g.cast-edge path')).toHaveLength(1);
    // 'Linked' is the legend label for the neutral 'other' bucket the unknown kind falls into.
    expect(container.textContent).toContain('Linked');
  });

  it('wraps a long name to fit its chip and preserves the full name in a title', () => {
    const long = 'Bartholomew Fitzgerald-Montgomery the Third';
    const { container } = render(
      <CastMap nodes={[{ id: 'a', name: long, role: 'Duke' }]} links={[]} />,
    );
    const tspans = Array.from(container.querySelectorAll('text.cast-name tspan'));
    expect(tspans.length).toBeGreaterThan(0);
    for (const t of tspans) expect((t.textContent ?? '').length).toBeLessThanOrEqual(15);
    expect(container.querySelector('text.cast-name title')?.textContent).toBe(long);
  });

  it('shows a legend for each used relationship kind and each faction', () => {
    const { container } = render(<CastMap nodes={nodes(3, true)} links={chain(3)} />);
    const legend = container.querySelector('.cast-legend')!;
    expect(legend).not.toBeNull();
    // chain(3) uses ally/rival/family; nodes(3,true) has Faction 0/1/2.
    expect(legend.textContent).toContain('Ally');
    expect(legend.textContent).toContain('Faction 0');
  });

  it('renders a stable empty state with no nodes (no SVG, no NaN geometry)', () => {
    const { container } = render(<CastMap title="Cast" nodes={[]} links={[]} />);
    expect(container.querySelector('svg.cast-svg')).toBeNull();
    expect(container.querySelector('.cast-empty')).not.toBeNull();
    expect(container.querySelector('.card')).not.toBeNull();
  });
});
