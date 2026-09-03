// WhyMachineOverlay — the flyable causal web. Roots → mechanisms → outcome, laid out left→right; drag
// a cause's lever (or prune it) and the whole conclusion re-cascades LOCALLY (zero model calls) via the
// pure engine. The honesty spine is visible in the chrome: grounded edges/nodes wear a receipt and
// carry real weight; ungrounded ones render faint/dashed with no number; precise deltas + "% explained"
// appear ONLY when the whole web is grounded — otherwise "—". An illustrative web says so up top.
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSpatialCanvas } from '../../canvas/spatial/useSpatialCanvas';
import { useFocusTrap } from '../useFocusTrap';
import { safeHttpUrl } from '../../lib/sourceHost';
import { EdgeEvidencePanel } from '../trust/EdgeEvidencePanel';
import { asEdgeRelation } from '../trust/relations';
import { deriveEdgeStatus } from '../trust/receipts';
import { cascade } from './engine';
import { layoutWhy, NODE_W, NODE_H } from './layout';
import type { Intervention, WhyDag, WhyEdge, WhyNode } from './types';
import './why.css';

interface Props {
  dag: WhyDag;
  onClose?: () => void;
}

type Selected = { kind: 'node'; node: WhyNode } | { kind: 'edge'; edge: WhyEdge } | null;

const isReal = (t: string): boolean => t === 'T1' || t === 'T2';
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** A plain-language band for the structure-only relative strength (0..1) shown when nothing is
 *  grounded — so the ungrounded readout reads as a qualitative judgement, never a measured figure. */
const relLabel = (v: number): string =>
  v >= 0.66
    ? 'Strong relative support'
    : v >= 0.33
      ? 'Moderate relative support'
      : v > 0
        ? 'Weak relative support'
        : 'No active support';

