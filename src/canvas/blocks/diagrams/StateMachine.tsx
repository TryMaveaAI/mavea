import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { computeEdgeLayout, ringPositions, adaptiveRadius } from '../../lib';
import { estimateTextWidth, fitText } from '../../lib/fitText';
import type { StateMachineProps, StateNode, StateTransition } from './types';

type Props = StateMachineProps & { delay?: number };

const VB = 100; // viewBox dimension
// .dg-sm-lbl in the family sheet — user units, mirrored here so the node can be sized for the
// words inside it. Two lines is the most a circle holds without reading as a paragraph.
const LABEL_FS = 4;
const LABEL_LINE_H = LABEL_FS * 1.15;
const LABEL_MAX_LINES = 2;
const LABEL_PAD = 2.2; // between the text and the circle's edge

interface RenderState extends StateNode {
  renderId: string;
}

interface RenderTransition extends StateTransition {
  from: string;
  to: string;
}

function key(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function normalizeGraph(
  states: readonly StateNode[],
  transitions: readonly StateTransition[],
): { states: RenderState[]; transitions: RenderTransition[] } {
  const aliases = new Map<string, string>();
  const safeStates = states.map((state, index) => {
    const rawId = typeof state?.id === 'string' ? state.id.trim() : '';
    const label =
      typeof state?.label === 'string' && state.label.trim()
        ? state.label.trim()
        : `State ${index + 1}`;
    const renderId = `${rawId || key(label).replace(/[^a-z0-9]+/g, '-') || 'state'}:${index}`;
    for (const alias of [rawId, label]) {
      const aliasKey = key(alias);
      if (aliasKey && !aliases.has(aliasKey)) aliases.set(aliasKey, renderId);
    }
    return { ...state, id: rawId, label, renderId };
  });
  const safeTransitions = transitions.flatMap((transition): RenderTransition[] => {
    const from = aliases.get(key(transition?.from));
    const to = aliases.get(key(transition?.to));
    if (!from || !to) return [];
    return [
      {
        ...transition,
        from,
        to,
        label: typeof transition.label === 'string' ? transition.label : '',
      },
    ];
  });
  return { states: safeStates, transitions: safeTransitions };
}

export function StateMachine({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  states,
  transitions,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const [hot, setHot] = useState<string | null>(null);
  // Per-instance marker id so two state machines in one answer don't share `dg-sm-arrow`.
  const arrowId = `dg-sm-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;
  const graph = useMemo(
    () => normalizeGraph(states ?? [], transitions ?? []),
    [states, transitions],
  );

  // Build positions: honour explicit x/y per state, fall back to adaptive ring layout.
  const pos = useMemo(() => {
    const n = Math.max(1, graph.states.length);
    const ring = ringPositions(n, VB / 2, VB / 2);
    const m: Record<string, { x: number; y: number }> = {};
    graph.states.forEach((s, i) => {
      m[s.renderId] = Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x!, y: s.y! } : ring[i];
    });
    return m;
  }, [graph.states]);

  // The label decides the node, not the other way round: a state is named by the model, and
  // "Orientation Flight" does not fit an 11-unit circle drawn for "Idle". Wrap each label to two
  // lines against the ring's own spacing, then grow the shared radius to hold the widest line —
  // capped so neighbours on the ring never touch, at which point the label breaks into more lines
  // rather than the circle swallowing its neighbour.
  const layout = useMemo(() => {
    const n = graph.states.length;
    const base = adaptiveRadius(n);
    // Half the chord between ring neighbours, less air: the most a circle may grow to.
    const ringR = n <= 4 ? 32 : 32 + (n - 4) * 3;
    const chord = n > 1 ? 2 * ringR * Math.sin(Math.PI / n) : 2 * ringR;
    const cap = Math.max(base, chord / 2 - 2.5);
    const maxLineW = 2 * (cap - LABEL_PAD) * 0.92;
    const lines: Record<string, string[]> = {};
    let widest = 0;
    for (const st of graph.states) {
      const fit = fitText(st.label, {
        maxWidth: maxLineW,
        fontSize: LABEL_FS,
        minFontSize: LABEL_FS,
        maxLines: LABEL_MAX_LINES,
        bold: true,
      });
      lines[st.renderId] = fit.lines;
      for (const line of fit.lines)
        widest = Math.max(widest, estimateTextWidth(line, LABEL_FS, true));
    }
    const R = Math.min(cap, Math.max(base, widest / 2 + LABEL_PAD));
    return { R, lines };
  }, [graph.states]);
  const R = layout.R;

  // Compute curved/straight edge geometry, correctly separating bidirectional pairs.
  const edges = useMemo(
    () => computeEdgeLayout(graph.transitions, pos, R),
    [graph.transitions, pos, R],
  );

  // Fit the viewBox to the actual node spread (plus room for labels, the start stub and
  // arrowheads) instead of a fixed 100×100 square. A two-state machine then renders as a
  // compact wide figure rather than a giant square of mostly-empty space, and the unit→px
  // scale (so the font size) stays sane regardless of how the states are arranged.
  const viewBox = useMemo(() => {
    const pts = graph.states.map((s) => pos[s.renderId]).filter(Boolean) as {
      x: number;
      y: number;
    }[];
    if (pts.length === 0) return `0 0 ${VB} ${VB}`;
    const pad = R + 16;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - minX;
    const h = Math.max(...ys) + pad - minY;
    return `${minX} ${minY} ${w} ${h}`;
  }, [graph.states, pos, R]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="dg-sm" onMouseLeave={() => setHot(null)}>
        <svg viewBox={viewBox} className="dg-sm-svg" role="img" aria-label={title}>
          <defs>
            <marker id={arrowId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="dg-sm-arrowhead" />
            </marker>
          </defs>

          {edges.map((edge) => (
            <g key={edge.key}>
              <path d={edge.d} className="dg-sm-edge" fill="none" markerEnd={arrow} />
              {edge.label && (
                <text x={edge.lx} y={edge.ly} className="dg-sm-elbl" textAnchor={edge.labelAnchor}>
                  {edge.label}
                </text>
              )}
            </g>
          ))}

          {graph.states.map((s) => {
            const p = pos[s.renderId];
            if (!p) return null;
            return (
              <g
                key={s.renderId}
                onMouseEnter={() => setHot(s.renderId)}
                className={'dg-sm-state' + (hot === s.renderId ? ' on' : '')}
              >
                {s.start && (
                  <line
                    x1={p.x - R - 7}
                    y1={p.y}
                    x2={p.x - R}
                    y2={p.y}
                    className="dg-sm-edge"
                    markerEnd={arrow}
                  />
                )}
                <circle cx={p.x} cy={p.y} r={R} className="dg-sm-circ" />
                {s.final && <circle cx={p.x} cy={p.y} r={R - 2.4} className="dg-sm-circ-inner" />}
                <text
                  x={p.x}
                  y={p.y - ((layout.lines[s.renderId].length - 1) * LABEL_LINE_H) / 2 + 1.4}
                  className="dg-sm-lbl"
                  textAnchor="middle"
                >
                  {layout.lines[s.renderId].map((line, k) => (
                    <tspan key={k} x={p.x} dy={k === 0 ? 0 : LABEL_LINE_H}>
                      {line}
                    </tspan>
                  ))}
                  {layout.lines[s.renderId].length > 1 && <title>{s.label}</title>}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
