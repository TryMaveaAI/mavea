// ImpactMap.tsx — the flyable system map: THIS change at the centre, everything it touches ringed
// around it, the breaking edges drawn as animated coral so the eye lands on the danger first. Built
// on the shared spatial camera (pan/zoom/fit), whose scale floor keeps a fitted node a real touch
// target — a denser map pans rather than shrinking. Click a node to read its contract, what breaks,
// and the fix. Two lenses (severity vs live traffic) and a cross-repo filter re-weight the view
// without ever moving the deterministic layout — your mental map holds.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { useSpatialCanvas } from '../../canvas/spatial/useSpatialCanvas';
import { statusVar, statusLabel } from './colors';
import { findImpactPath, traceImpact, type TraceDirection } from './impactTrace';
import { layoutImpact, NODE_W, NODE_H, placeVerbs, type PlacedNode } from './layout';
import type { Altitude, ChangeDelta, ShipChange, ShipEdge, ShipNode } from './model';

export interface ImpactMapProps {
  nodes: ShipNode[];
  edges: ShipEdge[];
  changes?: ShipChange[];
  altitude: Altitude;
  /** Ground a spoken/typed question on a node (wired to the ask rail by the overlay). */
  onAsk?: (node: ShipNode) => void;
  /** Play the entrance "ripple": the change pulses at centre and its reach fades in outward. */
  animate?: boolean;
}

type Lens = 'severity' | 'traffic';

interface CausalFact {
  id: string;
  change: ShipChange;
  delta: ChangeDelta;
}

const EFFECT_LABEL = {
  breaks: 'Stops working',
  migration: 'Changes after migration',
  untested: 'Not proven yet',
  affected: 'May behave differently',
  safe: 'Still works',
} as const;

const normalizedArea = (value: string): string =>
  value.toLowerCase().split(/[\\/]/).filter(Boolean).at(-1) ?? '';

const ALTITUDE_LABEL: Record<Altitude, string> = {
  newgrad: 'Onboarding lens',
  working: 'Builder lens',
  principal: 'Principal lens',
};

