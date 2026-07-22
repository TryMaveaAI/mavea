import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { CrossSectionProps, CrossLayer } from './types';
import { richInnerHtml } from '../../../lib/richText';

/** The shared icon-component type (every entry in the `Icon` map renders the same way). */
type IconComp = (typeof Icon)[IconKey];

type Props = CrossSectionProps & { delay?: number };

// Accent cycle for untinted layers — warm-to-cool so successive strata read as distinct.
const ACCENTS = [
  'var(--warning)',
  'var(--danger)',
  'var(--presence)',
  'var(--insight)',
  'var(--presence-deep)',
  'var(--insight-soft)',
] as const;

const tint = (layer: CrossLayer, i: number): string => layer.color ?? ACCENTS[i % ACCENTS.length];

// Band/ring labels are plain SVG text with no wrap — a model-authored name longer than the demo
// fixture's ("Crust", "Epidermis") runs past the viewBox edge. Cap it to a conservative character
// budget sized for the label font and the room between the leader tip and the edge, same idiom
// as FreeBodyDiagram/EtymTree; the full name is preserved via a native <title> tooltip.
const BAND_LABEL_MAX_CHARS = 20;
const RING_LABEL_MAX_CHARS = 16;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Horizontal layout: a banded column on the left, leader labels on the right.
const HW = 320;
const HTOP = 8;
const BAND_X = 14;
const BAND_W = 116; // width of the stratum column
const LABEL_X = BAND_W + BAND_X + 30; // where leader labels begin
const MIN_BAND = 26; // floor so a thin layer's label still fits

// Concentric layout: nested rings drawn into a square.
const CVB = 240;
const CCX = CVB / 2;
const CCY = CVB / 2;
const CR = 104; // outer radius

