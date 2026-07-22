import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatPercent } from '../../lib/format';
import type { MoonNight, MoonPhaseProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MoonPhaseProps & { delay?: number };

// The moon disk lives in a 100×100 viewBox; the disk is centred with this radius.
const CX = 50;
const CY = 50;
const R = 42;

/**
 * The lit region of the moon, as an SVG path, computed FAITHFULLY from the illuminated fraction.
 *
 * The terminator (the day/night boundary we see) is the projection of a great circle, so on the
 * flat disk it reads as a half-ellipse whose horizontal semi-axis shrinks from R (new/full edge)
 * to 0 (at quarter) and back. The lit shape is the limb arc on the bright side joined to that
 * terminator ellipse. `waxing` puts the bright limb on the right; waning mirrors it to the left.
 */
function litPath(fraction: number, waxing: boolean): string {
  const f = Math.min(1, Math.max(0, fraction));
  // Terminator semi-axis: |1 - 2f| ⇒ 1 at the extremes, 0 at the half (a straight line).
  const rx = R * Math.abs(1 - 2 * f);
  // The bright limb is a half-circle on the lit side; sweep direction follows that side.
  const limbSweep = waxing ? 1 : 0;
  const topY = CY - R;
  const botY = CY + R;
  // Past the half phase (f > 0.5) the terminator bulges toward the dark side (gibbous → the ellipse
  // arcs the same way as the limb); before it (crescent) the ellipse arcs back across the centre.
  const termSweep = f > 0.5 ? limbSweep : 1 - limbSweep;
  return (
    `M ${CX} ${topY} ` +
    // outer limb on the bright side, top → bottom
    `A ${R} ${R} 0 0 ${limbSweep} ${CX} ${botY} ` +
    // terminator ellipse back to the top
    `A ${rx} ${R} 0 0 ${termSweep} ${CX} ${topY} Z`
  );
}

// A tiny inline moon glyph for an upcoming night, sized to its own illuminated fraction.
function MiniMoon({ night, gradId }: { night: MoonNight; gradId: string }) {
  const waxing = true; // upcoming-strip glyphs read left→right as a waxing sequence
  return (
    <svg viewBox="0 0 100 100" className="mp-mini-svg" role="img" aria-hidden>
      <circle cx={CX} cy={CY} r={R} className="mp-dark" />
      <path d={litPath(night.illumination, waxing)} fill={`url(#${gradId})`} className="mp-lit" />
      <circle cx={CX} cy={CY} r={R} className="mp-rim" />
    </svg>
  );
}

export function MoonPhase({
  title,
  icon = 'moon',
  iconColor = 'var(--presence)',
  illumination,
  waxing = true,
  phaseName,
  date,
  upcoming,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.moon;
  // Per-instance gradient ids so two moons in one answer never share a def.
  const uid = useId().replace(/:/g, '');
  const gradId = `mp-lit-${uid}`;
  const miniGrad = `mp-mini-${uid}`;

  const frac = Math.min(1, Math.max(0, Number.isFinite(illumination) ? illumination : 0));
  const nights = (upcoming || []).filter((n) => Number.isFinite(n.illumination)).slice(0, 7);

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

      <div className="mp-main">
        <div className="mp-diskwrap">
          <svg
            viewBox="0 0 100 100"
            className="mp-svg"
            role="img"
            aria-label={phaseName || 'Moon phase'}
          >
            <defs>
              {/* A soft sheen across the lit face so the disk reads as a sphere, not a flat patch. */}
              <radialGradient id={gradId} cx="42%" cy="38%" r="72%">
                <stop offset="0%" stopColor="var(--mp-glow-hi)" />
                <stop offset="70%" stopColor="var(--mp-glow)" />
                <stop offset="100%" stopColor="var(--mp-glow-lo)" />
              </radialGradient>
              <radialGradient id={miniGrad} cx="42%" cy="38%" r="72%">
                <stop offset="0%" stopColor="var(--mp-glow-hi)" />
                <stop offset="100%" stopColor="var(--mp-glow)" />
              </radialGradient>
            </defs>
            {/* the shadowed disk */}
            <circle cx={CX} cy={CY} r={R} className="mp-dark" />
            {/* the lit region — its shape IS the answer (computed from illumination) */}
            <path
              d={litPath(frac, waxing)}
              fill={`url(#${gradId})`}
              className="mp-lit"
              data-mark="point"
            />
            {/* the limb, drawn last so it edges both lit + dark cleanly */}
            <circle cx={CX} cy={CY} r={R} className="mp-rim" />
          </svg>
        </div>

        <div className="mp-info">
          {phaseName && <div className="mp-phase">{phaseName}</div>}
          <div className="mp-illum">
            <span className="mp-illum-v">{formatPercent(frac)}</span>
            <span className="mp-illum-k">illuminated</span>
          </div>
          <div className="mp-side">{waxing ? 'Waxing · growing' : 'Waning · shrinking'}</div>
          {date && <div className="mp-date">{date}</div>}
        </div>
      </div>

      {nights.length > 0 && (
        <div className="mp-upcoming">
          {nights.map((n, i) => (
            <div key={i} className="mp-night">
              <MiniMoon night={n} gradId={miniGrad} />
              <span className="mp-night-date">{n.date}</span>
              <span className="mp-night-pct">{formatPercent(n.illumination)}</span>
            </div>
          ))}
        </div>
      )}

      {caption && <p className="mp-caption">{caption}</p>}
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