export function ImpactMap({
  nodes,
  edges,
  changes = [],
  altitude,
  onAsk,
  animate,
}: ImpactMapProps): ReactElement {
  const [lens, setLens] = useState<Lens>('severity');
  const [crossRepoOnly, setCrossRepoOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [direction, setDirection] = useState<TraceDirection>('downstream');
  const markerId = useId().replace(/:/g, '');

  // Filter (cross-repo) then lay out. The centre always survives the filter.
  const visibleGraph = useMemo(() => {
    const visibleNodes = crossRepoOnly
      ? nodes.filter((n) => n.type === 'pr' || n.crossRepo)
      : nodes;
    const ids = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, crossRepoOnly]);
  const view = useMemo(() => layoutImpact(visibleGraph.nodes, visibleGraph.edges), [visibleGraph]);
  const verbSpots = useMemo(
    () => placeVerbs(view.nodes, visibleGraph.edges),
    [view, visibleGraph.edges],
  );

  const placedById = useMemo(() => {
    const m = new Map<string, PlacedNode>();
    for (const p of view.nodes) m.set(p.node.id, p);
    return m;
  }, [view]);

  // Entrance stagger: each node/edge fades in after a delay proportional to how far out it sits, so
  // the change appears to ripple from the centre. Pure geometry; no effect on the layout.
  const enterDelay = useMemo(() => {
    const m = new Map<string, number>();
    const c = placedById.get(view.centerId);
    if (!c) return m;
    let maxD = 1;
    for (const p of view.nodes) maxD = Math.max(maxD, Math.hypot(p.x - c.x, p.y - c.y));
    for (const p of view.nodes) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      m.set(p.node.id, Math.round((d / maxD) * 460));
    }
    return m;
  }, [view, placedById]);
  const center = placedById.get(view.centerId);
  const [rootId, setRootId] = useState(view.centerId);
  useEffect(() => {
    if (!placedById.has(rootId)) setRootId(view.centerId);
  }, [placedById, rootId, view.centerId]);

  const trace = useMemo(
    () => traceImpact(visibleGraph.edges, rootId, direction),
    [visibleGraph.edges, rootId, direction],
  );
  const root = placedById.get(rootId)?.node ?? center?.node ?? null;
  const reached = useMemo(
    () =>
      [...trace.nodeIds]
        .filter((id) => id !== rootId)
        .map((id) => placedById.get(id)?.node)
        .filter((node): node is ShipNode => !!node),
    [trace.nodeIds, rootId, placedById],
  );
  const breakingCount = reached.filter((node) => node.status === 'breaks').length;
  const migrationCount = reached.filter((node) => node.status === 'migration').length;
  const untestedCount = reached.filter((node) => node.status === 'untested').length;
  const outsidePrCount = reached.filter((node) => node.scope !== 'in-pr').length;
  const leadEffect =
    reached.find((node) => node.status === 'breaks' && node.problem) ??
    reached.find((node) => !!node.problem);
  const directionLabel =
    direction === 'downstream' ? 'Downstream effects' : 'Upstream dependencies';
  const traceSummary = root
    ? reached.length
      ? `${root.label} reaches ${reached.length} mapped ${reached.length === 1 ? 'system' : 'systems'} ${direction === 'downstream' ? 'downstream' : 'upstream'}.`
      : `No ${direction === 'downstream' ? 'downstream effect' : 'upstream dependency'} is mapped from ${root.label}.`
    : 'Choose a node to trace its effects.';

  const causalFacts = useMemo<CausalFact[]>(() => {
    const relevant =
      root?.type === 'pr'
        ? changes
        : changes.filter(
            (change) =>
              change.blastRadius?.includes(rootId) ||
              change.subsystem.toLowerCase() === root?.label.toLowerCase(),
          );
    return relevant.flatMap((change) =>
      (change.deltas ?? []).map((delta, index) => ({
        id: `${change.id}:${delta.subject}:${index}`,
        change,
        delta,
      })),
    );
  }, [changes, root, rootId]);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  useEffect(() => {
    if (!causalFacts.some((fact) => fact.id === selectedFactId)) {
      setSelectedFactId(causalFacts[0]?.id ?? null);
    }
  }, [causalFacts, selectedFactId]);
  const selectedFact =
    causalFacts.find((fact) => fact.id === selectedFactId) ?? causalFacts[0] ?? null;
  const causalEffects = useMemo(() => {
    if (!selectedFact) return [];
    const linked = new Set(selectedFact.change.blastRadius ?? []);
    const candidates = linked.size
      ? [...linked].map((id) => placedById.get(id)?.node).filter((node): node is ShipNode => !!node)
      : reached;
    return candidates.filter((node) => root?.type !== 'pr' || node.id !== rootId).slice(0, 4);
  }, [selectedFact, placedById, reached, root, rootId]);

  // A fitted node must remain a real touch target. Denser maps pan at this floor instead of
  // shrinking interactive cards into untappable miniatures.
  // The floor is derived, not chosen: 9px legibility ÷ the ramp's 10px smallest label. Below it a
  // fitted map paints its verbs and status lines under 9px; the camera stops there and the map
  // pans instead, the same rule the living world's camera follows.
  // A map the floor cannot fit opens at its top row, not a slice of its middle.
  const spatial = useSpatialCanvas({ clamp: { min: 0.9, max: 2.2 }, margin: 56, tall: 'top' });
  const { fitTo, flying, endFlight } = spatial;
  useEffect(() => {
    fitTo(view.bbox);
  }, [view, fitTo]);

  // Pointer-drag to pan; a real drag swallows the click that ends it so it never opens a node.
  // `panning` is state (drives the grab/grabbing cursor); `moved`/`dragging` are refs so a pan
  // doesn't re-render on every pointer move.
  const [panning, setPanning] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = false;
    setPanning(true);
    last.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      spatial.pan(dx, dy);
    },
    [spatial],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    setPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // Wheel-zoom needs a non-passive listener to preventDefault the page scroll.
  const viewportEl = spatial.viewportRef;
  const { zoomAtClient } = spatial;
  useEffect(() => {
    const el = viewportEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      zoomAtClient(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewportEl, zoomAtClient]);

  const traffic = lens === 'traffic';

  const open = openId ? (placedById.get(openId)?.node ?? null) : null;
  const openPath = useMemo(
    () => (open ? findImpactPath(visibleGraph.edges, rootId, open.id, direction) : null),
    [direction, open, rootId, visibleGraph.edges],
  );
  const openChanges = useMemo(() => {
    if (!open) return [];
    return changes.filter(
      (change) =>
        change.blastRadius?.includes(open.id) ||
        normalizedArea(change.subsystem) === normalizedArea(open.label),
    );
  }, [changes, open]);

  // Only offer a control when the data behind it exists. Nothing populates traffic or cross-repo
  // today — not the worked example, not a diff, not a repo read — so in practice these stay hidden
  // and the map reads by severity; they appear the day a connected graph supplies either.
  const hasTraffic = nodes.some((n) => typeof n.traffic === 'number');
  const hasCrossRepo = nodes.some((n) => n.crossRepo === true);

  return (
    <div className="ripple-impact">
      <div className="ripple-impact-simulator">
        <div className="ripple-impact-simulator-copy">
          <span className="ripple-eyebrow">Impact simulator</span>
          <strong>{root ? `Change ${root.label}` : 'Choose a starting point'}</strong>
          <span className="ripple-impact-summary" aria-live="polite">
            {traceSummary}
          </span>
        </div>
        <div className="ripple-direction" role="group" aria-label="Trace direction">
          <button
            type="button"
            data-active={direction === 'downstream' ? 'true' : undefined}
            onClick={() => setDirection('downstream')}
          >
            <span aria-hidden="true">↘</span> Downstream
            <small>effects this may cause</small>
          </button>
          <button
            type="button"
            data-active={direction === 'upstream' ? 'true' : undefined}
            onClick={() => setDirection('upstream')}
          >
            <span aria-hidden="true">↖</span> Upstream
            <small>what must feed it</small>
          </button>
        </div>
        <div className="ripple-impact-totals" aria-label={`${directionLabel} summary`}>
          <span data-tone="reach">
            <strong>{reached.length}</strong> reached
          </span>
          <span data-tone="breaks">
            <strong>{breakingCount}</strong> breaking
          </span>
          <span data-tone="migration">
            <strong>{migrationCount}</strong> migration
          </span>
          <span data-tone="untested">
            <strong>{untestedCount}</strong> untested
          </span>
          <span data-tone="outside">
            <strong>{outsidePrCount}</strong> outside this PR
          </span>
        </div>
        {leadEffect?.problem && (
          <div className="ripple-impact-forecast">
            <span>
              {direction === 'downstream' ? 'First material effect' : 'Dependency to inspect'}
            </span>
            <p>
              <strong>{leadEffect.label}</strong> — {leadEffect.problem}
            </p>
          </div>
        )}
      </div>

      {selectedFact && (
        <section className="ripple-causal" aria-label="Before and after consequence chain">
          <div className="ripple-causal-head">
            <div>
              <span className="ripple-eyebrow">Cause → effect</span>
              <strong>See exactly what changed—and what follows</strong>
            </div>
            <div className="ripple-causal-facts" role="group" aria-label="Changed values">
              {causalFacts.slice(0, 8).map((fact) => (
                <button
                  key={fact.id}
                  type="button"
                  aria-label={`${fact.delta.kind} ${fact.delta.subject}`}
                  data-active={fact.id === selectedFact.id ? 'true' : undefined}
                  onClick={() => setSelectedFactId(fact.id)}
                >
                  <span>{fact.delta.kind}</span>
                  {fact.delta.subject}
                </button>
              ))}
            </div>
          </div>
          <div className="ripple-causal-story" aria-live="polite">
            <div className="ripple-causal-value" data-state="before">
              <span>Used to be</span>
              <code>{selectedFact.delta.before ?? 'Not present'}</code>
            </div>
            <div className="ripple-causal-arrow" aria-hidden="true">
              <span>{selectedFact.delta.subject}</span>→
            </div>
            <div className="ripple-causal-value" data-state="after">
              <span>Now</span>
              <code>{selectedFact.delta.after ?? 'Removed'}</code>
            </div>
            <div className="ripple-causal-effects">
              <span className="ripple-causal-because">Because this changed</span>
              <div className="ripple-causal-chain">
                {causalEffects.length ? (
                  causalEffects.map((node, index) => (
                    <button
                      type="button"
                      className="ripple-causal-effect"
                      data-status={node.status}
                      key={node.id}
                      onClick={() => setOpenId(node.id)}
                      aria-label={`Inspect how the change affects ${node.label}`}
                    >
                      {index > 0 && (
                        <span className="ripple-causal-chain-arrow" aria-hidden="true">
                          →
                        </span>
                      )}
                      <span className="ripple-causal-effect-copy">
                        <strong>{node.label}</strong>
                        <small>
                          {normalizedArea(node.label) ===
                          normalizedArea(selectedFact.change.subsystem)
                            ? 'Changed here'
                            : EFFECT_LABEL[node.status]}
                        </small>
                      </span>
                    </button>
                  ))
                ) : (
                  <span className="ripple-causal-unknown">
                    No downstream behavior is proven by this diff yet.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="ripple-causal-evidence">
            <p>
              <span>Changed in</span>
              {selectedFact.change.file}
            </p>
            <p>
              <span>Why it matters</span>
              {selectedFact.change.risks?.find((risk) => risk.level === 'breaks')?.text ??
                (selectedFact.change.why || selectedFact.change.intent)}
            </p>
          </div>
        </section>
      )}

      {(hasTraffic || hasCrossRepo) && (
        <div className="ripple-impact-controls">
          {hasTraffic && (
            <div className="ripple-lens" role="group" aria-label="Map lens">
              <button
                type="button"
                data-active={lens === 'severity' ? 'true' : undefined}
                onClick={() => setLens('severity')}
              >
                Severity
              </button>
              <button
                type="button"
                data-active={lens === 'traffic' ? 'true' : undefined}
                onClick={() => setLens('traffic')}
              >
                Traffic
              </button>
            </div>
          )}
          {hasCrossRepo && (
            <label className="ripple-crossrepo">
              <input
                type="checkbox"
                checked={crossRepoOnly}
                onChange={(e) => setCrossRepoOnly(e.target.checked)}
              />
              Cross-repo only
            </label>
          )}
        </div>
      )}

      <div
        className={'ripple-stage' + (panning ? ' is-panning' : '')}
        ref={spatial.viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* The fit control lives on the frame it acts on. In a row of its own above the stage it
            sat outside the map, alone, reading as a stray button. Its press must not start a pan:
            the stage captures the pointer, which would retarget the click away from the button. */}
        <div className="ripple-zoombtns">
          {/* ⊡ — content inside a frame; ⤢/⤡ mean full-screen expand/collapse elsewhere. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => fitTo(view.bbox)}
            title="Fit the whole map"
            aria-label="Fit"
          >
            ⊡
          </button>
        </div>
        <div
          className="ripple-world"
          data-animate={animate ? 'true' : undefined}
          data-flying={flying ? 'true' : undefined}
          style={{ width: view.w, height: view.h, transform: spatial.transform }}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'transform') {
              endFlight();
            }
          }}
        >
          {/* the entrance pulse — a ring emanating from the change as the map appears */}
          {animate && center && (
            <span
              className="ripple-enter-pulse"
              aria-hidden="true"
              style={{ left: center.x, top: center.y }}
            />
          )}
          {/* edges */}
          <svg
            className="ripple-edges"
            width={view.w}
            height={view.h}
            viewBox={`0 0 ${view.w} ${view.h}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={`${markerId}-arrow`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
              </marker>
            </defs>
            {visibleGraph.edges.map((edge, index) => {
              const from = placedById.get(edge.from);
              const to = placedById.get(edge.to);
              if (!from || !to) return null;
              const target = direction === 'downstream' ? to.node : from.node;
              const color = statusVar(target.status);
              const active = trace.edgeIndexes.has(index);
              const w = traffic ? 1.3 + (target.traffic ?? 0) * 3 : edge.breaking ? 2.4 : 1.6;
              return (
                <g key={`${edge.from}-${edge.to}-${index}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={color}
                    strokeWidth={w}
                    strokeLinecap="round"
                    strokeDasharray={edge.breaking ? '6 5' : edge.dashed ? '2 6' : undefined}
                    markerEnd={`url(#${markerId}-arrow)`}
                    className={'ripple-edge' + (edge.breaking ? ' ripple-edge-break' : '')}
                    style={{ animationDelay: `${enterDelay.get(target.id) ?? 0}ms` }}
                    opacity={active ? 0.9 : 0.12}
                  />
                  {active && (
                    <line
                      x1={direction === 'downstream' ? from.x : to.x}
                      y1={direction === 'downstream' ? from.y : to.y}
                      x2={direction === 'downstream' ? to.x : from.x}
                      y2={direction === 'downstream' ? to.y : from.y}
                      stroke={color}
                      strokeWidth={Math.max(2.8, w + 1)}
                      strokeLinecap="round"
                      markerEnd={`url(#${markerId}-arrow)`}
                      className="ripple-edge-flow"
                      style={{ ['--trace-step' as string]: trace.depth.get(target.id) ?? 1 }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* edge verb labels */}
          {visibleGraph.edges.map((edge, index) => {
            const from = placedById.get(edge.from);
            const to = placedById.get(edge.to);
            if (!from || !to) return null;
            const at = verbSpots[index];
            if (!at) return null;
            const active = trace.edgeIndexes.has(index);
            return (
              <div
                key={`v-${edge.from}-${edge.to}-${index}`}
                className="ripple-edge-verb"
                data-active={active ? 'true' : undefined}
                style={{
                  left: at.x,
                  top: at.y,
                  color: statusVar(to.node.status),
                }}
              >
                {edge.verb}
              </div>
            );
          })}

          {/* nodes */}
          {view.nodes.map((p) => {
            const n = p.node;
            const isCenter = n.id === view.centerId;
            const color = statusVar(n.status);
            const traceState =
              n.id === rootId ? 'root' : trace.nodeIds.has(n.id) ? 'reached' : 'muted';
            // Traffic changes emphasis without ever shrinking a button below the map's touch floor.
            const scale = traffic && !isCenter ? 1 + (n.traffic ?? 0) * 0.24 : 1;
            return (
              <button
                key={n.id}
                type="button"
                className="ripple-node"
                data-center={isCenter ? 'true' : undefined}
                data-status={n.status}
                data-open={openId === n.id ? 'true' : undefined}
                data-trace={traceState}
                data-depth={trace.depth.get(n.id)}
                style={{
                  left: p.x - NODE_W / 2,
                  top: p.y - NODE_H / 2,
                  width: NODE_W,
                  minHeight: NODE_H,
                  transform: `scale(${scale.toFixed(3)})`,
                  ['--trace-depth' as string]: trace.depth.get(n.id) ?? 0,
                  borderColor: color,
                  opacity: openId && openId !== n.id ? 0.55 : 1,
                  animationDelay: `${enterDelay.get(n.id) ?? 0}ms`,
                }}
                onClick={() => {
                  if (moved.current) return; // swallow the click that ended a pan
                  setOpenId((cur) => (cur === n.id ? null : n.id));
                }}
              >
                {isCenter ? (
                  <>
                    <span className="ripple-node-eyebrow" style={{ color }}>
                      THIS CHANGE
                    </span>
                    <span className="ripple-node-name ripple-node-name-lg">{n.label}</span>
                  </>
                ) : (
                  <>
                    <span className="ripple-node-top">
                      <span
                        className="ripple-node-dot"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <span className="ripple-node-status" style={{ color }}>
                        {statusLabel(n.status)}
                      </span>
                      {n.severity && (
                        <span className="ripple-node-sev" style={{ background: color }}>
                          {n.severity}
                        </span>
                      )}
                    </span>
                    <span className="ripple-node-name">{n.label}</span>
                    <span className="ripple-node-meta">
                      {n.team ?? n.owner ?? ''}
                      {n.trafficLabel ? ` · ${n.trafficLabel}` : ''}
                    </span>
                    {n.crossRepo && <span className="ripple-node-repo">other repo</span>}
                    {!n.crossRepo && n.scope !== 'in-pr' && (
                      <span className="ripple-node-repo">outside this PR</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* legend */}
        <div className="ripple-map-legend" aria-hidden="true">
          {(['breaks', 'migration', 'untested', 'affected', 'safe'] as const).map((s) => (
            <span key={s} className="ripple-map-legend-item">
              <span className="ripple-node-dot" style={{ background: statusVar(s) }} />
              {statusLabel(s).toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* inspect panel */}
      {open && (
        <aside className="ripple-inspect" aria-label={`${open.label} detail`}>
          <div className="ripple-inspect-head">
            <div className="ripple-inspect-titles">
              <span className="ripple-node-status" style={{ color: statusVar(open.status) }}>
                {statusLabel(open.status)}
              </span>
              {open.severity && (
                <span className="ripple-inspect-sev" style={{ background: statusVar(open.status) }}>
                  would page · {open.severity}
                </span>
              )}
            </div>
            <button
              type="button"
              className="ripple-iconbtn"
              onClick={() => setOpenId(null)}
              aria-label="Close detail"
            >
              ✕
            </button>
          </div>
          <div className="ripple-inspect-name">{open.label}</div>
          <div className="ripple-inspect-owner">
            {open.team ? `owned by ${open.team}` : ''}
            {open.cite ? <span className="ripple-inspect-cite"> · {open.cite.ref}</span> : null}
          </div>

          {open.scope !== 'in-pr' && (
            <div className="ripple-inspect-decision">
              <div className="ripple-eyebrow">Merge decision</div>
              <strong>This behavior changes outside the PR’s edited files.</strong>
              <p>
                Follow the evidence path below, then decide whether this consequence is intended,
                needs another edit, or should block the merge.
              </p>
            </div>
          )}

          {openPath && openPath.edgeIndexes.length > 0 && (
            <div className="ripple-inspect-block ripple-inspect-path">
              <div className="ripple-eyebrow">
                {direction === 'downstream'
                  ? 'How this change reaches here'
                  : 'What this depends on'}
              </div>
              <ol>
                {openPath.edgeIndexes.map((edgeIndex, index) => {
                  const edge = visibleGraph.edges[edgeIndex]!;
                  const fromId = openPath.nodeIds[index]!;
                  const toId = openPath.nodeIds[index + 1]!;
                  return (
                    <li key={`${fromId}-${toId}-${edgeIndex}`}>
                      <strong>{placedById.get(fromId)?.node.label ?? fromId}</strong>
                      <span>{edge.verb}</span>
                      <strong>{placedById.get(toId)?.node.label ?? toId}</strong>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {openChanges.length > 0 && (
            <div className="ripple-inspect-block ripple-inspect-evidence">
              <div className="ripple-eyebrow">Exact change behind this effect</div>
              {openChanges.map((change) => (
                <div className="ripple-inspect-change" key={change.id}>
                  <code>{change.file}</code>
                  <strong>{change.title}</strong>
                  {(change.deltas ?? []).map((delta, index) => (
                    <p key={`${delta.subject}-${index}`}>
                      <span>{delta.subject}</span>
                      <code>{delta.before ?? 'Not present'}</code>
                      <b aria-hidden="true">→</b>
                      <code>{delta.after ?? 'Removed'}</code>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          {open.trafficLabel && (
            <div className="ripple-inspect-traffic">
              <strong>{open.trafficLabel}</strong>
              <span>live traffic, from tracing — not the diff</span>
            </div>
          )}

          {open.contract && (
            <div className="ripple-inspect-block">
              <div className="ripple-eyebrow">The contract</div>
              <p>{open.contract}</p>
            </div>
          )}
          {open.problem && (
            <div
              className="ripple-inspect-block ripple-inspect-problem"
              style={{
                borderColor: `color-mix(in oklab, ${statusVar(open.status)} 40%, transparent)`,
              }}
            >
              <div className="ripple-eyebrow" style={{ color: statusVar(open.status) }}>
                What happens
              </div>
              <p>{open.problem}</p>
            </div>
          )}
          <div className="ripple-inspect-block">
            <div className="ripple-eyebrow">{ALTITUDE_LABEL[altitude]}</div>
            <p>
              {open.altitudeNotes?.[altitude] ??
                (altitude === 'newgrad'
                  ? 'Follow the path above one relationship at a time, then open the cited file to see where the dependency enters this system.'
                  : altitude === 'principal'
                    ? 'Use the path, ownership, and evidence to judge whether this consequence changes the system boundary or rollout risk.'
                    : 'Check the cited caller or contract, confirm the failure mode, and cover the consequence with a targeted test.')}
            </p>
          </div>
          {open.fix && (
            <div className="ripple-inspect-fix">
              <div className="ripple-eyebrow">Mavéa’s call</div>
              <p>{open.fix}</p>
            </div>
          )}
          {onAsk && (
            <button type="button" className="ripple-ask-btn" onClick={() => onAsk(open)}>
              Ask about {open.label}
            </button>
          )}
          <button
            type="button"
            className="ripple-trace-btn"
            onClick={() => {
              setRootId(open.id);
              setOpenId(null);
            }}
          >
            Trace effects from here
          </button>
        </aside>
      )}
    </div>
  );
}
