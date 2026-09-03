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
import { ShipGate } from '../src/live/ripple/sections/ShipGate';
import { ShipWorkspace } from '../src/live/ripple/sections/ShipWorkspace';
import { ShipRead } from '../src/live/ripple/sections/ShipRead';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
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
    // A plain open, with no layer on top: the overlay itself is the topmost thing Escape can dismiss.
    // (Clearing the "seen the worked example" flag keeps the intake from auto-opening over it, which
    // is what an earlier render in this file leaves behind.)
    localStorage.clear();
    let closed = false;
    render(<RippleOverlay model={SEED_SHIP} onClose={() => (closed = true)} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('Escape backs out of the intake first, leaving the overlay open', () => {
    localStorage.clear();
    let closed = false;
    const { getByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => (closed = true)} />,
    );
    fireEvent.click(getByText(/Run on your own code/i));
    expect(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByPlaceholderText(/github\.com\/owner\/repo\/pull/i)).toBeNull();
    expect(closed).toBe(false);

    // The overlay is topmost again, so a second Escape does close it.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  // The backdrop is a large live target around a surface whose primary gestures are selecting a
  // file path, a SQL line or a diff line. A drag released past the panel's edge fires its click on
  // the common ancestor — the scrim — and closing there discards the whole analysis.
  it('closes on a backdrop click, but not on a gesture that merely ended there', () => {
    localStorage.clear();
    let closed = 0;
    const { container } = render(<RippleOverlay model={SEED_SHIP} onClose={() => (closed += 1)} />);
    const scrim = container.querySelector('.ripple-scrim')!;
    const panel = container.querySelector('.ripple-panel')!;

    // Began on the panel, released on the backdrop — the reader was selecting, not dismissing.
    fireEvent.pointerDown(panel);
    fireEvent.click(scrim);
    expect(closed).toBe(0);

    // Began and ended on the backdrop — a real dismissal.
    fireEvent.pointerDown(scrim);
    fireEvent.click(scrim);
    expect(closed).toBe(1);
  });

  // The intake renders inside the panel's own focus trap, so without one of its own the keyboard
  // stayed outside it — 36 stops through the rail, the map and the verdict chips, every one of them
  // behind the intake's scrim, before reaching the field the dialog exists to fill.
  it('moves focus into the intake dialog when it opens', () => {
    localStorage.clear();
    const { getByText, getByPlaceholderText, container } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );
    fireEvent.click(getByText(/Run on your own code/i));

    const input = getByPlaceholderText(/github\.com\/owner\/repo\/pull/i);
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('.ripple-paste')?.getAttribute('aria-modal')).toBe('true');
  });

  it('never closes on a Space typed into an intake input', () => {
    // The scrim is a click-to-close target with a keyboard twin; a bubbled Enter/Space from a field
    // inside the panel belongs to that field, not to the scrim.
    localStorage.clear();
    let closed = false;
    const { getByText, getByPlaceholderText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => (closed = true)} />,
    );
    fireEvent.click(getByText(/Run on your own code/i));
    fireEvent.keyDown(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i), { key: ' ' });
    expect(closed).toBe(false);
  });
});

// The deterministic floor is what a reader with no key sees, and it carries no model prose. Every
// section here used to render its frame regardless — a labelled block over an empty paragraph, or a
// positive safety claim derived from a field nothing populates.
describe('the deterministic floor promises only what it has', () => {
  const FLOOR = buildShipFromDiff(
    parseUnifiedDiff(
      [
        'diff --git a/src/auth/token.ts b/src/auth/token.ts',
        '--- a/src/auth/token.ts',
        '+++ b/src/auth/token.ts',
        '@@ -42 +42 @@',
        '-validateToken(t: string)',
        '+validateToken(t: string, opts: VerifyOpts)',
      ].join('\n'),
    ),
    'acme/widget #482',
  );

  it('leaves out "Why it’s here" rather than heading an empty paragraph', () => {
    expect(FLOOR.changes.every((c) => c.why === '')).toBe(true);
    const { container, queryByText } = render(<ShipWorkspace model={FLOOR} altitude="working" />);
    expect(queryByText(/Why it’s here/i)).toBeNull();
    expect(container.querySelector('.ripple-ws-why')).toBeNull();
  });

  it('makes no prerequisites claim from a field nothing populates', () => {
    expect(FLOOR.gate.requires).toEqual([]);
    const { queryByText } = render(<ShipGate model={FLOOR} altitude="working" />);
    expect(queryByText(/No external prerequisites/i)).toBeNull();
  });

  it('does not offer an expander the read has no control for', () => {
    const { getByText, container } = render(<ShipRead model={FLOOR} altitude="working" />);
    expect(getByText(/paraphrases nothing it can’t cite/i).textContent).not.toMatch(/expand any/i);
    expect(container.querySelector('.ripple-read')!.querySelectorAll('button, a').length).toBe(0);
  });

  it('never labels the machine contract blocked while the verdict beside it says watch', () => {
    expect(FLOOR.gate.decision).toBe('block'); // this diff changes a signature
    const watching = {
      ...FLOOR,
      gate: { ...FLOOR.gate, decision: 'watch' as const, unackedP0: 0 },
    };
    const { container } = render(<ShipGate model={watching} altitude="working" />);
    expect(container.querySelector('.ripple-gate-term-status')!.textContent).toBe('watch');
  });
});
