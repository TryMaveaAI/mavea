import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BinaryTree } from '../src/canvas/blocks/diagrams/BinaryTree';
import { CastMap } from '../src/canvas/blocks/diagrams/CastMap';
import { CausationChain } from '../src/canvas/blocks/diagrams/CausationChain';
import { CircuitDiagram } from '../src/canvas/blocks/diagrams/CircuitDiagram';
import { DataStructure } from '../src/canvas/blocks/diagrams/DataStructure';
import { DpTable } from '../src/canvas/blocks/diagrams/DpTable';
import { GraphTrace } from '../src/canvas/blocks/diagrams/GraphTrace';
import { HashTable } from '../src/canvas/blocks/diagrams/HashTable';
import { LogicGates } from '../src/canvas/blocks/diagrams/LogicGates';
import { ProbabilityTree } from '../src/canvas/blocks/diagrams/ProbabilityTree';
import { ProtocolStack } from '../src/canvas/blocks/diagrams/ProtocolStack';
import { SequenceDiagram } from '../src/canvas/blocks/diagrams/SequenceDiagram';
import { SortingViz } from '../src/canvas/blocks/diagrams/SortingViz';
import { Toulmin } from '../src/canvas/blocks/diagrams/Toulmin';
import { TournamentBracket } from '../src/canvas/blocks/diagrams/TournamentBracket';
import type {
  BinaryTreeNode,
  CastMapLink,
  CastMapNode,
  CausationLink,
  CircuitComponent,
  CircuitKind,
  CircuitWire,
  GraphTraceEdge,
  GraphTraceNode,
  LogicGate,
  LogicInput,
  ProbabilityBranch,
  ProtocolLayer,
  ProtocolPacketField,
  SortStep,
  TournamentMatchup,
} from '../src/canvas/blocks/diagrams/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: node-value labels were plain SVG text with no wrap or
// clip against the 32px-diameter node circle (NODE_R=16). Font-size only dropped from 11px to
// 9px for values over 2 characters, with no further scaling or truncation — a longer node value
// (e.g. a real BST key or a multi-digit number) rendered wider than its circle and visually
// collided with neighbouring nodes.
describe('BinaryTree', () => {
  const smallTree: BinaryTreeNode[] = [
    { id: 'a', value: 8, left: 'b', right: 'c' },
    { id: 'b', value: 3 },
    { id: 'c', value: 10 },
  ];

  function longValueTree(): BinaryTreeNode[] {
    return [
      { id: 'a', value: 'Warehouse', left: 'b', right: 'c' },
      { id: 'b', value: 'Distribution' },
      { id: 'c', value: 42 },
    ];
  }

  it('shrinks and truncates a node value too long for its circle instead of letting it overflow', () => {
    const { container } = render(<BinaryTree title="BST" nodes={longValueTree()} root="a" />);
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    expect(labels).toHaveLength(3);

    // Every rendered label's visible glyphs must fit a conservative character budget for the
    // 32px node circle — the old fixed 9px/11px switch let "Warehouse"/"Distribution" bleed
    // far wider than the node and collide with its siblings.
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }

    // Long values get a smaller font than the 2-char-or-fewer default (11px).
    const warehouse = labels.find((n) => visibleText(n).startsWith('Wareh'))!;
    expect(warehouse).toBeTruthy();
    expect(Number(warehouse.getAttribute('font-size'))).toBeLessThan(9);

    // The full value is preserved via a native <title> tooltip, so nothing is silently lost.
    const titles = Array.from(container.querySelectorAll('text.dg-bt-label title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Warehouse');
    expect(titles).toContain('Distribution');
  });

  it('leaves short node values untouched at full size with no tooltip', () => {
    const { container } = render(<BinaryTree title="BST" nodes={smallTree} root="a" />);
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    // Inorder traversal (left, self, right) places the left child before the root.
    expect(labels.map((n) => visibleText(n))).toEqual(['3', '8', '10']);
    for (const node of labels) {
      expect(Number(node.getAttribute('font-size'))).toBe(11);
    }
    expect(container.querySelector('text.dg-bt-label title')).toBeNull();
  });

  it('keeps every node circle within the tree viewBox at a larger node count', () => {
    // A wider/deeper tree than the two-level demo fixture, to catch layout regressions too.
    const nodes: BinaryTreeNode[] = [];
    const n = 15; // a full 4-level binary tree
    for (let i = 0; i < n; i++) {
      nodes.push({
        id: `n${i}`,
        value: `Item-${i}`,
        left: 2 * i + 1 < n ? `n${2 * i + 1}` : undefined,
        right: 2 * i + 2 < n ? `n${2 * i + 2}` : undefined,
      });
    }
    const { container } = render(<BinaryTree title="Heap" nodes={nodes} root="n0" />);
    const svg = container.querySelector('svg.dg-bt-svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const circles = Array.from(container.querySelectorAll('circle.dg-bt-node'));
    expect(circles).toHaveLength(n);
    for (const c of circles) {
      const g = c.closest('g')!;
      const [tx, ty] = g
        .getAttribute('transform')!
        .replace('translate(', '')
        .replace(')', '')
        .split(' ')
        .map(Number);
      const r = Number(c.getAttribute('r'));
      expect(tx - r).toBeGreaterThanOrEqual(0);
      expect(tx + r).toBeLessThanOrEqual(vbW);
      expect(ty - r).toBeGreaterThanOrEqual(0);
      expect(ty + r).toBeLessThanOrEqual(vbH);
    }

    // Long values in this bigger tree are still truncated to fit, never bleeding into siblings.
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    for (const label of labels) {
      expect(visibleText(label).length).toBeLessThanOrEqual(6);
    }
  });
});

// CastMap rings a cast of characters and joins them with typed edges. The geometry is derived from
// the node count (radius + chip width scale so a handful and a dozen both stay legible), so these
// tests assert on the layout the component computes — every chip stays inside the padded viewBox at
// any count, dangling/self edges are dropped rather than crashing, and a long name wraps to fit its
// chip. jsdom has no SVG metrics, so we read the x/y ATTRIBUTES, not painted boxes.
describe('CastMap', () => {
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

// Regression coverage for CausationChain's data-driven layout: column height, node placement,
// and connector anchors are all computed from the item count and card metrics rather than
// assumed from the ~5-cause/~4-consequence demo fixture. A layout that only worked for that
// fixture size would pack cards past the viewBox or collide once a side carried many more
// items than the demo, or would let a long node label bleed outside its fixed-width card.
describe('CausationChain', () => {
  function links(n: number, labelLen = 8): CausationLink[] {
    return Array.from({ length: n }, (_, i) => ({
      label: 'x'.repeat(labelLen) + ` factor ${i}`,
      weight: (i % 5) / 4,
      term: i % 2 === 0 ? ('short' as const) : ('long' as const),
    }));
  }

  /** Cause/consequence node cards, top-to-bottom, read off their <rect> geometry. */
  function nodeCards(container: HTMLElement) {
    return Array.from(container.querySelectorAll<SVGRectElement>('rect.cau-node'))
      .map((r) => ({
        x: Number(r.getAttribute('x')),
        y: Number(r.getAttribute('y')),
        w: Number(r.getAttribute('width')),
        h: Number(r.getAttribute('height')),
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y);
  }

  function viewBoxHeight(container: HTMLElement) {
    const svg = container.querySelector('svg.cau-svg')!;
    const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    return h;
  }

  it.each([4, 12, 24])(
    'stacks %i causes and consequences without overlap or overflowing the viewBox',
    (n) => {
      const { container } = render(
        <CausationChain
          title="Chain"
          event={{ label: 'Central event' }}
          causes={links(n)}
          consequences={links(n)}
        />,
      );
      const cards = nodeCards(container);
      expect(cards).toHaveLength(n * 2);
      const vbH = viewBoxHeight(container);

      // Group by column (shared x) and check no card starts before the previous one in that
      // column ends — that's the illegible-overlap failure mode a fixed-height column would hit
      // once item count outgrows the demo fixture's ~5 rows.
      const byX = new Map<number, typeof cards>();
      for (const c of cards) {
        const arr = byX.get(c.x) ?? [];
        arr.push(c);
        byX.set(c.x, arr);
      }
      expect(byX.size).toBe(2); // exactly the cause column and the consequence column
      for (const col of byX.values()) {
        for (let i = 1; i < col.length; i++) {
          expect(col[i].y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h);
        }
        // The whole column must stay within the (content-driven) viewBox height.
        const last = col[col.length - 1];
        expect(last.y + last.h).toBeLessThanOrEqual(vbH);
        expect(col[0].y).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it('wraps a long node label to fit the fixed card width instead of overflowing it', () => {
    const longLabel =
      'A very long causal factor description that is far wider than a single card line';
    const { container } = render(
      <CausationChain
        title="Chain"
        event={{ label: 'Event' }}
        causes={[{ label: longLabel, weight: 0.5 }]}
        consequences={[]}
      />,
    );
    const tspans = Array.from(container.querySelectorAll('text.cau-node-lbl tspan'));
    expect(tspans.length).toBeGreaterThan(0);
    // Each rendered line must be short enough to fit the card at the node font (mirrors the
    // component's own NODE_CHARS budget); no single tspan may carry the whole raw label.
    for (const t of tspans) {
      expect((t.textContent ?? '').length).toBeLessThanOrEqual(24);
    }
    // The untruncated label is preserved via a native <title> tooltip, same pattern as EtymTree.
    const title = container.querySelector('text.cau-node-lbl title');
    expect(title?.textContent).toBe(longLabel);
  });

  it('renders BlockEmpty-free but stable with empty causes/consequences (no NaN geometry)', () => {
    const { container } = render(
      <CausationChain title="Chain" event={{ label: 'Event' }} causes={[]} consequences={[]} />,
    );
    const svg = container.querySelector('svg.cau-svg')!;
    const viewBox = svg.getAttribute('viewBox') ?? '';
    expect(viewBox).not.toMatch(/NaN/);
    expect(container.querySelectorAll('rect.cau-node')).toHaveLength(0);
    // The central event card still renders at a sane, finite position.
    const eventRect = container.querySelector('rect.cau-event')!;
    expect(Number(eventRect.getAttribute('y'))).toBeGreaterThanOrEqual(0);
  });
});

// Regression coverage for a real bug: component labels sat at a fixed y=-8 offset regardless of
// glyph kind, so a taller glyph (ground's lead runs to y=-7, battery/bulb to y=-5) or a longer
// label than the small demo fixture used collided with the glyph itself or bled outside the
// SVG's fixed viewBox (`-10 -15 120 130`). Every rendered label must clear its own glyph and stay
// inside that viewBox regardless of label length or which kind it annotates.
describe('CircuitDiagram', () => {
  const VIEWBOX_MIN_Y = -15;

  const ALL_KINDS: CircuitKind[] = [
    'battery',
    'resistor',
    'capacitor',
    'bulb',
    'switch',
    'ground',
    'node',
  ];

  function circuit(labels: Partial<Record<CircuitKind, string>> = {}): {
    components: CircuitComponent[];
    wires: CircuitWire[];
  } {
    const components: CircuitComponent[] = ALL_KINDS.map((kind, i) => ({
      id: `c${i}`,
      kind,
      x: 10 + i * 14,
      y: 50,
      label: labels[kind] ?? `${kind} label`,
    }));
    const wires: CircuitWire[] = components.slice(1).map((c, i) => ({
      from: components[i].id,
      to: c.id,
    }));
    return { components, wires };
  }

  it('clears every glyph kind with a per-kind label offset instead of one fixed y', () => {
    const { container } = render(<CircuitDiagram title="Circuit" {...circuit()} />);
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    expect(labelNodes).toHaveLength(ALL_KINDS.length);

    // The old fixed y=-8 sat inside the tallest glyphs (ground's lead reaches y=-7, battery/bulb
    // reach y=-5): every label's y must clear its own glyph's top edge, and the offsets must not
    // all collapse to the same fixed value once more than one glyph kind is present.
    const ys = labelNodes.map((n) => Number(n.getAttribute('y')));
    expect(new Set(ys).size).toBeGreaterThan(1);
    // ground's own top edge is y=-7 (its lead runs highest of every glyph); a fixed y=-8 offset
    // only barely cleared it, so any per-kind offset shallower than that regresses the bug.
    const groundY = Number(labelNodes[ALL_KINDS.indexOf('ground')]?.getAttribute('y'));
    expect(groundY).toBeLessThanOrEqual(-8);
    for (const y of ys) {
      // Must stay inside the SVG's fixed viewBox, however tall the glyph.
      expect(y).toBeGreaterThanOrEqual(VIEWBOX_MIN_Y);
    }
  });

  it('truncates a label longer than the demo fixture instead of letting it overflow', () => {
    const longLabel = 'R₁ = 4.7 kilohm precision resistor';
    const { container } = render(
      <CircuitDiagram title="Circuit" {...circuit({ resistor: longLabel })} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    // Every rendered label's visible text must stay within a bounded character budget so it
    // can't collide with neighbouring glyphs once components are packed at ~14 units apart.
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    const truncated = labelNodes.find((n) => visibleText(n).endsWith('…'));
    expect(truncated).toBeTruthy();
    // The untruncated string is preserved via a native <title> tooltip, same idiom as EtymTree.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short label untouched with no tooltip', () => {
    const components: CircuitComponent[] = [
      { id: 'b1', kind: 'battery', x: 20, y: 50, label: '9V' },
    ];
    const { container } = render(
      <CircuitDiagram title="Circuit" components={components} wires={[]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    expect(labelNodes.map(visibleText)).toEqual(['9V']);
    expect(container.querySelectorAll('title')).toHaveLength(0);
  });
});

// Regression coverage for a real bug: tree-node and linked-list-cell values are plain SVG text
// with no wrap or clip, centred inside a fixed-size circle/cell — the demo fixtures only ever
// used 1-2 digit numbers, so a longer value (a name, a hash, a multi-digit id) rendered far
// wider than its shape and bled into neighbouring nodes. Every rendered value must fit.
describe('DataStructure', () => {
  it('truncates a long linked-list value instead of letting it overflow the cell', () => {
    const { container } = render(
      <DataStructure
        title="Linked list"
        kind="linkedlist"
        cells={['short', 'a-very-long-node-value-12345']}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes).toHaveLength(2);
    // "short" (5 chars) already exceeds the tiny value-cell budget and must truncate too —
    // only a value at or under the budget may pass through untouched.
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(3);
    }
    expect(visibleText(valNodes[1]).endsWith('…')).toBe(true);
    // The untruncated string survives as a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('a-very-long-node-value-12345');
  });

  it('leaves a demo-sized (2-digit) linked-list value untouched', () => {
    const { container } = render(<DataStructure title="List" kind="linkedlist" cells={[42, 7]} />);
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes.map((n) => visibleText(n))).toEqual(['42', '7']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('truncates a long tree-node value instead of letting it overflow the node circle', () => {
    const { container } = render(
      <DataStructure
        title="Tree"
        kind="tree"
        nodes={[
          { id: 'n0', value: 'root-alpha-long', left: 'n1' },
          { id: 'n1', value: 99 },
        ]}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes).toHaveLength(2);
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(3);
    }
    const longNode = valNodes.find((n) => visibleText(n).endsWith('…'));
    expect(longNode).toBeTruthy();
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('root-alpha-long');
  });

  it('leaves a demo-sized (2-digit) tree value untouched', () => {
    const { container } = render(<DataStructure title="Tree" kind="tree" level={[50, 25]} />);
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    // In-order placement draws the left child before the root, so DOM order tracks x-position,
    // not level order — compare as a set.
    expect(new Set(valNodes.map((n) => visibleText(n)))).toEqual(new Set(['50', '25']));
    expect(container.querySelector('title')).toBeNull();
  });
});

// Regression coverage for a real bug: DpTable renders row/col headers and cell values as
// plain SVG text with no wrap or clip, centred inside fixed-size boxes (HDR_W=48 / CELL=44).
// The demo fixture only ever uses single-character labels ("A", "ε") and small integers, but
// the model can hand back longer header labels ("knapsack[7]") or large memoized values
// ("987654"), which used to render wider than their box and bleed into neighbouring cells.
describe('DpTable', () => {
  it('truncates long row/column header labels instead of letting them overflow the cell', () => {
    const { container } = render(
      <DpTable
        rows={['subproblem-root', 'A']}
        cols={['knapsack-capacity', 'B']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const hdrNodes = Array.from(container.querySelectorAll('text.dp-hdr-val'));
    expect(hdrNodes).toHaveLength(4); // 2 col headers + 2 row headers
    for (const node of hdrNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    // The long header (row 0 and col 0) is truncated with an ellipsis…
    const truncated = hdrNodes.filter((n) => visibleText(n).endsWith('…'));
    expect(truncated.length).toBeGreaterThanOrEqual(2);
    // …but the full text is still available via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('subproblem-root');
    expect(titles).toContain('knapsack-capacity');
  });

  it('truncates a large memoized cell value instead of letting it overflow the cell', () => {
    const { container } = render(
      <DpTable
        rows={['A', 'B']}
        cols={['0', '1']}
        cells={[
          [0, 1],
          [1, 987654321],
        ]}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dp-val'));
    expect(valNodes).toHaveLength(4);
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(5);
    }
    const bigCell = valNodes.find((n) => visibleText(n).endsWith('…'));
    expect(bigCell).toBeTruthy();
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('987654321');
  });

  it('leaves short headers and values untouched, with no stray title tooltips', () => {
    const { container } = render(
      <DpTable
        rows={['ε', 'A']}
        cols={['ε', 'B']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const hdrNodes = Array.from(container.querySelectorAll('text.dp-hdr-val'));
    expect(hdrNodes.map((n) => visibleText(n))).toEqual(['ε', 'B', 'ε', 'A']);
    const valNodes = Array.from(container.querySelectorAll('text.dp-val'));
    expect(valNodes.map((n) => visibleText(n))).toEqual(['0', '0', '0', '1']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps every cell within the fixed viewBox bounds regardless of label length', () => {
    const { container } = render(
      <DpTable
        rows={['a-very-long-row-header-label', 'B']}
        cols={['a-very-long-column-header-label', 'C']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const svg = container.querySelector('svg.dp-svg');
    expect(svg).toBeTruthy();
    const viewBox = svg!.getAttribute('viewBox');
    expect(viewBox).toBeTruthy();
    const [, , vbW, vbH] = viewBox!.split(' ').map(Number);
    // The viewBox is sized purely from fixed cell/header constants (independent of label
    // length) — 2 cols/2 rows must still map to the same small, bounded box.
    expect(vbW).toBeLessThan(300);
    expect(vbH).toBeLessThan(200);
  });
});

// Regression coverage for a real bug: node labels were rendered as plain SVG text with no width
// constraint against the ~44px-diameter node circle (NODE_R=22) — a longer label than the demo's
// short single letters (e.g. a real node name) rendered wider than the circle and visually
// collided with neighbouring nodes/edges once the graph had more than a couple of nodes.
describe('GraphTrace', () => {
  function chain(
    n: number,
    longLabels: boolean,
  ): { nodes: GraphTraceNode[]; edges: GraphTraceEdge[] } {
    const nodes: GraphTraceNode[] = Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      label: longLabels ? `Node Alpha ${i}` : `${i}`,
    }));
    const edges: GraphTraceEdge[] = [];
    for (let i = 0; i < n - 1; i++) {
      edges.push({ from: `n${i}`, to: `n${i + 1}` });
    }
    return { nodes, edges };
  }

  it('truncates a node label too long for its circle instead of letting it overflow', () => {
    const { nodes, edges } = chain(6, true);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.gt-label'));
    expect(labels).toHaveLength(6);
    // Every rendered label's visible glyphs must fit the ~44px node circle at the class's
    // font-size (12px/700) — the old unconstrained render let "Node Alpha 0" bleed far wider.
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    // The full label is preserved via a native <title> tooltip, so nothing is silently lost.
    const titles = Array.from(container.querySelectorAll('text.gt-label title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Node Alpha 0');
  });

  it('leaves a short node label untouched and adds no tooltip', () => {
    const { nodes, edges } = chain(3, false);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.gt-label'));
    expect(labels.map((n) => visibleText(n))).toEqual(['0', '1', '2']);
    expect(container.querySelector('text.gt-label title')).toBeNull();
  });

  it('places all nodes within the fixed stage viewBox at a higher node count', () => {
    const { nodes, edges } = chain(12, true);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const svg = container.querySelector('svg.gt-svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const circles = Array.from(container.querySelectorAll('circle.gt-node'));
    expect(circles).toHaveLength(12);
    for (const c of circles) {
      const cx = Number(c.getAttribute('cx'));
      const cy = Number(c.getAttribute('cy'));
      const r = Number(c.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(vbW);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(vbH);
    }
  });
});

// Regression coverage: node text is centred in a fixed NODE_W box with no width constraint,
// so an entry like "14: Christopher" rendered far wider than the box and bled past it. Long
// labels must now shrink/compress to fit instead of overflowing.
describe('HashTable', () => {
  it('compresses a long entry label to fit the node box', () => {
    const { container } = render(
      <HashTable size={4} entries={[{ key: 14, value: 'Christopher' }]} />,
    );
    const text = container.querySelector('text.ht-node-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('14: Christopher');
    expect(text!.getAttribute('textLength')).toBeTruthy();
    expect(text!.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
  });

  it('leaves a short entry label unconstrained', () => {
    const { container } = render(<HashTable size={4} entries={[{ key: 1, value: 'a' }]} />);
    const text = container.querySelector('text.ht-node-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('1: a');
    expect(text!.getAttribute('textLength')).toBeNull();
  });
});

// Regression coverage for a real bug: the output pin label's x position (and the SVG viewBox
// width around it) was sized for a short label like "Y" — the demo fixture — with only a fixed
// 14-unit slack. A longer label (e.g. "CARRY_OUT", which the model is free to send) is drawn
// centred on that same pin, so half its rendered width extends past the reserved slack and
// bleeds past the viewBox's right edge, where the card's overflow:hidden clips it illegibly.
describe('LogicGates', () => {
  const inputs: LogicInput[] = [
    { id: 'a', label: 'A', value: 1 },
    { id: 'b', label: 'B', value: 0 },
  ];
  const gates: LogicGate[] = [{ id: 'g1', kind: 'AND', inputs: ['a', 'b'] }];

  function renderWithLabel(label: string) {
    return render(<LogicGates inputs={inputs} gates={gates} output={{ from: 'g1', label }} />);
  }

  it('keeps a short output label ("Y", the demo fixture) fully inside the viewBox', () => {
    const { container } = renderWithLabel('Y');
    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const pin = container.querySelector('text.dg-lg-pin')!;
    const x = Number(pin.getAttribute('x'));
    // .dg-lg-pin is centre-anchored — half its rendered width extends past x on either side.
    const halfW = (pin.textContent!.length * 3.1) / 2;
    expect(x + halfW).toBeLessThanOrEqual(viewW);
    expect(x - halfW).toBeGreaterThanOrEqual(0);
  });

  it('reserves enough right-margin for a long output label so it stays inside the viewBox', () => {
    const { container } = renderWithLabel('CARRY_OUT');
    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const pin = container.querySelector('text.dg-lg-pin')!;
    const x = Number(pin.getAttribute('x'));
    const halfW = (pin.textContent!.length * 3.1) / 2;
    // The full label (or its truncated form) must never bleed past the right edge of the
    // viewBox — that's the clip the fixed 14-unit slack couldn't prevent.
    expect(x + halfW).toBeLessThanOrEqual(viewW);
    expect(x - halfW).toBeGreaterThanOrEqual(0);
  });

  it('truncates a pathological output label instead of blowing up the layout', () => {
    const longLabel = 'REGISTER_WRITE_ENABLE_SIGNAL';
    const { container } = renderWithLabel(longLabel);
    const pin = container.querySelector('text.dg-lg-pin')!;
    // The rendered glyph content is capped — the full string is not dumped onto the pin.
    expect(pin.textContent!.length).toBeLessThan(longLabel.length);
    expect(pin.textContent!.endsWith('…')).toBe(true);

    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const x = Number(pin.getAttribute('x'));
    const halfW = (pin.textContent!.length * 3.1) / 2;
    expect(x + halfW).toBeLessThanOrEqual(viewW);
  });
});

// Regression coverage for a real bug: the right-edge outcome label was left-anchored
// (`textAnchor="start"`, the SVG default) at a fixed x near the viewBox's right edge, so any
// outcome text wider than the small sliver of remaining room — a caller-supplied `outcome`
// string, or a computed probability with several decimal places — grew rightward and ran past
// the SVG viewBox instead of staying inside the card.
describe('ProbabilityTree', () => {
  const VB_W = 560; // must track ProbabilityTree.tsx's VB_W — the SVG is a fixed viewBox.

  function branches(outcome?: string): ProbabilityBranch[] {
    return [
      {
        label: 'Draw',
        prob: 0.123456789,
        children: [{ label: 'Ace', prob: 0.076923077, outcome }],
      },
    ];
  }

  it('right-anchors the outcome label at the viewBox edge instead of overflowing rightward', () => {
    const { container } = render(
      <ProbabilityTree title="Odds" branches={branches('P = 0.00949317406...')} />,
    );
    const outcomeLabels = Array.from(container.querySelectorAll('text.dg-pt-outcome-lbl'));
    expect(outcomeLabels.length).toBeGreaterThan(0);

    for (const label of outcomeLabels) {
      // Right-anchored text grows leftward from its x, so its x must sit at (or inside) the
      // viewBox's right edge — the old start-anchored label instead grew rightward from x,
      // which is exactly how long text ran past VB_W.
      expect(label.getAttribute('text-anchor')).toBe('end');
      expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(VB_W);
    }
  });

  it('keeps a long computed probability outcome (many decimal places) inside the viewBox', () => {
    // No supplied `outcome` — falls through to the computed `P = parent × child` label, whose
    // formatting is bounded, but still sits at the same right-anchored x as any custom string.
    const { container } = render(<ProbabilityTree title="Odds" branches={branches()} />);
    const svg = container.querySelector('svg.dg-pt-svg')!;
    const [, , vbWidth] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const label = container.querySelector('text.dg-pt-outcome-lbl')!;
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(vbWidth);
    expect(label.textContent).toMatch(/^P = /);
  });

  it('matches the outcome column header to the same right-anchored edge', () => {
    const { container } = render(<ProbabilityTree title="Odds" branches={branches()} />);
    const header = Array.from(container.querySelectorAll('text.dg-pt-col-hdr')).find(
      (n) => n.textContent === 'Outcome',
    )!;
    expect(header).toBeTruthy();
    expect(header.getAttribute('text-anchor')).toBe('end');

    const outcomeLabel = container.querySelector('text.dg-pt-outcome-lbl')!;
    expect(header.getAttribute('x')).toBe(outcomeLabel.getAttribute('x'));
  });
});

// Regression coverage for a real bug: each nested encapsulation box shrinks with depth, but its
// label keeps a fixed font-size (.pst-box-lbl / .pst-box-lbl--inner) — so a header name longer
// than the demo fixture's short ones ("Ethernet", "IP", "TCP"…) overflowed the box at the
// innermost, most cramped depths, exactly where there is the least room to spare.
describe('ProtocolStack', () => {
  const LAYERS: ProtocolLayer[] = [{ name: 'Application' }, { name: 'Transport' }];

  function longPacket(n: number): ProtocolPacketField[] {
    // Every header is long — including the innermost "payload" — so the tightest budget (the
    // last, smallest box) is exercised the same as every other depth.
    return Array.from({ length: n }, (_, i) => ({
      header: `Extremely Long Header Name ${i}`,
    }));
  }

  it.each([2, 3, 5, 8])(
    'truncates every encapsulation label to fit its box at %i nested headers',
    (n) => {
      const { container } = render(
        <ProtocolStack title="Stack" layers={LAYERS} packet={longPacket(n)} />,
      );
      const boxes = Array.from(container.querySelectorAll<SVGGElement>('.pst-box'));
      expect(boxes).toHaveLength(n);

      boxes.forEach((box, i) => {
        const rect = box.querySelector('rect')!;
        const size = Number(rect.getAttribute('width'));
        const label = box.querySelector('text.pst-box-lbl')!;
        const inner = box.classList.contains('pst-box--inner');
        const fontSize = inner ? 5 : 4.2;
        // Same budget formula the component uses: no rendered label may be wide enough (at its
        // class's font-size) to plausibly overflow its own box width.
        const maxChars = Math.max(2, Math.floor((size * 0.92) / (fontSize * 0.62)));
        const text = visibleText(label);
        expect(text.length).toBeLessThanOrEqual(maxChars);
        // The full header always survives the truncation, either verbatim or via a tooltip.
        const original = longPacket(n)[i].header;
        if (text !== original) {
          expect(text.endsWith('…')).toBe(true);
          const title = label.querySelector('title');
          expect(title?.textContent).toBe(original);
        }
      });
    },
  );

  it('leaves short headers untouched and adds no tooltip', () => {
    const { container } = render(
      <ProtocolStack
        title="Stack"
        layers={LAYERS}
        packet={[{ header: 'IP' }, { header: 'TCP' }, { header: 'Data' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.pst-box-lbl'));
    expect(labels.map((l) => visibleText(l))).toEqual(['IP', 'TCP', 'Data']);
    expect(container.querySelector('.pst-encaps title')).toBeNull();
  });

  it('truncates the innermost payload label even when only the payload name is long', () => {
    // The exact shape from the shipped demo fixture: short header chain, but the innermost
    // "payload" field carries a longer, human-readable label ("Your request").
    const { container } = render(
      <ProtocolStack
        title="Stack"
        layers={LAYERS}
        packet={[
          { header: 'Ethernet' },
          { header: 'IP' },
          { header: 'TCP' },
          { header: 'HTTP' },
          { header: 'Your request' },
        ]}
      />,
    );
    const inner = container.querySelector('.pst-box--inner rect')!;
    const size = Number(inner.getAttribute('width'));
    const label = container.querySelector('.pst-box--inner text.pst-box-lbl')!;
    const maxChars = Math.max(2, Math.floor((size * 0.92) / (5 * 0.62)));
    const text = visibleText(label);
    expect(text.length).toBeLessThanOrEqual(maxChars);
    expect(text.length).toBeLessThan('Your request'.length);
    expect(label.querySelector('title')?.textContent).toBe('Your request');
  });
});

// Regression coverage: actor name boxes and message labels are plain SVG text with no wrap
// or clip, so a name/label longer than the demo fixture bled past its box or collided with
// the neighbouring lane. Both must now truncate to fit, with the full text as a <title>.
describe('SequenceDiagram', () => {
  it('truncates a long actor name instead of overflowing its box', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'Database Administrator' },
          { id: 'b', label: 'API' },
        ]}
        messages={[{ from: 'a', to: 'b', label: 'Request' }]}
      />,
    );
    const actorNodes = Array.from(container.querySelectorAll('text.dg-seq-actor'));
    expect(actorNodes).toHaveLength(2);
    const long = actorNodes.find((n) => n.textContent?.includes('…'));
    expect(long).toBeTruthy();
    expect(long!.querySelector('title')?.textContent).toBe('Database Administrator');
  });

  it('truncates a message label to fit the gap between adjacent lanes', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        messages={[
          {
            from: 'a',
            to: 'b',
            label: 'Acknowledge receipt and signature verification response',
          },
        ]}
      />,
    );
    const lbl = container.querySelector('text.dg-seq-lbl');
    expect(lbl).toBeTruthy();
    expect(lbl!.querySelector('title')?.textContent).toBe(
      'Acknowledge receipt and signature verification response',
    );
    // The visible text (excluding the tooltip's text node) must be short enough to fit
    // between two adjacent lanes, not the full 57-character sentence.
    const visible = Array.from(lbl!.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('');
    expect(visible.length).toBeLessThan(20);
  });

  it('leaves short labels untouched', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        messages={[{ from: 'a', to: 'b', label: 'ping' }]}
      />,
    );
    expect(container.querySelector('title')).toBeNull();
    expect(container.querySelector('text.dg-seq-lbl')?.textContent).toBe('ping');
  });
});

// Regression coverage for a real bug: the per-bar value label (.dg-sv-val) rendered with
// `white-space: nowrap` and no width constraint, so a multi-digit value (e.g. a negative
// number or anything wider than its narrow flex column) painted past its bar's boundary and
// overlapped the neighboring bar instead of clipping to the space it was actually given.
describe('SortingViz', () => {
  function stepFor(values: number[]): SortStep {
    return { caption: 'step', values };
  }

  it('constrains a multi-digit value label to its bar column instead of letting it overflow', () => {
    // 16 bars is the max count the label still renders for (displayValues.length <= 16), so
    // each bar-wrap gets a thin equal share of the row — exactly where a wide multi-digit
    // number used to bleed into its neighbor.
    const values = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? -1234 - i : 9876 + i));
    const { container } = render(
      <SortingViz algorithm="Bubble Sort" values={values} steps={[stepFor(values)]} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.dg-sv-val'));
    expect(labels).toHaveLength(16);
    for (const label of labels) {
      // Every label must clip to the width its flex column actually has, not spill past it.
      expect(label.style.maxWidth).toBe('100%');
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.textOverflow).toBe('ellipsis');
    }
  });

  it('still shows the full value for a short, small array (no truncation needed)', () => {
    const values = [3, 1, 4, 5];
    const { container, getByText } = render(
      <SortingViz algorithm="Bubble Sort" values={values} steps={[stepFor(values)]} />,
    );
    const labels = Array.from(container.querySelectorAll('.dg-sv-val'));
    expect(labels).toHaveLength(4);
    for (const v of values) {
      expect(getByText(String(v))).toBeInTheDocument();
    }
  });

  it('suppresses value labels entirely once the array is too dense to label legibly', () => {
    const values = Array.from({ length: 20 }, (_, i) => i);
    const { container } = render(
      <SortingViz algorithm="Merge Sort" values={values} steps={[stepFor(values)]} />,
    );
    expect(container.querySelectorAll('.dg-sv-val')).toHaveLength(0);
    // The bars themselves still render one per value and stay within the fixed-height,
    // overflow-hidden chart track — only the labels are dropped, not the bars.
    const bars = container.querySelectorAll('.dg-sv-bar');
    expect(bars).toHaveLength(20);
  });
});

// Toulmin lays the six argument roles along their logical flow. These tests lock the contract the
// Live path depends on: the required roles always draw, the OPTIONAL roles (backing/qualifier/
// rebuttal) appear only when supplied (never as empty cards), an absent title is tolerated, and a
// long field is kept as a single wrapping text node rather than being split or truncated — the
// card grows, it never overflows.
describe('Toulmin', () => {
  const FULL = {
    title: 'Toulmin Analysis',
    claim: 'Harry is a British citizen.',
    grounds: 'Harry was born in Bermuda.',
    warrant: 'A person born in Bermuda is generally a British citizen.',
    backing: 'On account of the British Nationality Acts.',
    qualifier: 'presumably',
    rebuttal: 'his parents were foreign nationals.',
  };

  const roleTexts = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('.toul-role-text')).map((n) => n.textContent);

  it('renders a card for every role when all six are present', () => {
    const { container } = render(<Toulmin {...FULL} />);
    const roles = container.querySelectorAll('.toul-role');
    expect(roles).toHaveLength(5); // grounds, warrant, backing, claim, rebuttal (qualifier is a chip)
    const texts = roleTexts(container).join(' | ');
    expect(texts).toContain('born in Bermuda');
    expect(texts).toContain('British citizen');
    // The qualifier rides the "so" bridge, not a role card.
    expect(container.querySelector('.toul-qual')?.textContent).toBe('presumably');
  });

  it('omits the optional roles when they are absent (no empty cards)', () => {
    const { container } = render(
      <Toulmin claim="C" grounds="G" warrant="W" />, // only the three required
    );
    expect(container.querySelectorAll('.toul-role')).toHaveLength(3);
    expect(container.querySelector('.toul-role--backing')).toBeNull();
    expect(container.querySelector('.toul-role--rebuttal')).toBeNull();
    expect(container.querySelector('.toul-qual')).toBeNull();
    // The "so" bridge still renders as the connective between grounds and claim.
    expect(container.querySelector('.toul-so')).not.toBeNull();
  });

  it('tolerates a missing title and empty/degenerate fields without crashing', () => {
    const { container } = render(<Toulmin claim="" grounds="" warrant="" />);
    expect(container.querySelector('.card-eyebrow')).toBeNull(); // title optional → no eyebrow
    expect(container.querySelectorAll('.toul-role')).toHaveLength(0); // nothing falsy renders a card
    expect(container.querySelector('.card')).not.toBeNull(); // shell still mounts
  });

  it('keeps a long field as one wrapping text node rather than splitting or truncating it', () => {
    const long =
      'A person born in Bermuda is generally a British citizen because the relevant nationality statutes have historically conferred citizenship by place of birth within British territory.';
    const { container } = render(<Toulmin {...FULL} warrant={long} />);
    const warrant = container.querySelector('.toul-role--warrant .toul-role-text');
    expect(warrant?.textContent).toBe(long); // verbatim, no ellipsis
    expect(warrant).not.toBeNull();
  });
});

describe('TournamentBracket', () => {
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
