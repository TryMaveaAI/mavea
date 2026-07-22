// GelLane — a gel electrophoresis readout: vertical lane tracks on a dark, UV-lit backdrop
// (the gel's own visual identity stays fixed on either theme, the same reasoning as SkyChart's
// night dome — see styles.css), each carrying blurred bands positioned/shaded straight from the
// caller's own migration + intensity readings. An optional ladder lane runs first with size
// ticks placed by a log scale of the caller's marker sizes — a label LAYOUT, not a fabricated
// curve — since real double-stranded DNA/protein migration is roughly log-linear with size.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GelLaneProps, GelLaneRow, GelLadder } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GelLaneProps & { delay?: number };

const H = 220;
const WELL_Y = 4;
const WELL_H = 6;
const TRACK_TOP = 14; // just below the well
const TRACK_BOTTOM = H - 6;
const SAMPLE_W = 40;
const LADDER_W = 70;

interface SafeBand {
  pos: number;
  intensity: number;
  sizeLabel: string | null;
}

function toSafeBand(raw: unknown): SafeBand | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const posRaw = o.pos;
  const intRaw = o.intensity;
  if (typeof posRaw !== 'number' || !Number.isFinite(posRaw)) return null;
  if (typeof intRaw !== 'number' || !Number.isFinite(intRaw)) return null;
  const pos = Math.max(0, Math.min(1, posRaw));
  const intensity = Math.max(0, Math.min(1, intRaw));
  const sizeLabel =
    typeof o.sizeLabel === 'string' && o.sizeLabel.trim() ? o.sizeLabel.trim() : null;
  return { pos, intensity, sizeLabel };
}

function trackY(pos: number): number {
  return TRACK_TOP + pos * (TRACK_BOTTOM - TRACK_TOP);
}

/** Log-scaled tick positions for the ladder's marker sizes — larger fragments migrate least, so
 *  they sit near the well; smaller fragments run furthest. Ties/degenerate ranges fall back to
 *  an even spread rather than dividing by zero. */
function ladderTicks(marks: unknown): { value: number; y: number }[] {
  const values = (Array.isArray(marks) ? marks : [])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a); // largest (least migration) first
  if (values.length === 0) return [];
  const lo = Math.log10(values[values.length - 1]);
  const hi = Math.log10(values[0]);
  const span = hi - lo;
  const padTop = TRACK_TOP + 6;
  const padBottom = TRACK_BOTTOM - 6;
  return values.map((v, i) => {
    const frac =
      span > 0 ? (hi - Math.log10(v)) / span : values.length > 1 ? i / (values.length - 1) : 0.5;
    return { value: v, y: padTop + frac * (padBottom - padTop) };
  });
}

function SampleLane({ lane, index }: { lane: GelLaneRow; index: number }) {
  const label =
    typeof lane?.label === 'string' && lane.label.trim() ? lane.label.trim() : `Lane ${index + 1}`;
  const bands = (Array.isArray(lane?.bands) ? lane.bands : [])
    .map(toSafeBand)
    .filter((b): b is SafeBand => b !== null);

  return (
    <div
      className="c2-gel-lane m-fade-rise m-stagger-item"
      style={{ ['--i' as string]: index } as CSSProperties}
    >
      <svg
        viewBox={`0 0 ${SAMPLE_W} ${H}`}
        width={SAMPLE_W}
        height={H}
        className="c2-gel-lane-svg"
        role="img"
        aria-label={`${label} lane`}
      >
        <rect
          x={2}
          y={WELL_Y}
          width={SAMPLE_W - 4}
          height={WELL_H}
          rx={1.5}
          className="c2-gel-well"
        />
        {bands.map((b, i) => (
          <rect
            key={i}
            x={4}
            y={trackY(b.pos) - 2.5}
            width={SAMPLE_W - 8}
            height={5}
            rx={2.5}
            className="c2-gel-band"
            style={{
              fill: `color-mix(in oklab, var(--gel-band) ${(b.intensity * 92).toFixed(0)}%, transparent)`,
              opacity: 0.35 + b.intensity * 0.65,
            }}
          />
        ))}
      </svg>
      <div className="c2-gel-lane-label">{label}</div>
      {bands.some((b) => b.sizeLabel) && (
        <div className="c2-gel-lane-sizes faint">
          {bands
            .filter((b) => b.sizeLabel)
            .map((b) => b.sizeLabel)
            .join(', ')}
        </div>
      )}
    </div>
  );
}

function LadderLane({ ladder }: { ladder: GelLadder }) {
  const ticks = ladderTicks(ladder.marks);
  const unit = ladder.unit === 'kDa' ? 'kDa' : 'bp';
  return (
    <div className="c2-gel-lane c2-gel-ladder">
      <svg
        viewBox={`0 0 ${LADDER_W} ${H}`}
        width={LADDER_W}
        height={H}
        className="c2-gel-lane-svg"
        role="img"
        aria-label="Size ladder"
      >
        <rect x={2} y={WELL_Y} width={16} height={WELL_H} rx={1.5} className="c2-gel-well" />
        {ticks.map((t, i) => (
          <g
            key={i}
            className="m-fade-rise m-stagger-item"
            style={{ ['--i' as string]: i } as CSSProperties}
          >
            <line x1={3} y1={t.y} x2={14} y2={t.y} className="c2-gel-tick" />
            <text x={18} y={t.y + 3} className="c2-gel-tick-lbl">
              {t.value.toLocaleString()} {unit}
            </text>
          </g>
        ))}
      </svg>
      <div className="c2-gel-lane-label">Ladder</div>
    </div>
  );
}

export function GelLane({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  ladder,
  lanes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const safeLanes = Array.isArray(lanes) ? lanes : [];
  const hasLadder =
    !!ladder &&
    typeof ladder === 'object' &&
    Array.isArray(ladder.marks) &&
    ladder.marks.length > 0;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeLanes.length === 0 && !hasLadder ? (
        <p className="c2-gel-empty faint">No lanes to show.</p>
      ) : (
        <div className="c2-gel-panel">
          <div className="c2-gel-scroll">
            {hasLadder && <LadderLane ladder={ladder!} />}
            {safeLanes.map((lane, i) => (
              <SampleLane key={i} lane={lane} index={i} />
            ))}
          </div>
        </div>
      )}

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