export function WhyMachineOverlay({ dag, onClose }: Props): React.ReactElement {
  // The lens is layered over its host's own dialog rather than inside it, so it has to trap Tab and
  // answer Escape itself: aria-modal told assistive tech to ignore the surface behind, while Tab
  // still cycled it and no key in here reached the lens at all.
  const scrimRef = useRef<HTMLDivElement>(null);
  useFocusTrap(scrimRef, onClose ? { onEscape: onClose } : {});
  const layout = useMemo(() => layoutWhy(dag), [dag]);
  const [act, setAct] = useState<Map<string, number>>(new Map());
  const [sel, setSel] = useState<Selected>(null);

  const interventions: Intervention[] = useMemo(
    () => [...act.entries()].map(([nodeId, pct]) => ({ nodeId, pct })),
    [act],
  );
  const result = useMemo(() => cascade(dag, interventions), [dag, interventions]);

  const cam = useSpatialCanvas({ clamp: { min: 0.35, max: 1.7 }, margin: 64 });
  // Fit once per dag (and on the first real viewport measurement).
  const fittedFor = useMemo(() => {
    cam.fitTo(layout.bbox);
    return dag;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dag, layout]);
  void fittedFor;

  const centers = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of layout.placed) m.set(p.node.id, { x: p.x, y: p.y });
    return m;
  }, [layout]);

  const outcome = dag.nodes.find((n) => n.id === dag.outcomeId);
  const setLever = (id: string, pct: number): void => setAct((prev) => new Map(prev).set(id, pct));
  const reset = (): void => setAct(new Map());

  const grounded = result.fullyGrounded;
  const baseValue = outcome?.value;
  const currentValue =
    grounded && baseValue !== undefined && result.outcomeDelta !== null
      ? baseValue + result.outcomeDelta
      : null;
  const pctText =
    grounded && result.explainedPct !== null
      ? `${Math.round(result.explainedPct * 100)}% explained`
      : '—';
  // The structure-only relative strength of the conclusion (0..1), used when nothing is grounded so
  // the panel and node shares still respond to a lever or a prune instead of sitting dead at "—".
  const relOutcome = result.relativeOutcome;

  return (
    <div
      className="wm-scrim"
      role="dialog"
      aria-label="Why machine"
      aria-modal="true"
      ref={scrimRef}
    >
      {/* Layered directly over PrismOverlay's own scrim (not inside its stopPropagation-guarded
          panel), so without this guard any click in here — not just the close button — bubbles up
          and closes the whole Prism session instead of just this lens. role="presentation" because
          this div carries no semantics of its own — it's a click boundary, the dialog role above
          already labels the whole surface. */}
      <div className="wm-panel" role="presentation" onClick={(e) => e.stopPropagation()}>
        <header className="wm-head">
          <div className="wm-title">
            <span className="wm-kicker">THE WHY MACHINE</span>
            <h2>{dag.center}</h2>
          </div>
          <div className="wm-head-actions">
            <button type="button" className="wm-btn" onClick={reset} disabled={act.size === 0}>
              Reset
            </button>
            {onClose && (
              <button
                type="button"
                className="wm-btn wm-btn-close"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {dag.provenance.illustrative && (
          <div className="wm-banner wm-banner-illustrative">
            Illustrative model — shows the shape, not your numbers.
          </div>
        )}
        {!dag.provenance.illustrative && !grounded && (
          <div className="wm-banner wm-banner-qual">
            Structure only — no grounded figures, so causes are shown as relative strength, not
            exact contributions. Attach data or turn on search for weighted deltas.
          </div>
        )}

        <div className="wm-body">
          <div className="wm-viewport" ref={cam.viewportRef}>
            <div
              className="wm-world"
              style={{ transform: cam.transform, width: layout.w, height: layout.h }}
            >
              <svg className="wm-edges" width={layout.w} height={layout.h} aria-hidden="true">
                {dag.edges.map((e, i) => {
                  const a = centers.get(e.from);
                  const b = centers.get(e.to);
                  if (!a || !b) return null;
                  const x1 = a.x + NODE_W / 2;
                  const x2 = b.x - NODE_W / 2;
                  const mx = (x1 + x2) / 2;
                  const w =
                    isReal(e.tier) && typeof e.weight === 'number' ? 2.5 + e.weight * 12 : 2.25;
                  const op =
                    isReal(e.tier) && typeof e.weight === 'number' ? 0.5 + e.weight * 0.45 : 0.6;
                  const color = e.sign === -1 ? 'var(--warning)' : 'var(--insight)';
                  return (
                    <path
                      key={e.id ?? `${e.from}-${e.to}-${i}`}
                      d={`M ${x1} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={w}
                      strokeOpacity={op}
                      strokeDasharray={e.provisional ? '4 5' : undefined}
                      className="wm-edge"
                      onClick={() => setSel({ kind: 'edge', edge: e })}
                    />
                  );
                })}
              </svg>

              {layout.placed.map(({ node, x, y }) => {
                const contribution = result.byNode.get(node.id);
                const activation = act.get(node.id) ?? 1;
                const style: CSSProperties = {
                  left: x - NODE_W / 2,
                  top: y - NODE_H / 2,
                  width: NODE_W,
                };
                const pruned = node.role === 'root' && activation === 0;
                return (
                  <div
                    key={node.id}
                    className={`wm-node wm-role-${node.role} ${isReal(node.tier) ? 'wm-real' : 'wm-t0'} ${pruned ? 'wm-pruned' : ''}`}
                    style={style}
                    onClick={() => setSel({ kind: 'node', node })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => ev.key === 'Enter' && setSel({ kind: 'node', node })}
                  >
                    <div className="wm-node-label">{node.label}</div>
                    <div className="wm-node-foot">
                      <span className={`wm-tier wm-tier-${node.tier}`}>
                        {node.tier === 'T1'
                          ? 'your data'
                          : node.tier === 'T2'
                            ? node.receipt?.host || 'web'
                            : node.tier === 'T3'
                              ? 'illustrative'
                              : 'unverified'}
                      </span>
                      {node.role === 'outcome' && currentValue !== null && (
                        <span className="wm-node-val">
                          {baseValue !== undefined && currentValue !== baseValue
                            ? `${fmt(baseValue)}→${fmt(currentValue)}`
                            : fmt(currentValue)}
                          {node.unit ?? ''}
                        </span>
                      )}
                      {node.role !== 'outcome' && node.value !== undefined && (
                        <span className="wm-node-val">
                          {fmt(node.value)}
                          {node.unit ?? ''}
                        </span>
                      )}
                    </div>
                    {node.role === 'root' && (
                      <div
                        className="wm-lever"
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => ev.stopPropagation()}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            if (ev.key === ' ') ev.preventDefault();
                            ev.stopPropagation();
                          }
                        }}
                      >
                        <button
                          type="button"
                          className={`wm-prune ${pruned ? 'wm-prune-on' : ''}`}
                          onClick={() => setLever(node.id, pruned ? 1 : 0)}
                          title={pruned ? 'Restore this cause' : 'Remove this cause'}
                        >
                          {pruned ? 'restore' : 'remove'}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(activation * 100)}
                          onChange={(ev) => setLever(node.id, Number(ev.target.value) / 100)}
                          aria-label={`${node.label} strength`}
                        />
                      </div>
                    )}
                    {node.role !== 'outcome' &&
                      (grounded && typeof contribution === 'number' ? (
                        <div className="wm-contrib" title="share of the outcome this carries">
                          {Math.round(Math.abs(contribution) * 100)}%
                        </div>
                      ) : (
                        // Ungrounded: the structure-only relative strength, so a lever/prune visibly
                        // moves each cause's share too — clearly badged as relative, not a measure.
                        <div
                          className="wm-contrib wm-contrib-rel"
                          title="relative strength (structure only — not a measured contribution)"
                        >
                          {Math.round((result.relativeByNode.get(node.id) ?? 0) * 100)}%
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="wm-rail">
            <div className="wm-conclusion">
              <span className="wm-rail-kicker">THE CONCLUSION, LIVE</span>
              <div className="wm-conclusion-val">
                {grounded && currentValue !== null ? (
                  <>
                    <strong>
                      {fmt(currentValue)}
                      {outcome?.unit ?? ''}
                    </strong>
                    <span className="wm-conclusion-label">{outcome?.label}</span>
                  </>
                ) : relOutcome !== null ? (
                  <>
                    <strong className="wm-rel-pct">
                      {Math.round(relOutcome * 100)}
                      <span className="wm-rel-pct-unit">%</span>
                    </strong>
                    <span className="wm-conclusion-label">{outcome?.label}</span>
                  </>
                ) : (
                  <>
                    <strong className="wm-dash">—</strong>
                    <span className="wm-conclusion-label">{outcome?.label}</span>
                  </>
                )}
              </div>
              {grounded ? (
                <div className="wm-explained">{pctText}</div>
              ) : relOutcome !== null ? (
                <div className="wm-rel">
                  <div className="wm-rel-track" aria-hidden="true">
                    <i style={{ width: `${Math.round(relOutcome * 100)}%` }} />
                  </div>
                  <span className="wm-rel-note">
                    {relLabel(relOutcome)} · relative, not measured
                  </span>
                </div>
              ) : (
                <div className="wm-explained">—</div>
              )}
              {grounded && (
                <p className="wm-caveat">Isolated estimate — assumes the causes are independent.</p>
              )}
            </div>

            <div className="wm-evidence">
              <span className="wm-rail-kicker">EVIDENCE</span>
              {!sel && <p className="wm-hint">Tap a cause or a link to see its receipt.</p>}
              {sel?.kind === 'node' && (
                <EvidenceView
                  tier={sel.node.tier}
                  label={sel.node.label}
                  receipt={sel.node.receipt}
                />
              )}
              {/* A link's evidence is the trust layer's, not this file's: it is the one place that
                  knows how to show several receipts, a counter-quote, and — always — what the
                  relation does NOT claim. The node arm keeps EvidenceView, which is a single
                  receipt on a single figure and has no such vocabulary to carry. */}
              {sel?.kind === 'edge' && (
                <EdgeEvidencePanel
                  relation={asEdgeRelation(sel.edge.relation)}
                  sign={sel.edge.sign}
                  status={sel.edge.status ?? deriveEdgeStatus(sel.edge)}
                  receipts={sel.edge.receipts ?? (sel.edge.receipt ? [sel.edge.receipt] : [])}
                  counter={sel.edge.counter}
                  provisional={sel.edge.provisional}
                />
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function EvidenceView({
  tier,
  label,
  receipt,
}: {
  tier: string;
  label: string;
  receipt?: { quote: string; url?: string; host?: string };
}): React.ReactElement {
  if (!isReal(tier) || !receipt) {
    return (
      <div className="wm-ev">
        <p className="wm-ev-label">{label}</p>
        <p className="wm-ev-unverified">
          {tier === 'T3'
            ? 'Illustrative — shows the shape, not a measured fact.'
            : "Mavéa's reading — no source, unverified."}
        </p>
      </div>
    );
  }
  const url = receipt.url ? safeHttpUrl(receipt.url) : null;
  return (
    <div className="wm-ev">
      <p className="wm-ev-label">{label}</p>
      <blockquote className="wm-ev-quote">“{receipt.quote}”</blockquote>
      {receipt.host && (
        <p className="wm-ev-src">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer noopener">
              {receipt.host}
            </a>
          ) : (
            receipt.host
          )}
        </p>
      )}
    </div>
  );
}
