// PlasmidMap — a circular plasmid vector map. The backbone lives in OrbitDiagram's own fixed
// 200×200 viewBox; base position maps directly to angle around a single ring (bp 0 at 12
// o'clock, increasing bp sweeping clockwise) rather than OrbitDiagram's "one ring per body" —
// a plasmid is one circular molecule, not a set of nested orbits. Genes and other features draw
// as a colored arc along their bp span (an optional strand arrow shows transcription direction);
// restriction sites are radial tick + enzyme-name marks; the origin of replication gets its own
// marker. Every label shares OrbitDiagram's label-spacing problem — here on one ring instead of
// separate radii — so two angularly-close labels alternate a near/far tier instead of colliding.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlasmidMapProps, PlasmidFeature, PlasmidSite, PlasmidFeatureKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PlasmidMapProps & { delay?: number };

const CX = 100;
const CY = 100;
const R_BACKBONE = 72;
const R_TICK_IN = R_BACKBONE - 7;
const R_TICK_OUT = R_BACKBONE + 7;
const R_LABEL_NEAR = R_BACKBONE + 16;
const R_LABEL_FAR = R_BACKBONE + 30;
// A label whose angular neighbor sits within this many degrees moves to the far tier — a plasmid
// with dense features/sites still reads (near-empty gaps get the near tier; crowded runs
// alternate) rather than every name colliding at one radius.
const COLLISION_DEG = 11;

const KIND_COLOR: Record<PlasmidFeatureKind, string> = {
  gene: 'var(--presence)',
  promoter: 'var(--insight)',
  terminator: 'var(--warning)',
  marker: 'var(--danger)',
};

const NAME_MAX = 11;
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

function polar(deg: number, r: number): { x: number; y: number } {
  const ang = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) };
}

interface LabelSpec {
  key: string;
  deg: number;
  text: string;
  color: string;
  bold?: boolean;
}

/** Places every label at the near tier by default; a label within `COLLISION_DEG` of the
 *  previous one (in angular order) moves to the far tier so the two don't overlap. Bounded,
 *  single pass — O(n log n) for the sort plus one linear walk. */
function placeLabels(labels: LabelSpec[]): (LabelSpec & { r: number })[] {
  const sorted = [...labels].sort((a, b) => a.deg - b.deg);
  const placed: (LabelSpec & { r: number })[] = [];
  let lastNearDeg: number | null = null;
  for (const l of sorted) {
    const near = lastNearDeg === null || Math.abs(l.deg - lastNearDeg) >= COLLISION_DEG;
    placed.push({ ...l, r: near ? R_LABEL_NEAR : R_LABEL_FAR });
    if (near) lastNearDeg = l.deg;
  }
  return placed;
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
  const arrowId = `pm-arrow-${useId().replace(/:/g, '')}`;

  const safeSize = Number.isFinite(sizeBp) && sizeBp > 0 ? sizeBp : 1;
  const safeFeatures = useMemo(() => (Array.isArray(features) ? features : []), [features]);
  const safeSites = useMemo(() => (Array.isArray(sites) ? sites : []), [sites]);

  const featureArcs = useMemo(
    () =>
      safeFeatures.map((f: PlasmidFeature, i) => {
        const startDeg = bpToDeg(safeNum(f.startBp), safeSize);
        const endDeg = bpToDeg(safeNum(f.endBp), safeSize);
        const span = (((endDeg - startDeg) % 360) + 360) % 360;
        const large = span > 180 ? 1 : 0;
        const s = polar(startDeg, R_BACKBONE);
        const t = polar(endDeg, R_BACKBONE);
        const kind: PlasmidFeatureKind =
          f.kind === 'promoter' || f.kind === 'terminator' || f.kind === 'marker' ? f.kind : 'gene';
        const name = typeof f.name === 'string' && f.name ? f.name : `Feature ${i + 1}`;
        const midDeg = (startDeg + span / 2) % 360;
        return {
          key: `f${i}`,
          s,
          t,
          large,
          color: KIND_COLOR[kind],
          name,
          midDeg,
          strand: f.strand,
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
        {/* Horizontal padding in the viewBox: labels at the 3-o'clock / 9-o'clock extremes anchor
            start/end and run outward past the ring, so a square 0..200 box clips the longest ones at
            the card edge. The extra ±20 gives them room; preserveAspectRatio keeps the ring circular. */}
        <svg viewBox="-20 0 240 200" className="pm-svg" role="img" aria-label={title}>
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="4.4"
              markerHeight="4.4"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="pm-arrowhead" />
            </marker>
          </defs>

          <circle cx={CX} cy={CY} r={R_BACKBONE} className="pm-backbone" />

          {featureArcs.map((f) => (
            <path
              key={f.key}
              d={`M ${f.s.x} ${f.s.y} A ${R_BACKBONE} ${R_BACKBONE} 0 ${f.large} 1 ${f.t.x} ${f.t.y}`}
              fill="none"
              stroke={f.color}
              className="pm-feature"
              markerEnd={f.strand === 'plus' ? `url(#${arrowId})` : undefined}
              markerStart={f.strand === 'minus' ? `url(#${arrowId})` : undefined}
            />
          ))}

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
            const p = polar(l.deg, l.r);
            const ux = (p.x - CX) / (l.r || 1);
            const anchor = ux > 0.2 ? 'start' : ux < -0.2 ? 'end' : 'middle';
            const short = truncate(l.text, NAME_MAX);
            return (
              <text
                key={l.key}
                x={p.x}
                y={p.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                className={l.bold ? 'pm-label pm-label-bold' : 'pm-label'}
                fill={l.color}
              >
                {short !== l.text && <title>{l.text}</title>}
                {short}
              </text>
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
