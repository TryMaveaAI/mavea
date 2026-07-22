// LogicGates — a digital-logic circuit. Inputs feed a network of standard gate symbols
// (AND/OR/NOT/NAND/NOR/XOR/XNOR) wired input→output; each wire is coloured by the signal it
// carries (green = 1, muted = 0), and an optional adjacent truth table highlights the row that
// matches the live inputs. Gate outputs are EVALUATED here from the input values — never
// authored — and gates are ranked by dependency depth so the layout always flows left→right and
// edges land correctly. The model supplies only the inputs, the gates, and how they wire up.
import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { LogicGatesProps, LogicGate, LogicGateKind, LogicInput } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LogicGatesProps & { delay?: number };

// ── geometry (viewBox units) ──
const COL_W = 34; // horizontal gap between dependency ranks
const ROW_H = 26; // vertical gap between sources in a rank
const GATE_W = 22; // gate body width
const GATE_H = 18; // gate body height
const PAD_X = 22; // room for the input rail on the left
const PAD_Y = 16;

interface Placed {
  id: string;
  /** Pin centre where wires leave this source. */
  x: number;
  y: number;
  /** Current logic level on the source's output. */
  value: 0 | 1;
}

/** Evaluate one gate from its already-resolved input values. NOT/buffers read the first input. */
function evalGate(kind: LogicGateKind, vals: (0 | 1)[]): 0 | 1 {
  const all1 = vals.length > 0 && vals.every((v) => v === 1);
  const any1 = vals.some((v) => v === 1);
  const ones = vals.reduce<number>((a, v) => a + v, 0);
  const odd = ones % 2 === 1;
  switch (kind) {
    case 'AND':
      return all1 ? 1 : 0;
    case 'NAND':
      return all1 ? 0 : 1;
    case 'OR':
      return any1 ? 1 : 0;
    case 'NOR':
      return any1 ? 0 : 1;
    case 'XOR':
      return odd ? 1 : 0;
    case 'XNOR':
      return odd ? 0 : 1;
    case 'NOT':
      return vals[0] === 1 ? 0 : 1;
    default:
      return 0;
  }
}

/** Gate body outline + the bubble for inverting gates, centred on the gate origin. */
function gateBody(kind: LogicGateKind): ReactNode {
  const inverting = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const base = kind === 'NAND' ? 'AND' : kind === 'NOR' ? 'OR' : kind === 'XNOR' ? 'XOR' : kind;
  const hw = GATE_W / 2;
  const hh = GATE_H / 2;
  let shape: ReactNode;
  if (base === 'AND' || kind === 'NOT') {
    if (kind === 'NOT') {
      // a triangle (buffer) — the bubble makes it an inverter
      shape = <polygon points={`${-hw},${-hh} ${-hw},${hh} ${hw - 2},0`} fill="none" />;
    } else {
      // a D-shape: flat left, semicircular right
      shape = (
        <path
          d={`M ${-hw},${-hh} L 0,${-hh} A ${hh},${hh} 0 0 1 0,${hh} L ${-hw},${hh} Z`}
          fill="none"
        />
      );
    }
  } else {
    // OR / XOR: a curved-back shield. XOR adds a second back arc.
    const back = `M ${-hw},${-hh} Q ${-hw + 5},0 ${-hw},${hh}`;
    shape = (
      <>
        {(base === 'XOR' || kind === 'XOR') && (
          <path d={`M ${-hw - 3},${-hh} Q ${-hw + 2},0 ${-hw - 3},${hh}`} fill="none" />
        )}
        <path d={`${back} Q ${-2},${hh} ${hw - 1},0 Q ${-2},${-hh} ${-hw},${-hh} Z`} fill="none" />
      </>
    );
  }
  return (
    <g className="dg-lg-gate-body">
      {shape}
      {inverting && <circle cx={hw + 1.4} cy={0} r={1.6} fill="none" className="dg-lg-bubble" />}
    </g>
  );
}

const wireClass = (v: 0 | 1): string => (v === 1 ? 'dg-lg-wire on' : 'dg-lg-wire');