export function CrossSection({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  layers = [],
  orientation = 'horizontal',
  depthUnit,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const model = useMemo(() => {
    const clean = layers.filter((l) => l.thickness > 0);
    const total = clean.reduce((s, l) => s + l.thickness, 0) || 1;
    return { clean, total };
  }, [layers]);

  // ── concentric (planet interior): outer→inner nested rings sized by thickness share ──
  if (orientation === 'concentric') {
    let r = CR;
    const rings = model.clean.map((l, i) => {
      const outer = r;
      const inner = Math.max(0, r - (l.thickness / model.total) * CR);
      r = inner;
      const midR = (outer + inner) / 2;
      return { layer: l, i, outer, inner, midR };
    });
    const VB = CVB;
    // Ring labels stack down the right edge at a fixed vertical offset per ring — fine for a
    // handful of layers, but with 8+ the fixed 18-unit step ran labels off the bottom of the
    // viewBox and crowded them illegibly. Spread them across the actual usable band instead
    // (top margin to bottom margin), capped so a small ring count doesn't space labels out
    // absurdly far from their leader's origin.
    const RING_LABEL_TOP = 10;
    const RING_LABEL_BOTTOM = VB - 10;
    const ringLabelStep =
      rings.length > 1
        ? Math.min(18, (RING_LABEL_BOTTOM - RING_LABEL_TOP) / (rings.length - 1))
        : 18;
    return (
      <Shell
        title={title}
        Ic={Ic}
        iconColor={iconColor}
        caption={caption}
        footer={footer}
        delay={delay}
      >
        <div className="lr-xs-wrap">
          <svg
            viewBox={`0 0 ${VB} ${VB}`}
            className="lr-xs-svg lr-xs-svg--ring"
            role="img"
            aria-label={title}
          >
            {/* Outer→inner so inner discs sit on top. */}
            {rings.map((ring) => (
              <circle
                key={`ring${ring.i}`}
                cx={CCX}
                cy={CCY}
                r={ring.outer}
                fill={`color-mix(in oklab, ${tint(ring.layer, ring.i)} ${28 + ring.i * 6}%, var(--surface-default))`}
                stroke={tint(ring.layer, ring.i)}
                className="lr-xs-ring"
              />
            ))}
            {/* Leader from each ring band out to a right-side label. */}
            {rings.map((ring) => {
              const ly = RING_LABEL_TOP + ring.i * ringLabelStep;
              return (
                <g key={`lbl${ring.i}`}>
                  <line
                    x1={CCX}
                    y1={CCY - ring.midR}
                    x2={CVB - 8}
                    y2={ly}
                    className="lr-xs-leader"
                  />
                  <text x={CVB - 6} y={ly + 3} className="lr-xs-ring-lbl" textAnchor="end">
                    {ring.layer.name.length > RING_LABEL_MAX_CHARS && (
                      <title>{ring.layer.name}</title>
                    )}
                    {truncate(ring.layer.name, RING_LABEL_MAX_CHARS)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <LayerLegend layers={model.clean} depthUnit={depthUnit} total={model.total} />
      </Shell>
    );
  }

  // ── horizontal stratified section: stacked bands sized by thickness, with a depth axis ──
  // Use a minimum band height so a thin stratum's leader label still fits, then scale the rest.
  const minTotal = model.clean.length * MIN_BAND;
  const freeH = Math.max(0, 56 * model.clean.length); // target visual height budget above the mins
  let cursorY = HTOP;
  let cumDepth = 0;
  const bands = model.clean.map((l, i) => {
    const share = l.thickness / model.total;
    const h = MIN_BAND + share * freeH;
    const band = { layer: l, i, y: cursorY, h, depthTop: cumDepth };
    cursorY += h;
    cumDepth += l.thickness;
    return band;
  });
  const totalH = cursorY + 10;
  const VB_H = Math.max(totalH, minTotal + HTOP + 10);

  return (
    <Shell
      title={title}
      Ic={Ic}
      iconColor={iconColor}
      caption={caption}
      footer={footer}
      delay={delay}
    >
      <div className="lr-xs-wrap">
        <svg viewBox={`0 0 ${HW} ${VB_H}`} className="lr-xs-svg" role="img" aria-label={title}>
          {/* Depth axis along the left edge of the column. */}
          {depthUnit && (
            <>
              <line x1={BAND_X - 6} y1={HTOP} x2={BAND_X - 6} y2={cursorY} className="lr-xs-axis" />
              {bands.map((b) => (
                <g key={`d${b.i}`}>
                  <line
                    x1={BAND_X - 9}
                    y1={b.y}
                    x2={BAND_X - 3}
                    y2={b.y}
                    className="lr-xs-axis-tick"
                  />
                  <text x={BAND_X - 11} y={b.y + 3} className="lr-xs-depth" textAnchor="end">
                    {formatValue(b.depthTop)}
                  </text>
                </g>
              ))}
              <text
                x={BAND_X - 9}
                y={cursorY + 4}
                className="lr-xs-depth lr-xs-depth--last"
                textAnchor="end"
              >
                {formatValue(cumDepth)}
              </text>
            </>
          )}

          {/* Strata bands. */}
          {bands.map((b) => {
            const col = tint(b.layer, b.i);
            return (
              <g key={`band${b.i}`}>
                <rect
                  x={BAND_X}
                  y={b.y}
                  width={BAND_W}
                  height={b.h}
                  rx={2}
                  fill={`color-mix(in oklab, ${col} 30%, var(--surface-default))`}
                  stroke={col}
                  className="lr-xs-band"
                />
                {/* Leader line out to the label. */}
                <line
                  x1={BAND_X + BAND_W}
                  y1={b.y + b.h / 2}
                  x2={LABEL_X - 6}
                  y2={b.y + b.h / 2}
                  className="lr-xs-leader"
                />
                <text x={LABEL_X} y={b.y + b.h / 2 - 1} className="lr-xs-band-name">
                  {b.layer.name.length > BAND_LABEL_MAX_CHARS && <title>{b.layer.name}</title>}
                  {truncate(b.layer.name, BAND_LABEL_MAX_CHARS)}
                </text>
                {b.layer.note && (
                  <text x={LABEL_X} y={b.y + b.h / 2 + 12} className="lr-xs-band-note">
                    {b.layer.note.length > BAND_LABEL_MAX_CHARS && <title>{b.layer.note}</title>}
                    {truncate(b.layer.note, BAND_LABEL_MAX_CHARS)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {depthUnit && (
        <p className="lr-xs-unit">
          Depth in {depthUnit} · total {formatValue(model.total, { unit: depthUnit })}
        </p>
      )}
    </Shell>
  );
}

/** Side legend used for the concentric view (where notes don't fit on the rings themselves). */
function LayerLegend({
  layers,
  depthUnit,
  total,
}: {
  layers: CrossLayer[];
  depthUnit?: string;
  total: number;
}) {
  if (layers.every((l) => !l.note) && !depthUnit) return null;
  return (
    <ul className="lr-xs-legend">
      {layers.map((l, i) => (
        <li key={i} className="lr-xs-leg-row">
          <span className="lr-xs-leg-dot" style={{ background: tint(l, i) }} aria-hidden="true" />
          <span className="lr-xs-leg-name">{l.name}</span>
          {depthUnit && (
            <span className="lr-xs-leg-thick">{formatValue(l.thickness, { unit: depthUnit })}</span>
          )}
          {l.note && <span className="lr-xs-leg-note">{l.note}</span>}
        </li>
      ))}
      {depthUnit && (
        <li className="lr-xs-leg-row lr-xs-leg-row--total">
          <span className="lr-xs-leg-dot lr-xs-leg-dot--ghost" aria-hidden="true" />
          <span className="lr-xs-leg-name">Total</span>
          <span className="lr-xs-leg-thick">{formatValue(total, { unit: depthUnit })}</span>
        </li>
      )}
    </ul>
  );
}

/** Shared card chrome so both orientations render the same eyebrow / caption / footer. */
function Shell({
  title,
  Ic,
  iconColor,
  caption,
  footer,
  delay,
  children,
}: {
  title: string;
  Ic: IconComp;
  iconColor: string;
  caption?: string;
  footer?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {children}
      {caption && <p className="lr-xs-cap">{caption}</p>}
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
