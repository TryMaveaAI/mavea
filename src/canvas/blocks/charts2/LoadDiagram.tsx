import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceStep, ticks } from '../../lib/scale';
import type { LoadDiagramProps, ShearPoint, MomentPoint, BeamSupport, BeamLoad } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LoadDiagramProps & { delay?: number };

// SVG logical canvas — viewBox only; CSS sizes it responsively and caps the measure. The three
// panels (beam, shear, moment) share the same horizontal margins so a position lines up vertically
// straight down the figure.
const W = 360;
const ML = 40; // left gutter (V/M tick labels)
const MR = 16;
const plotW = W - ML - MR;

// Panel bands down the canvas: the beam strip sits in its own zone, then the shear and moment plots
// each get an equal plotting band with a label row above. Heights are fixed so the viewBox aspect
// ratio is stable; CSS caps the rendered height on wide cards.
const BEAM = { top: 22, h: 46 }; // beam centreline zone (arrows reach above, supports below)
const PANEL_H = 78; // plotting height of each of the shear / moment panels
const GAP = 30; // label-row gap above each plot panel
const SHEAR_TOP = BEAM.top + BEAM.h + GAP;
const MOMENT_TOP = SHEAR_TOP + PANEL_H + GAP;
const H = MOMENT_TOP + PANEL_H + 36; // separate tick and axis-title rows
// viewBox headroom above the beam: a tall point-load arrow + its value label reach above y=0,
// so start the viewBox a little higher to keep "P = … kN" inside (the card clips overflow).
const VB_TOP = -12;

/** Trim a value to a tidy label: integers stay integers, else up to 2 dp with no float dust. */
function fmt(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return '—';
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return unit ? `${r} ${unit}` : `${r}`;
}

/** A signed series' peak by absolute magnitude — the value engineers size the member against
 *  (V_max, M_max). Returns the first sample of the largest |value|, or null for an empty series. */
function peak<T extends { x: number }>(series: readonly T[], read: (p: T) => number) {
  let best: { x: number; val: number } | null = null;
  for (const p of series) {
    const val = read(p);
    if (!Number.isFinite(val)) continue;
    if (!best || Math.abs(val) > Math.abs(best.val)) best = { x: p.x, val };
  }
  return best;
}

/** A symmetric vertical scale for a signed V/M panel: zero sits on the panel's mid-line and the
 *  series swings up/down by its peak magnitude, so positive and negative areas read honestly. */
function signedScale(maxAbs: number, top: number) {
  const span = maxAbs > 0 ? maxAbs : 1;
  const half = PANEL_H / 2 - 8; // leave headroom so the peak label clears the panel edge
  const mid = top + PANEL_H / 2;
  return {
    mid,
    y: (v: number) => mid - (v / span) * half,
  };
}

