import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useCountUp } from '../../lib/motion';
import { BlockEmpty } from '../../lib/BlockEmpty';
import { fitText } from '../../lib/fitText';
import type { ParliamentSeatsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParliamentSeatsProps & { delay?: number };

const W = 360;
const H = 196;
const CXP = 180;
const CYP = 176;
const R_OUT = 148;
const R_IN_FRAC = 0.42; // open center — leaves room for the total readout

// Eight-token cycle so even a crowded multi-party chamber keeps distinct wedges.
const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--danger)',
  'var(--insight-soft)',
  'var(--presence-soft)',
  'var(--warning-soft)',
];

// Real national chambers top out around 700–800 seats and still read as individual dots;
// past this we switch to "1 dot ≈ n seats" (declared on the card) rather than drawing
// thousands of sub-pixel circles.
const MAX_DOTS = 900;

/** Largest-remainder apportionment: integer shares of `total` proportional to `weights`. */
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return weights.map(() => 0);
  const quotas = weights.map((w) => (w / sum) * total);
  const out = quotas.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = quotas
    .map((q, i) => ({ i, frac: q - Math.floor(q) }))
    .sort((x, y) => y.frac - x.frac);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

/** Row layout for a hemicycle of `dots` seats: smallest row count whose arcs can hold every
 *  dot without overlap, dot radius derived from the ring spacing so it shrinks smoothly as
 *  the chamber grows. All radii are fractions of the outer radius. */
function packRows(dots: number): { radii: number[]; caps: number[]; dotR: number } {
  for (let rows = 1; rows <= 60; rows++) {
    const ringGap = rows === 1 ? 1 - R_IN_FRAC : (1 - R_IN_FRAC) / (rows - 1);
    const dotR = Math.min(ringGap * 0.42, 0.09);
    const radii: number[] = [];
    const caps: number[] = [];
    for (let i = 0; i < rows; i++) {
      const r = rows === 1 ? (R_IN_FRAC + 1) / 2 : R_IN_FRAC + i * ringGap;
      radii.push(r);
      caps.push(Math.max(1, Math.floor((Math.PI * r) / (dotR * 2.3)) + 1));
    }
    if (caps.reduce((a, b) => a + b, 0) >= dots) return { radii, caps, dotR };
  }
  // Unreachable for dots ≤ MAX_DOTS, but keep a sane shape for safety.
  return { radii: [(R_IN_FRAC + 1) / 2], caps: [dots], dotR: 0.01 };
}

export function ParliamentSeats({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  parties,
  totalLabel = 'seats',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const [focus, setFocus] = useState<number | null>(null);

  const clean = useMemo(
    () =>
      (Array.isArray(parties) ? parties : []).map((p, i) => {
        const o = p && typeof p === 'object' ? (p as unknown as Record<string, unknown>) : {};
        const raw = typeof o.seats === 'number' && Number.isFinite(o.seats) ? o.seats : 0;
        return {
          name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `Party ${i + 1}`,
          seats: Math.max(0, Math.floor(raw)),
          color:
            typeof o.color === 'string' && o.color.trim() ? o.color : PALETTE[i % PALETTE.length],
        };
      }),
    [parties],
  );

  const total = clean.reduce((a, p) => a + p.seats, 0);
  const majority = Math.floor(total / 2) + 1;
  const countUp = useCountUp(total, { delay: (delay || 0) + 200 });

  const model = useMemo(() => {
    if (total <= 0) return null;

    // One dot per seat until the chamber outgrows the arc; then n seats per dot.
    const unit = total > MAX_DOTS ? Math.ceil(total / MAX_DOTS) : 1;
    const dotTotal = unit === 1 ? total : Math.max(1, Math.round(total / unit));
    const perParty =
      unit === 1
        ? clean.map((p) => p.seats)
        : apportion(
            clean.map((p) => p.seats),
            dotTotal,
          );
    const dotCount = perParty.reduce((a, b) => a + b, 0);

    const { radii, caps, dotR } = packRows(dotCount);
    const rowSeats = apportion(caps, dotCount);

    // Every seat position, then a single left→right sweep so each party fills a clean
    // contiguous wedge — the convention every parliament chart reader expects.
    const seats: { x: number; y: number; theta: number }[] = [];
    for (let i = 0; i < radii.length; i++) {
      const n = rowSeats[i];
      const r = radii[i] * R_OUT;
      for (let j = 0; j < n; j++) {
        const theta = n === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (n - 1);
        seats.push({
          x: CXP + r * Math.cos(theta),
          y: CYP - r * Math.sin(theta),
          theta,
        });
      }
    }
    seats.sort((s, t) => t.theta - s.theta || s.y - t.y);

    const partyOfSeat: number[] = [];
    perParty.forEach((n, pi) => {
      for (let k = 0; k < n; k++) partyOfSeat.push(pi);
    });

    const dotPx = dotR * R_OUT;
    return { seats, partyOfSeat, dotPx, unit };
  }, [clean, total]);

  if (!model) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No seats to draw" hint="Each party needs a whole seat count" />
      </div>
    );
  }

  const rInPx = R_IN_FRAC * R_OUT;
  const lineY1 = Math.max(14, CYP - R_OUT - model.dotPx - 3);
  const lineY2 = CYP - rInPx + model.dotPx + 3;
  // Keep a caller-supplied label (default "seats") inside the open center hole: fit it to the
  // hole's clear width at the label's baseline (10px above centre) so a long unit shrinks.
  const labelFit = fitText(totalLabel, {
    maxWidth: 2 * Math.sqrt(Math.max(1, rInPx * rInPx - 100)) - 8,
    fontSize: 9.5,
    minFontSize: 7,
    maxLines: 1,
  });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="prl-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="prl-svg" role="img" aria-label={title}>
          <g className="m-fade-rise">
            {model.seats.map((s, i) => {
              const pi = model.partyOfSeat[i];
              const dim = focus !== null && pi !== focus && pi !== undefined;
              return (
                <circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={model.dotPx}
                  fill={pi !== undefined ? clean[pi].color : 'var(--track)'}
                  opacity={dim ? 0.18 : 1}
                  className="prl-dot"
                />
              );
            })}
          </g>

          {/* majority marker: a thin radial line at the top-center aisle */}
          <line x1={CXP} y1={lineY1} x2={CXP} y2={lineY2} className="prl-maj-line" />
          <text x={CXP} y={Math.max(10, lineY1 - 4)} textAnchor="middle" className="prl-maj-lbl">
            majority {majority.toLocaleString('en-US')}
          </text>

          {/* running total inside the open center */}
          <text x={CXP} y={CYP - 26} textAnchor="middle" className="prl-total">
            {countUp}
          </text>
          <text
            x={CXP}
            y={CYP - 10}
            textAnchor="middle"
            className="prl-total-lbl"
            style={{ fontSize: labelFit.fontSize }}
          >
            {labelFit.lines[0]}
          </text>
        </svg>

        {model.unit > 1 && (
          <div className="prl-note">1 dot ≈ {model.unit.toLocaleString('en-US')} seats</div>
        )}

        <div className="prl-legend">
          {clean.map((p, i) => (
            <button
              key={i}
              type="button"
              className={
                'prl-chip' +
                (focus === i ? ' is-on' : '') +
                (focus !== null && focus !== i ? ' muted' : '')
              }
              onClick={() => setFocus(focus === i ? null : i)}
            >
              <span className="prl-swatch" style={{ background: p.color }} />
              <span className="prl-chip-name">{p.name}</span>
              <span className="prl-chip-n">{p.seats.toLocaleString('en-US')}</span>
            </button>
          ))}
        </div>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