// The output pin label (e.g. "Y", but the model can send anything up to "CARRY_OUT") sits
// centred on the pin at the SVG's right edge. A fixed slack only ever fit a 1-2 char label —
// anything longer bled past the viewBox (and the card's overflow:hidden clipped it). Reserve
// enough right-margin for the label's actual rendered width instead, from the same 4.6px bold
// .dg-lg-pin metrics, and cap it so a pathological label degrades to an ellipsis rather than
// blowing the layout up.
const PIN_CHAR_W = 3.1; // approx advance width of .dg-lg-pin (4.6px, weight 700) per glyph
const PIN_LABEL_MAX = 10; // longest label rendered in full before truncating with an ellipsis

function fitPinLabel(label: string): string {
  return label.length > PIN_LABEL_MAX ? label.slice(0, PIN_LABEL_MAX - 1).trimEnd() + '…' : label;
}

export function LogicGates({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  inputs,
  gates,
  output,
  truth,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const arrowId = `dg-lg-${useId().replace(/:/g, '')}`;

  // Resolve every source's value + position. Inputs sit on the left rail; gates are ranked by
  // dependency depth so each lands a column to the right of its deepest input.
  const { placed, viewW, viewH, outValue, outY, outLabel, outX } = useMemo(() => {
    const byId = new Map<string, Placed>();
    const gateById = new Map<string, LogicGate>(gates.map((g) => [g.id, g]));

    // Inputs on rank 0, stacked.
    inputs.forEach((inp: LogicInput, i) => {
      byId.set(inp.id, { id: inp.id, x: PAD_X, y: PAD_Y + i * ROW_H, value: inp.value ?? 0 });
    });

    // Depth of a gate = 1 + max depth of its sources (inputs are depth 0). Memoised with a
    // guard against malformed cycles.
    const depthCache = new Map<string, number>();
    const inStack = new Set<string>();
    const depthOf = (id: string): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const g = gateById.get(id);
      if (!g) return 0; // an input
      if (inStack.has(id)) return 0; // cycle guard
      inStack.add(id);
      const d = 1 + Math.max(0, ...g.inputs.map((s) => depthOf(s)));
      inStack.delete(id);
      depthCache.set(id, d);
      return d;
    };

    let maxDepth = 0;
    for (const g of gates) maxDepth = Math.max(maxDepth, depthOf(g.id));

    // Group gates by rank, then stack within a rank.
    const byRank = new Map<number, LogicGate[]>();
    for (const g of gates) {
      const d = depthOf(g.id);
      if (!byRank.has(d)) byRank.set(d, []);
      byRank.get(d)!.push(g);
    }

    // Resolve gate values in rank order so every source is known when a gate is evaluated.
    for (let rank = 1; rank <= maxDepth; rank++) {
      const col = byRank.get(rank) ?? [];
      col.forEach((g, i) => {
        const srcVals = g.inputs.map((s) => byId.get(s)?.value ?? 0);
        const value = evalGate(g.kind, srcVals);
        byId.set(g.id, {
          id: g.id,
          x: PAD_X + rank * COL_W,
          y: PAD_Y + i * ROW_H + (rank % 2) * 4, // small stagger so same-rank wires separate
          value,
        });
      });
    }

    const sourceRows = Math.max(inputs.length, ...[...byRank.values()].map((c) => c.length), 1);
    // The output wire/arrowhead always terminates 8 units short of the viewBox edge, regardless
    // of label length — only the viewBox itself grows to fit the label. The pin label is centred
    // on that fixed terminal x, so half its rendered width extends further right than the wire —
    // reserve that on top of the base slack so it can never bleed past the right edge.
    const outLabel = fitPinLabel(output?.label ?? 'Y');
    const labelHalfW = (outLabel.length * PIN_CHAR_W) / 2;
    const baseViewW = PAD_X + (maxDepth + 1) * COL_W + 14;
    const viewW = baseViewW + Math.max(0, labelHalfW - 6);
    const viewH = PAD_Y * 2 + sourceRows * ROW_H;
    const outX = baseViewW - 8;

    const outFrom = output ? byId.get(output.from) : undefined;
    return {
      placed: byId,
      viewW,
      viewH,
      outValue: (outFrom?.value ?? 0) as 0 | 1,
      outY: outFrom?.y ?? PAD_Y,
      outLabel,
      outX,
    };
  }, [inputs, gates, output]);

  // The truth-table row that matches the live inputs (inputs[] order → row[] order).
  const liveKey = inputs.map((inp) => inp.value ?? 0).join('');
  const activeRow = truth?.findIndex((r) => r.row.join('') === liveKey) ?? -1;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      <div className={'dg-lg' + (truth && truth.length ? ' has-truth' : '')}>
        <div className="dg-lg-circuit">
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="dg-lg-svg"
            role="img"
            aria-label={title || 'logic circuit'}
          >
            <defs>
              <marker
                id={arrowId}
                markerWidth="5"
                markerHeight="5"
                refX="4"
                refY="2.5"
                orient="auto"
              >
                <path d="M0,0 L5,2.5 L0,5 Z" className="dg-lg-arrowhead" />
              </marker>
            </defs>

            {/* gate input wires */}
            {gates.map((g) => {
              const gp = placed.get(g.id);
              if (!gp) return null;
              const n = g.kind === 'NOT' ? 1 : g.inputs.length;
              return g.inputs.slice(0, n).map((sid, k) => {
                const sp = placed.get(sid);
                if (!sp) return null;
                // Fan into the gate's left face, spread vertically by pin index.
                const py = gp.y + (k - (n - 1) / 2) * (GATE_H / Math.max(2, n + 0.5));
                const gx = gp.x - GATE_W / 2;
                return (
                  <polyline
                    key={`${g.id}-${sid}-${k}`}
                    points={`${sp.x + 3},${sp.y} ${(sp.x + gx) / 2},${sp.y} ${(sp.x + gx) / 2},${py} ${gx},${py}`}
                    className={wireClass(sp.value)}
                    fill="none"
                  />
                );
              });
            })}

            {/* output wire to the output pin */}
            {output &&
              placed.get(output.from) &&
              (() => {
                const sp = placed.get(output.from)!;
                const ox = outX;
                return (
                  <g>
                    <polyline
                      points={`${sp.x + GATE_W / 2 + 2},${sp.y} ${ox},${sp.y} ${ox},${outY}`}
                      className={wireClass(outValue)}
                      fill="none"
                      markerEnd={`url(#${arrowId})`}
                    />
                    <text x={ox} y={outY - 4} className="dg-lg-pin" textAnchor="middle">
                      {outLabel}
                    </text>
                    <text
                      x={ox}
                      y={outY + 9}
                      className={'dg-lg-bit' + (outValue ? ' on' : '')}
                      textAnchor="middle"
                    >
                      {outValue}
                    </text>
                  </g>
                );
              })()}

            {/* input rail */}
            {inputs.map((inp) => {
              const p = placed.get(inp.id);
              if (!p) return null;
              const v = inp.value ?? 0;
              return (
                <g key={inp.id}>
                  <text x={p.x - 16} y={p.y + 3} className="dg-lg-in-lbl" textAnchor="start">
                    {inp.label}
                  </text>
                  <circle cx={p.x} cy={p.y} r={3.4} className={'dg-lg-pad' + (v ? ' on' : '')} />
                  <text
                    x={p.x}
                    y={p.y + 2.4}
                    className={'dg-lg-bit' + (v ? ' on' : '')}
                    textAnchor="middle"
                  >
                    {v}
                  </text>
                </g>
              );
            })}

            {/* gates */}
            {gates.map((g) => {
              const gp = placed.get(g.id);
              if (!gp) return null;
              return (
                <g key={g.id} transform={`translate(${gp.x} ${gp.y})`}>
                  {gateBody(g.kind)}
                  <text x={0} y={GATE_H / 2 + 6} className="dg-lg-glbl" textAnchor="middle">
                    {g.kind}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {truth && truth.length > 0 && (
          <div className="dg-lg-truth-wrap">
            <table className="dg-lg-truth">
              <thead>
                <tr>
                  {inputs.map((inp) => (
                    <th key={inp.id}>{inp.label}</th>
                  ))}
                  <th className="dg-lg-out-col">{output?.label ?? 'Y'}</th>
                </tr>
              </thead>
              <tbody>
                {truth.map((r, i) => (
                  <tr key={i} className={i === activeRow ? 'on' : undefined}>
                    {r.row.map((b, k) => (
                      <td key={k} className={b ? 'bit on' : 'bit'}>
                        {b}
                      </td>
                    ))}
                    <td className={'bit dg-lg-out-col' + (r.out ? ' on' : '')}>{r.out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {caption && <p className="dg-lg-cap">{caption}</p>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
