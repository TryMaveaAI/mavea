import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, ticks as niceTicks, niceStep, extent } from '../../lib/scale';
import type { EraTimelineProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EraTimelineProps & { delay?: number };

// viewBox geometry — a wide drawing space (capped by .era-wrap's max-width in CSS) so the fixed-px
// SVG type renders at a sensible on-screen size and bands have room to hold their labels.
const W = 720;
const PAD_L = 96; // room for track labels on the left
const PAD_R = 16;
const PAD_TOP = 20; // year ticks ride above the first track
const ROW_H = 40; // height of one track row (band + breathing room)
const BAND_H = 18; // height of an era band
const AXIS_GAP = 24; // space between the last row and the year axis
const CHAR_W = 5.9; // approx width of one band-label glyph in viewBox units (10px semibold)

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

/** Format a signed year as an era label: negative = BCE, positive = CE. */
function fmtYear(y: number): string {
  if (y < 0) return `${Math.abs(Math.round(y))} BCE`;
  return `${Math.round(y)}`;
}

export function EraTimeline({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  tracks,
  min,
  max,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hot, setHot] = useState<string | null>(null);

  const { sx, yearTicks, domain, H } = useMemo(() => {
    // Gather every time value the data references so the axis spans all of it.
    const all: number[] = [];
    for (const tr of tracks) {
      for (const sp of tr.spans) {
        all.push(sp.start, sp.end);
      }
      for (const ev of tr.events ?? []) all.push(ev.at);
    }
    const ex = extent(all);
    const [d0, d1] =
      min != null && max != null
        ? ([min, max] as [number, number])
        : ex
          ? niceDomain(min ?? ex[0], max ?? ex[1])
          : ([0, 100] as [number, number]);

    const scX = scaleLinear([d0, d1], [PAD_L, W - PAD_R]);
    // Round-number year ticks across the shared axis.
    const yt = niceTicks(d0, d1, niceStep(d1 - d0, 5));
    const height = PAD_TOP + tracks.length * ROW_H + AXIS_GAP;

    return { sx: scX, yearTicks: yt, domain: [d0, d1] as [number, number], H: height };
  }, [tracks, min, max]);

  // Center y of a track row (where its band sits).
  const rowY = (i: number) => PAD_TOP + i * ROW_H + (ROW_H - AXIS_GAP) / 2;
  const axisY = H - AXIS_GAP + 4;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="era-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="era-svg" role="img" aria-label={title}>
          {/* Shared-time gridlines — vertical so synchronous events line up across tracks. */}
          <g className="era-grid">
            {yearTicks.map((t) => (
              <line key={`g${t}`} x1={sx(t)} y1={PAD_TOP - 6} x2={sx(t)} y2={axisY - 4} />
            ))}
          </g>

          {/* Year axis + tick labels along the bottom. */}
          <line x1={PAD_L} y1={axisY - 4} x2={W - PAD_R} y2={axisY - 4} className="era-axis" />
          {yearTicks.map((t) => (
            <text key={`t${t}`} x={sx(t)} y={axisY + 8} className="era-tick" textAnchor="middle">
              {fmtYear(t)}
            </text>
          ))}

          {tracks.map((tr, ti) => {
            const cy = rowY(ti);
            const trackCol = tr.color || PALETTE[ti % PALETTE.length];
            return (
              <g key={`tr${ti}`}>
                {/* Track lane label on the left. */}
                <text x={PAD_L - 8} y={cy + 4} className="era-track-lbl" textAnchor="end">
                  {tr.label}
                </text>

                {/* Era bands: start→end spans positioned by the shared time scale. */}
                {tr.spans.map((sp, si) => {
                  const x0 = sx(Math.max(sp.start, domain[0]));
                  const x1 = sx(Math.min(sp.end, domain[1]));
                  const w = Math.max(x1 - x0, 1.5);
                  const col = sp.color || trackCol;
                  const id = `${ti}-${si}`;
                  const active = hot === id;
                  // How many glyphs fit inside the band; below ~3 the band is too narrow to label
                  // inside, so the name rides above it instead. Inside labels ellipsise to fit.
                  const innerChars = Math.floor((w - 10) / CHAR_W);
                  const inside = innerChars >= 3;
                  const shown = inside
                    ? sp.label.length <= innerChars
                      ? sp.label
                      : sp.label.slice(0, Math.max(1, innerChars - 1)).trimEnd() + '…'
                    : sp.label.length > 16
                      ? sp.label.slice(0, 15).trimEnd() + '…'
                      : sp.label;
                  return (
                    <g
                      key={id}
                      onMouseEnter={() => setHot(id)}
                      onMouseLeave={() => setHot((h) => (h === id ? null : h))}
                    >
                      <rect
                        x={x0}
                        y={cy - BAND_H / 2}
                        width={w}
                        height={BAND_H}
                        rx={3}
                        fill={`color-mix(in oklab, ${col} ${active ? 34 : 22}%, transparent)`}
                        stroke={col}
                        strokeWidth={active ? 1.4 : 1}
                        className="era-band"
                      />
                      {inside ? (
                        <text
                          x={x0 + w / 2}
                          y={cy}
                          className="era-band-lbl"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="var(--text-primary)"
                        >
                          {shown}
                        </text>
                      ) : (
                        <text
                          x={x0 + w / 2}
                          y={cy - BAND_H / 2 - 4}
                          className="era-band-lbl-out"
                          textAnchor="middle"
                          fill={col}
                        >
                          {shown}
                        </text>
                      )}
                      <title>
                        {sp.label}: {fmtYear(sp.start)} – {fmtYear(sp.end)}
                      </title>
                    </g>
                  );
                })}

                {/* Point events: a marker + label at a single moment on the track. */}
                {(tr.events ?? []).map((ev, ei) => {
                  const ex = sx(ev.at);
                  return (
                    <g key={`e${ei}`} className="era-event">
                      <line
                        x1={ex}
                        y1={cy - BAND_H / 2 - 3}
                        x2={ex}
                        y2={cy + BAND_H / 2 + 3}
                        stroke={trackCol}
                        strokeWidth={1}
                      />
                      <circle cx={ex} cy={cy + BAND_H / 2 + 5} r={2.4} fill={trackCol} />
                      <text
                        x={ex}
                        y={cy + BAND_H / 2 + 15}
                        className="era-event-lbl"
                        textAnchor="middle"
                      >
                        {ev.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

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
