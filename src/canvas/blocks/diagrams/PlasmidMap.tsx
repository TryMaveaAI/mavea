// PlasmidMap — a circular plasmid vector map. The backbone lives in OrbitDiagram's own fixed
// 200×200 viewBox; base position maps directly to angle around a single ring (bp 0 at 12
// o'clock, increasing bp sweeping clockwise) rather than OrbitDiagram's "one ring per body" —
// a plasmid is one circular molecule, not a set of nested orbits. Genes and other features draw
// as a colored arc along their bp span (an optional strand arrow shows transcription direction);
// restriction sites are radial tick + enzyme-name marks; the origin of replication gets its own
// marker. Every label shares OrbitDiagram's label-spacing problem — here on one ring instead of
// separate radii — so angularly-close labels spread across two radial tiers instead of colliding.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlasmidMapProps, PlasmidFeature, PlasmidSite, PlasmidFeatureKind } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { CX, CY, R_BACKBONE, R_TICK_OUT, placeLabels, polar } from './plasmidLayout';
import type { LabelSpec } from './plasmidLayout';

type Props = PlasmidMapProps & { delay?: number };

const R_TICK_IN = R_BACKBONE - 7;

/** A feature is drawn as a band this thick with an arrowhead this much wider and longer, in the
 *  ring's own units — sized here rather than by a stroke-scaled marker, which blew a 4.4-unit
 *  marker up by the 5-unit stroke into a 22-unit black triangle hanging off the arc. */
const BAND_HALF = 2.5;
const HEAD_HALF = 4.6;
const HEAD_LEN = 6.5;

const KIND_COLOR: Record<PlasmidFeatureKind, string> = {
  gene: 'var(--presence)',
  promoter: 'var(--insight)',
  terminator: 'var(--warning)',
  marker: 'var(--danger)',
};

// Set against the horizontal gutter the viewBox reserves for labels (see the <svg> below): a name
// this long, drawn from the outer tier at 3 o'clock, still lands inside the box.
const NAME_MAX = 13;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** Proper modulo (never negative) — a plasmid is circular, so a bp position outside 0..sizeBp
 *  (a negative offset, or one that overruns the end) wraps around the molecule rather than
 *  landing off the map. */
function wrapBp(bp: number, sizeBp: number): number {
  if (!Number.isFinite(bp) || sizeBp <= 0) return 0;
  return ((bp % sizeBp) + sizeBp) % sizeBp;
}

/** bp → degrees, 0 at 12 o'clock, increasing clockwise. */
function bpToDeg(bp: number, sizeBp: number): number {
  return (wrapBp(bp, sizeBp) / sizeBp) * 360;
}

/** A feature as a filled band along the ring, with an arrowhead at its leading end when it has a
 *  strand. Degrees increase clockwise; a minus-strand feature points back toward its start. */
function featurePath(startDeg: number, span: number, strand: PlasmidFeature['strand']): string {
  const rOut = R_BACKBONE + BAND_HALF;
  const rIn = R_BACKBONE - BAND_HALF;
  const headDeg =
    strand === 'plus' || strand === 'minus'
      ? Math.min(span * 0.6, (HEAD_LEN / R_BACKBONE) * (180 / Math.PI))
      : 0;
  const plus = strand === 'plus';
  // The body runs from `a` to `b` (clockwise); the head, when there is one, sits beyond it.
  const a = plus || headDeg === 0 ? startDeg : startDeg + headDeg;
  const b = plus ? startDeg + span - headDeg : startDeg + span;
  const large = b - a > 180 ? 1 : 0;
  const pt = (deg: number, r: number) => {
    const p = polar(deg, r);
    return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  };
  const outer = `A ${rOut} ${rOut} 0 ${large} 1 ${pt(b, rOut)}`;
  const inner = `A ${rIn} ${rIn} 0 ${large} 0 ${pt(a, rIn)}`;
  if (headDeg === 0) return `M ${pt(a, rOut)} ${outer} L ${pt(b, rIn)} ${inner} Z`;
  const wOut = R_BACKBONE + HEAD_HALF;
  const wIn = R_BACKBONE - HEAD_HALF;
  if (plus) {
    const tip = startDeg + span;
    return `M ${pt(a, rOut)} ${outer} L ${pt(b, wOut)} L ${pt(tip, R_BACKBONE)} L ${pt(b, wIn)} L ${pt(b, rIn)} ${inner} Z`;
  }
  return `M ${pt(a, rOut)} ${outer} L ${pt(b, rIn)} ${inner} L ${pt(a, wIn)} L ${pt(startDeg, R_BACKBONE)} L ${pt(a, wOut)} Z`;
}

function safeNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function PlasmidMap({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  sizeBp,
  features,
  sites,
  origin,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;

  const safeSize = Number.isFinite(sizeBp) && sizeBp > 0 ? sizeBp : 1;
  const safeFeatures = useMemo(() => (Array.isArray(features) ? features : []), [features]);
  const safeSites = useMemo(() => (Array.isArray(sites) ? sites : []), [sites]);

  const featureArcs = useMemo(
    () =>
      safeFeatures.map((f: PlasmidFeature, i) => {
        const startDeg = bpToDeg(safeNum(f.startBp), safeSize);
        const endDeg = bpToDeg(safeNum(f.endBp), safeSize);
        const span = (((endDeg - startDeg) % 360) + 360) % 360;
        const kind: PlasmidFeatureKind =
          f.kind === 'promoter' || f.kind === 'terminator' || f.kind === 'marker' ? f.kind : 'gene';
        const name = typeof f.name === 'string' && f.name ? f.name : `Feature ${i + 1}`;
        const midDeg = (startDeg + span / 2) % 360;
        return {
          key: `f${i}`,
          d: span > 0 ? featurePath(startDeg, span, f.strand) : null,
          color: KIND_COLOR[kind],
          name,
          midDeg,
        };
      }),
    [safeFeatures, safeSize],
  );

  const siteMarks = useMemo(
    () =>
      safeSites.map((site: PlasmidSite, i) => {
        const deg = bpToDeg(safeNum(site.posBp), safeSize);
        const name = typeof site.name === 'string' && site.name ? site.name : `Site ${i + 1}`;
        return { key: `s${i}`, deg, name, cutsOnce: !!site.cutsOnce };
      }),
    [safeSites, safeSize],
  );

  const hasOrigin = !!origin && typeof origin.name === 'string' && origin.name;
  const originDeg = hasOrigin ? bpToDeg(safeNum(origin!.posBp), safeSize) : 0;

  const labels = useMemo(() => {
    const specs: LabelSpec[] = [
      ...featureArcs.map((f) => ({
        key: f.key,
        deg: f.midDeg,
        text: f.name,
        color: f.color,
        bold: true,
      })),
      ...siteMarks.map((s) => ({
        key: s.key,
        deg: s.deg,
        text: s.name,
        color: 'var(--text-secondary)',
        bold: s.cutsOnce,
      })),
      ...(hasOrigin
        ? [
            {
              key: 'origin',
              deg: originDeg,
              text: origin!.name,
              color: 'var(--presence)',
              bold: true,
            },
          ]
        : []),
    ];
    return placeLabels(specs);
  }, [featureArcs, siteMarks, hasOrigin, originDeg, origin]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pm-wrap">
        {/* Padding in the viewBox: labels at the 3-o'clock / 9-o'clock extremes anchor start/end
            and run outward past the ring, and the ones at 12 / 6 o'clock sit half a line above and
            below it, so a square 0..200 box drops the longest ones off the edge. The gutter holds
            a NAME_MAX-character name drawn from the outer tier; preserveAspectRatio keeps the ring
            circular. The box is 290 wide against .pm-wrap's 580px cap, so one user unit renders as
            two CSS pixels — which is what puts the 5px label type above the legibility floor. */}
        <svg viewBox="-45 -8 290 216" className="pm-svg" role="img" aria-label={title}>
          <circle cx={CX} cy={CY} r={R_BACKBONE} className="pm-backbone" />

          {featureArcs.map((f) =>
            f.d ? <path key={f.key} d={f.d} fill={f.color} className="pm-feature" /> : null,
          )}

          {siteMarks.map((s) => {
            const inner = polar(s.deg, R_TICK_IN);
            const outer = polar(s.deg, R_TICK_OUT);
            return (
              <line
                key={s.key}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={s.cutsOnce ? 'pm-tick pm-tick-unique' : 'pm-tick'}
              />
            );
          })}

          {hasOrigin &&
            (() => {
              const p = polar(originDeg, R_BACKBONE);
              return (
                <circle cx={p.x} cy={p.y} r={3.2} className="pm-origin-dot" data-mark="point" />
              );
            })()}

          {labels.map((l) => {
            const short = truncate(l.text, NAME_MAX);
            return (
              // The tooltip for a truncated name hangs off the wrapping group, not the <text>:
              // nested inside it, it would inherit the label's own few-user-unit font-size.
              <g key={l.key}>
                {short !== l.text && <title>{l.text}</title>}
                {l.moved && (
                  <polyline
                    points={`${l.from.x},${l.from.y} ${l.x + (l.anchor === 'start' ? -1.5 : 1.5)},${l.y}`}
                    className="pm-leader"
                  />
                )}
                <text
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  dominantBaseline="middle"
                  className={l.bold ? 'pm-label pm-label-bold' : 'pm-label'}
                  fill={l.color}
                >
                  {short}
                </text>
              </g>
            );
          })}

          <text x={CX} y={CY - 3} className="pm-center-size" textAnchor="middle">
            {Math.round(safeSize).toLocaleString()}
          </text>
          <text x={CX} y={CY + 10} className="pm-center-unit" textAnchor="middle">
            bp
          </text>
        </svg>
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
