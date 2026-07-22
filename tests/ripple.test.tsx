// ripple.test.tsx — guards the Ripple feature's grounded spine: the seed model is internally
// consistent (every edge/blast id resolves to a real node — nothing dangling/invented), the radial
// layout frames every node, the status/risk vocabulary maps to tokens, and the overlay renders the
// hero example and navigates its sections without crashing.
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { layoutImpact, NODE_W, NODE_H } from '../src/live/ripple/layout';
import { statusVar, statusLabel, riskVar } from '../src/live/ripple/colors';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';
import type { NodeStatus, RiskLevel, ShipNode } from '../src/live/ripple/model';

afterEach(() => cleanup());

describe('Ripple seed model integrity', () => {
  const ids = new Set(SEED_SHIP.nodes.map((n) => n.id));

  it('has exactly one PR (centre) node', () => {
    expect(SEED_SHIP.nodes.filter((n) => n.type === 'pr')).toHaveLength(1);
  });

  it('every edge connects two real nodes', () => {
    for (const e of SEED_SHIP.edges) {
      expect(ids.has(e.from), `edge.from ${e.from}`).toBe(true);
      expect(ids.has(e.to), `edge.to ${e.to}`).toBe(true);
    }
  });

  it("every change's blast radius references real nodes (no invented targets)", () => {
    for (const c of SEED_SHIP.changes) {
      for (const id of c.blastRadius ?? []) {
        expect(ids.has(id), `change ${c.id} blast ${id}`).toBe(true);
      }
    }
  });

  it('the gate is internally consistent with its conditions', () => {
    // A blocked gate is never marked ship-safe, and "unacked P0" is a non-negative count.
    if (SEED_SHIP.gate.decision === 'block') expect(SEED_SHIP.gate.shipSafe).toBe(false);
    expect(SEED_SHIP.gate.unackedP0).toBeGreaterThanOrEqual(0);
  });

  it('is flagged as a worked example, not a live claim', () => {
    expect(SEED_SHIP.provenance.example).toBe(true);
  });
});

describe('layoutImpact', () => {
  it('places every node inside a frameable world, with the PR at the centre', () => {
    const l = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges);
    expect(l.nodes).toHaveLength(SEED_SHIP.nodes.length);
    expect(l.centerId).toBe('pr');
    // Every card sits within the world box (so the camera's fit never clips one).
    for (const p of l.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(l.w);
      expect(p.y).toBeLessThanOrEqual(l.h);
    }
    // The PR anchors the field — other nodes ring out around it.
    const center = l.nodes.find((p) => p.node.id === 'pr')!;
    const others = l.nodes.filter((p) => p.node.id !== 'pr');
    const avgX = others.reduce((s, p) => s + p.x, 0) / others.length;
    const avgY = others.reduce((s, p) => s + p.y, 0) / others.length;
    expect(Math.abs(center.x - avgX)).toBeLessThan(NODE_W);
    expect(Math.abs(center.y - avgY)).toBeLessThan(NODE_H * 2);
    expect(l.bbox.w).toBeGreaterThan(0);
    expect(l.bbox.h).toBeGreaterThan(0);
  });

  it('is deterministic (same input → same placement)', () => {
    const a = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges);
    const b = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges);
    expect(a.nodes.map((p) => [p.node.id, Math.round(p.x), Math.round(p.y)])).toEqual(
      b.nodes.map((p) => [p.node.id, Math.round(p.x), Math.round(p.y)]),
    );
  });

  it('never overlaps two cards, even with many same-scope nodes (a whole repo)', () => {
    // The old layout ringed by scope, so a repo's areas (all in-pr) piled onto one ring. This is the
    // regression guard: a centre + 16 same-scope areas must lay out with no two cards overlapping.
    const nodes: ShipNode[] = [
      { id: 'pr', label: 'repo', sub: 'THIS', type: 'pr', status: 'affected', scope: 'in-pr' },
    ];
    for (let i = 0; i < 16; i++) {
      nodes.push({
        id: `n${i}`,
        label: `area-${i}`,
        sub: '10 files',
        type: 'module',
        status: 'affected',
        scope: 'in-pr',
      });
    }
    const l = layoutImpact(nodes, []);
    expect(l.nodes).toHaveLength(nodes.length);
    for (let i = 0; i < l.nodes.length; i++) {
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i]!;
        const b = l.nodes[j]!;
        const overlaps = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
        expect(overlaps, `${a.node.id} overlaps ${b.node.id}`).toBe(false);
      }
    }
  });
});

describe('status / risk colour vocabulary', () => {
  const statuses: NodeStatus[] = ['breaks', 'migration', 'untested', 'affected', 'safe'];
  const risks: RiskLevel[] = ['safe', 'watch', 'breaks'];

  it('maps every node status to a token and a label', () => {
    for (const s of statuses) {
      expect(statusVar(s)).toMatch(/^var\(--/);
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
  it('maps every risk level to a token', () => {
    for (const r of risks) expect(riskVar(r)).toMatch(/^var\(--/);
  });
});

describe('RippleOverlay', () => {
  it('opens on the verdict hero and navigates to the deep sections', async () => {
    const { getByText, findByText, findAllByText, getByRole, getAllByRole, queryByText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );

    // Header + the honest example ribbon.
    expect(getByText('acme/auth-service')).toBeTruthy();
    expect(getByText(/Worked example/i)).toBeTruthy();
    // The verdict hero is the default — a glanceable verdict word…
    expect(getByText(/^(Hold|Review first|Clear to ship)$/)).toBeTruthy();
    // …and the living impact map is the centrepiece, so the centre node is on screen at once.
    expect(queryByText('auth-service')).toBeTruthy();

    // The gate appears in both the rail and a hero chip; click the first to reach the contract.
    fireEvent.click(getAllByRole('button', { name: /The gate/i })[0]!);
    expect(await findByText(/mavea\.gate/i)).toBeTruthy();

    // Mavéa's read is rail-only — navigating there shows the full prose.
    fireEvent.click(getByRole('button', { name: /Mavéa.s read/i }));
    expect(await findByText(/cuts access-token lifetime to 15 minutes/i)).toBeTruthy();

    // The workspace renders the first change's title (list + detail pane).
    fireEvent.click(getAllByRole('button', { name: /Workspace/i })[0]!);
    expect((await findAllByText(SEED_SHIP.changes[0]!.title)).length).toBeGreaterThan(0);
  });

  it('calls onClose when Escape is pressed', () => {
    let closed = false;
    render(<RippleOverlay model={SEED_SHIP} onClose={() => (closed = true)} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
