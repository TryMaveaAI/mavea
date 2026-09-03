// ImpactMap.tsx — the flyable system map: THIS change at the centre, everything it touches ringed
// around it, the breaking edges drawn as animated coral so the eye lands on the danger first. Built
// on the shared spatial camera (pan/zoom/fit), whose scale floor keeps a fitted node a real touch
// target — a denser map pans rather than shrinking. Click a node to read its contract, what breaks,
// and the fix. Two lenses (severity vs live traffic) and a cross-repo filter re-weight the view
// without ever moving the deterministic layout — your mental map holds.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useSpatialCanvas } from '../../canvas/spatial/useSpatialCanvas';
import { statusVar, statusLabel } from './colors';
import { layoutImpact, NODE_W, NODE_H, type PlacedNode } from './layout';
import type { Altitude, ShipEdge, ShipNode } from './model';

export interface ImpactMapProps {
  nodes: ShipNode[];
  edges: ShipEdge[];
  altitude: Altitude;
  /** Ground a spoken/typed question on a node (wired to the ask rail by the overlay). */
  onAsk?: (node: ShipNode) => void;
  /** Play the entrance "ripple": the change pulses at centre and its reach fades in outward. */
  animate?: boolean;
}

type Lens = 'severity' | 'traffic';

export function ImpactMap({
  nodes,
  edges,
  altitude,
  onAsk,
  animate,
}: ImpactMapProps): ReactElement {
  const [lens, setLens] = useState<Lens>('severity');
  const [crossRepoOnly, setCrossRepoOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Filter (cross-repo) then lay out. The centre always survives the filter.
  const view = useMemo(() => {
    const ns = crossRepoOnly ? nodes.filter((n) => n.type === 'pr' || n.crossRepo) : nodes;
    const ids = new Set(ns.map((n) => n.id));
    const es = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return layoutImpact(ns, es);
  }, [nodes, edges, crossRepoOnly]);

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

  // A fitted node must remain a real touch target. Denser maps pan at this floor instead of
  // shrinking interactive cards into untappable miniatures.
  const spatial = useSpatialCanvas({ clamp: { min: 0.7, max: 2.2 }, margin: 56 });
  const { fitTo } = spatial;
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

  // Only offer a control when the data behind it exists. Nothing populates traffic or cross-repo
  // today — not the worked example, not a diff, not a repo read — so in practice these stay hidden
  // and the map reads by severity; they appear the day a connected graph supplies either.
  const hasTraffic = nodes.some((n) => typeof n.traffic === 'number');
  const hasCrossRepo = nodes.some((n) => n.crossRepo === true);

  return (
    <div className="ripple-impact">
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
        <div className="ripple-zoombtns">
          {/* ⊡ — content inside a frame; ⤢/⤡ mean full-screen expand/collapse elsewhere. */}
          <button
            type="button"
            onClick={() => fitTo(view.bbox)}
            title="Fit the whole map"
            aria-label="Fit"
          >
            ⊡
          </button>
        </div>
      </div>

      <div
        className={'ripple-stage' + (panning ? ' is-panning' : '')}
        ref={spatial.viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="ripple-world"
          data-animate={animate ? 'true' : undefined}
          style={{ width: view.w, height: view.h, transform: spatial.transform }}
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
            {view.nodes
              .filter((p) => p.node.id !== view.centerId)
              .map((p) => {
                const c = placedById.get(view.centerId);
                if (!c) return null;
                // Must be the edge TO the centre specifically — a node can also carry area→area
                // edges to other non-centre nodes, and this line is always drawn from the centre.
                const e =
                  edges.find((ed) => ed.from === c.node.id && ed.to === p.node.id) ??
                  edges.find((ed) => ed.to === c.node.id && ed.from === p.node.id);
                const color = statusVar(p.node.status);
                const w = traffic ? 1.3 + (p.node.traffic ?? 0) * 3 : e?.breaking ? 2.4 : 1.6;
                return (
                  <line
                    key={p.node.id}
                    x1={c.x}
                    y1={c.y}
                    x2={p.x}
                    y2={p.y}
                    stroke={color}
                    strokeWidth={w}
                    strokeLinecap="round"
                    strokeDasharray={e?.breaking ? '6 5' : e?.dashed ? '2 6' : undefined}
                    className={'ripple-edge' + (e?.breaking ? ' ripple-edge-break' : '')}
                    style={{ animationDelay: `${enterDelay.get(p.node.id) ?? 0}ms` }}
                    opacity={openId && openId !== p.node.id ? 0.25 : 0.7}
                  />
                );
              })}
          </svg>

          {/* edge verb labels */}
          {view.nodes
            .filter((p) => p.node.id !== view.centerId)
            .map((p) => {
              const c = placedById.get(view.centerId);
              if (!c) return null;
              const e =
                edges.find((ed) => ed.from === c.node.id && ed.to === p.node.id) ??
                edges.find((ed) => ed.to === c.node.id && ed.from === p.node.id);
              if (!e) return null;
              return (
                <div
                  key={`v-${p.node.id}`}
                  className="ripple-edge-verb"
                  style={{
                    left: (c.x + p.x) / 2,
                    top: (c.y + p.y) / 2,
                    color: statusVar(p.node.status),
                  }}
                >
                  {e.verb}
                </div>
              );
            })}

          {/* nodes */}
          {view.nodes.map((p) => {
            const n = p.node;
            const isCenter = n.id === view.centerId;
            const color = statusVar(n.status);
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
                style={{
                  left: p.x - NODE_W / 2,
                  top: p.y - NODE_H / 2,
                  width: NODE_W,
                  minHeight: NODE_H,
                  transform: `scale(${scale.toFixed(3)})`,
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
          {open.altitudeNotes?.[altitude] && (
            <div className="ripple-inspect-block">
              <div className="ripple-eyebrow">At your altitude</div>
              <p>{open.altitudeNotes[altitude]}</p>
            </div>
          )}
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
        </aside>
      )}
    </div>
  );
}