// A beam load diagram with its matched shear and bending-moment plots. Three panels share one
// horizontal distance axis (position along the span), so a support, a load, the shear it produces,
// and the resulting moment all line up vertically. The V(x) and M(x) curves are the series the
// caller supplies — the block plots them faithfully rather than solving the statics — but every
// coordinate (supports, load arrows, the shared scale, the polylines, the marked extrema) is
// computed here from the numeric inputs.
export function LoadDiagram({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  span,
  supports,
  loads,
  unit,
  shear = [],
  moment = [],
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const geo = useMemo(() => {
    const L = span > 0 ? span : 1;
    // Shared distance scale: position 0…span across the common plotting width.
    const sx = (x: number) => ML + (Math.max(0, Math.min(L, x)) / L) * plotW;

    // Distance ticks along the bottom axis — round positions across [0, span].
    const xTicks = ticks(0, L, niceStep(L));

    const beamY = BEAM.top + BEAM.h * 0.45; // the beam centreline

    // Largest point-load magnitude scales the arrow length so loads read proportionally.
    const maxPoint = loads.reduce(
      (m, l) => (l.kind === 'point' ? Math.max(m, Math.abs(l.mag)) : m),
      0,
    );

    const vPeak = peak<ShearPoint>(shear, (p) => p.v);
    const mPeak = peak<MomentPoint>(moment, (p) => p.m);

    // Panel scales span the data's full swing (and always include 0) so the zero baseline is honest.
    const vExt = extent(shear.map((p) => p.v)) ?? [0, 0];
    const mExt = extent(moment.map((p) => p.m)) ?? [0, 0];
    const vMaxAbs = Math.max(Math.abs(vExt[0]), Math.abs(vExt[1]));
    const mMaxAbs = Math.max(Math.abs(mExt[0]), Math.abs(mExt[1]));

    const vScale = signedScale(vMaxAbs, SHEAR_TOP);
    const mScale = signedScale(mMaxAbs, MOMENT_TOP);

    return { L, sx, xTicks, beamY, maxPoint, vPeak, mPeak, vScale, mScale };
  }, [span, loads, shear, moment]);

  const { L, sx, xTicks, beamY, maxPoint, vPeak, mPeak, vScale, mScale } = geo;

  // The beam line spans the full width; supports clamp it. A point load draws a downward arrow whose
  // length is proportional to |mag|; a udl draws a band of short arrows over [at, to].
  const arrowLen = (mag: number) => {
    const base = 14;
    const extra = maxPoint > 0 ? (Math.abs(mag) / maxPoint) * 14 : 0;
    return base + extra;
  };

  // Filled-area polygons for the V and M panels — the polyline closed down to the zero mid-line so
  // the signed regions tint, the classic way these diagrams are shaded.
  const fillBelow = (pts: { x: number; y: number }[], mid: number): string => {
    if (pts.length === 0) return '';
    const first = pts[0];
    const last = pts[pts.length - 1];
    const body = pts.map((p) => `${sx(p.x)},${p.y}`).join(' ');
    return `${sx(first.x)},${mid} ${body} ${sx(last.x)},${mid}`;
  };

  const shearPts = shear.map((p) => ({ x: p.x, y: vScale.y(p.v) }));
  const momentPts = moment.map((p) => ({ x: p.x, y: mScale.y(p.m) }));

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c2-ld-wrap">
        <svg
          viewBox={`0 ${VB_TOP} ${W} ${H - VB_TOP}`}
          className="c2-ld-svg"
          role="img"
          aria-label={title}
        >
          {/* Shared vertical guides at each tick + support, tying the three panels together */}
          {xTicks.map((t, i) => (
            <line
              key={`g${i}`}
              className="c2-ld-guide"
              x1={sx(t)}
              y1={BEAM.top + BEAM.h}
              x2={sx(t)}
              y2={MOMENT_TOP + PANEL_H}
            />
          ))}

          {/* ── Panel 1: the beam with supports + loads ── */}
          {/* the beam itself */}
          <line className="c2-ld-beam" x1={sx(0)} y1={beamY} x2={sx(L)} y2={beamY} />

          {/* supports */}
          {supports.map((s, i) => (
            <Support key={`s${i}`} s={s} x={sx(s.at)} y={beamY} />
          ))}

          {/* loads — point arrows and distributed bands */}
          {loads.map((l, i) => (
            <Load
              key={`l${i}`}
              load={l}
              sx={sx}
              beamY={beamY}
              span={L}
              arrowLen={arrowLen}
              unit={unit}
            />
          ))}

          {/* ── Panel 2: shear V(x) ── */}
          <PanelFrame top={SHEAR_TOP} mid={vScale.mid} sx={sx} L={L} label="Shear V(x)" />
          {shearPts.length > 1 && (
            <>
              <polygon className="c2-ld-vfill" points={fillBelow(shearPts, vScale.mid)} />
              <polyline
                className="c2-ld-vline"
                points={shearPts.map((p) => `${sx(p.x)},${p.y}`).join(' ')}
              />
            </>
          )}
          {vPeak && (
            <PeakMark
              x={sx(vPeak.x)}
              y={vScale.y(vPeak.val)}
              mid={vScale.mid}
              label={`Vmax ${fmt(vPeak.val, unit)}`}
            />
          )}

          {/* ── Panel 3: bending moment M(x) ── */}
          <PanelFrame top={MOMENT_TOP} mid={mScale.mid} sx={sx} L={L} label="Moment M(x)" />
          {momentPts.length > 1 && (
            <>
              <polygon className="c2-ld-mfill" points={fillBelow(momentPts, mScale.mid)} />
              <polyline
                className="c2-ld-mline"
                points={momentPts.map((p) => `${sx(p.x)},${p.y}`).join(' ')}
              />
            </>
          )}
          {mPeak && (
            <PeakMark
              x={sx(mPeak.x)}
              y={mScale.y(mPeak.val)}
              mid={mScale.mid}
              label={`Mmax ${fmt(mPeak.val, unit ? `${unit}·m` : undefined)}`}
              accent
            />
          )}

          {/* shared distance axis at the bottom */}
          <line
            className="c2-ld-axis"
            x1={ML}
            y1={MOMENT_TOP + PANEL_H}
            x2={W - MR}
            y2={MOMENT_TOP + PANEL_H}
          />
          {xTicks.map((t, i) => (
            <text
              key={`xt${i}`}
              className="c2-ld-xtick"
              x={sx(t)}
              y={MOMENT_TOP + PANEL_H + 13}
              textAnchor="middle"
            >
              {t}
            </text>
          ))}
          <text className="c2-ld-axlbl" x={ML + plotW / 2} y={H - 3} textAnchor="middle">
            position
          </text>
        </svg>
      </div>

      {caption && <p className="c2-ld-caption">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

/** A support symbol drawn under the beam: a triangle for a pin, a triangle on rollers for a roller,
 *  and a hatched wall for a fixed end. The position is given; the glyph is built from it. */
function Support({ s, x, y }: { s: BeamSupport; x: number; y: number }) {
  const kind = s.kind ?? 'pin';
  if (kind === 'fixed') {
    // A fixed end: a vertical wall with diagonal hatching, on whichever side the support sits.
    const left = x < (ML + (W - MR)) / 2;
    const wx = x + (left ? -6 : 6);
    const hatch = [-14, -7, 0, 7, 14].map((dy, i) => (
      <line
        key={i}
        className="c2-ld-sup"
        x1={wx + (left ? -7 : 7)}
        y1={y + dy - 4}
        x2={wx}
        y2={y + dy + 4}
      />
    ));
    return (
      <g>
        <line className="c2-ld-sup" x1={wx} y1={y - 16} x2={wx} y2={y + 16} />
        {hatch}
      </g>
    );
  }
  // Pin / roller: an isosceles triangle apex at the beam, optionally riding on rollers.
  const tri = `${x},${y} ${x - 8},${y + 14} ${x + 8},${y + 14}`;
  return (
    <g>
      <polygon className="c2-ld-sup-tri" points={tri} />
      {kind === 'roller' ? (
        <>
          <circle className="c2-ld-sup-tri" cx={x - 4} cy={y + 18} r={2.6} />
          <circle className="c2-ld-sup-tri" cx={x + 4} cy={y + 18} r={2.6} />
        </>
      ) : (
        // pin: the hatched ground line under the triangle
        <line className="c2-ld-sup" x1={x - 11} y1={y + 16} x2={x + 11} y2={y + 16} />
      )}
    </g>
  );
}

/** An applied load on the beam: a single downward arrow for a point load (length ∝ |mag|), or a
 *  band of short arrows spanning [at, to] for a uniformly distributed load, with the rate labelled. */
function Load({
  load,
  sx,
  beamY,
  span,
  arrowLen,
  unit,
}: {
  load: BeamLoad;
  sx: (x: number) => number;
  beamY: number;
  span: number;
  arrowLen: (mag: number) => number;
  unit?: string;
}) {
  if (load.kind === 'udl') {
    const x0 = sx(Math.max(0, Math.min(load.at, load.to ?? load.at)));
    const x1 = sx(Math.min(span, Math.max(load.at, load.to ?? load.at)));
    const len = 16;
    const top = beamY - len - 4;
    // Evenly placed arrows across the band — count scales with the band width, bounded for density.
    const n = Math.max(2, Math.min(9, Math.round((x1 - x0) / 16)));
    const arrows = Array.from({ length: n + 1 }, (_, i) => {
      const ax = x0 + ((x1 - x0) * i) / n;
      return <Arrow key={i} x={ax} y0={top + 4} y1={beamY - 2} />;
    });
    return (
      <g>
        {/* the load's top rail */}
        <line className="c2-ld-udl-rail" x1={x0} y1={top} x2={x1} y2={top} />
        {arrows}
        {load.label && (
          <text className="c2-ld-load-lbl" x={(x0 + x1) / 2} y={top - 4} textAnchor="middle">
            {load.label}
          </text>
        )}
      </g>
    );
  }
  // point load: one arrow whose length encodes the magnitude
  const x = sx(load.at);
  const len = arrowLen(load.mag);
  const top = beamY - len - 6;
  return (
    <g>
      <Arrow x={x} y0={top} y1={beamY - 2} bold />
      <text className="c2-ld-load-lbl" x={x} y={top - 4} textAnchor="middle">
        {load.label ?? (unit ? `${load.mag} ${unit}` : `${load.mag}`)}
      </text>
    </g>
  );
}

/** A downward arrow from (x,y0) to (x,y1) with a small head — the universal "force here" glyph. */
function Arrow({ x, y0, y1, bold }: { x: number; y0: number; y1: number; bold?: boolean }) {
  return (
    <g className={bold ? 'c2-ld-arrow c2-ld-arrow--bold' : 'c2-ld-arrow'}>
      <line x1={x} y1={y0} x2={x} y2={y1} />
      <path d={`M ${x - 3} ${y1 - 4} L ${x} ${y1} L ${x + 3} ${y1 - 4}`} />
    </g>
  );
}

/** A V/M panel's frame: its zero baseline (the mid-line the signed curve swings around), a faint
 *  border, and the panel title parked at the top-left. */
function PanelFrame({
  top,
  mid,
  sx,
  L,
  label,
}: {
  top: number;
  mid: number;
  sx: (x: number) => number;
  L: number;
  label: string;
}) {
  return (
    <g>
      <rect className="c2-ld-panel" x={ML} y={top} width={plotW} height={PANEL_H} />
      <line className="c2-ld-baseline" x1={sx(0)} y1={mid} x2={sx(L)} y2={mid} />
      <text className="c2-ld-panel-lbl" x={ML + 42} y={top - 6}>
        {label}
      </text>
    </g>
  );
}

/** Mark a panel's peak: a stem from the baseline to the extreme, a dot, and a value label placed
 *  on the outer side of the curve so it never overlaps the fill. The first such mark carries the
 *  `data-mark` hook so Mavéa's live annotation layer can arrow at the governing value. */
function PeakMark({
  x,
  y,
  mid,
  label,
  accent,
}: {
  x: number;
  y: number;
  mid: number;
  label: string;
  accent?: boolean;
}) {
  const above = y <= mid; // the extreme is above the baseline → label further above
  const labelY = above ? y - 7 : y + 13;
  return (
    <g className={accent ? 'c2-ld-peak c2-ld-peak--accent' : 'c2-ld-peak'}>
      <line className="c2-ld-peak-stem" x1={x} y1={mid} x2={x} y2={y} />
      <circle cx={x} cy={y} r={3} data-mark="point" />
      <text className="c2-ld-peak-lbl" x={x} y={labelY} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
