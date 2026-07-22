import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ZoneLadderProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ZoneLadderProps & { delay?: number };

// What each metric is called in the chip, so the ranges read in the right unit.
const METRIC_LABEL: Record<NonNullable<ZoneLadderProps['metric']>, string> = {
  HR: 'Heart rate',
  pace: 'Pace',
  RPE: 'Perceived effort',
};

// The cool→hot ramp a zone band takes by its FRACTION up the ladder (0 = easiest, 1 = hardest).
// Five stops mirror the canonical Zone 1→5 colouring (recovery blue → endurance teal → tempo
// green → threshold amber → VO2max red) and are interpolated for any zone count via color-mix,
// so a 3- or 7-zone ladder still spans the full easy→max spectrum rather than clustering.
const RAMP = ['var(--insight)', '#10b981', 'var(--presence)', 'var(--warning)', 'var(--danger)'];

/** The band colour for a zone at fractional position f (0..1) up the ladder. */
function zoneColor(f: number): string {
  const span = RAMP.length - 1;
  const pos = Math.max(0, Math.min(span, f * span));
  const lo = Math.floor(pos);
  const hi = Math.min(span, lo + 1);
  const t = pos - lo;
  if (t === 0) return RAMP[lo];
  // mix the two neighbouring stops by the remainder, so colour climbs smoothly with intensity
  return `color-mix(in oklab, ${RAMP[hi]} ${Math.round(t * 100)}%, ${RAMP[lo]})`;
}

// A training intensity-zone ladder: stacked bands from Zone 1 (easy, bottom) to the hardest (top),
// each with its measured range, the felt effort, and what it trains, under a cool→hot ramp. The
// "you are here" marker is COMPUTED from `current` (the zone index) — the colours and the marker are
// read off the data, never invented. Distinct from a generic gauge: these are named training zones.
export function ZoneLadder({
  title = 'Training zones',
  icon = 'spark',
  iconColor = 'var(--presence)',
  metric = 'HR',
  zones,
  current,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const list = zones ?? [];
  const n = list.length;
  // clamp the marker into range; -1 means "no current zone, draw none"
  const active =
    typeof current === 'number' && n > 0 ? Math.max(0, Math.min(n - 1, Math.round(current))) : -1;
  const metricName = METRIC_LABEL[metric] ?? metric;

  // Render hardest → easiest so Zone 1 sits at the bottom, the way an effort ladder is drawn.
  const rows = list.map((z, i) => ({ z, i })).reverse();

  return (
    <div
      className="card reveal lay-zl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
          <span className="lay-zl-metric">{metricName}</span>
        </div>
      )}

      <div className="lay-zl-ladder">
        {rows.map(({ z, i }) => {
          // fraction up the ladder by intensity: 0 for the easiest zone, 1 for the hardest
          const f = n > 1 ? i / (n - 1) : 0;
          const color = zoneColor(f);
          const here = i === active;
          return (
            <div
              key={i}
              className={'lay-zl-band' + (here ? ' here' : '')}
              style={{ ['--zc' as string]: color } as CSSProperties}
            >
              <div className="lay-zl-rail" aria-hidden="true" />
              <div className="lay-zl-band-body">
                <div className="lay-zl-band-top">
                  <span className="lay-zl-name">{z.name}</span>
                  <span className="lay-zl-range tab-num">{z.range}</span>
                  {here && (
                    <span className="lay-zl-here">
                      <span className="lay-zl-here-dot" aria-hidden="true" />
                      You are here
                    </span>
                  )}
                </div>
                <div className="lay-zl-effort">{z.effort}</div>
                <div className="lay-zl-purpose">{z.purpose}</div>
              </div>
            </div>
          );
        })}
      </div>

      {caption && <div className="lay-zl-caption faint">{caption}</div>}

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
