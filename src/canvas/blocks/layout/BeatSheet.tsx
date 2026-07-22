import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { BeatSheetProps, StoryBeat } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BeatSheetProps & { delay?: number };

const W = 320;
const H = 96;
const PAD = { l: 8, r: 8, t: 12, b: 10 };

/**
 * Read a beat's position as a 0..1 fraction of the story. Accepts a percent ("50%"), a bare
 * number treated as a percent when ≤100, or a page form ("p.45", "45") scaled against the last
 * beat's page so the curve still spans the act. Returns null when nothing parses, and the caller
 * falls back to even spacing — never an invented position.
 */
function parseAt(at: string | undefined, maxPage: number): number | null {
  if (!at) return null;
  const m = at.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return null;
  if (at.includes('%')) return Math.min(1, Math.max(0, n / 100));
  if (n <= 100 && !/p/i.test(at)) return Math.min(1, Math.max(0, n / 100));
  return maxPage > 0 ? Math.min(1, Math.max(0, n / maxPage)) : null;
}

export function BeatSheet({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  framework,
  beats,
  tension,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;

  // Compute each beat's x-fraction once: parsed from its `at` where possible, else spread evenly.
  // The tension curve is plotted from those same fractions so the dots and the line agree.
  const geom = useMemo(() => {
    const last = Math.max(1, beats.length - 1);
    const pages = beats
      .map((b) => parseFloat((b.at || '').match(/\d+/)?.[0] || ''))
      .filter((n) => Number.isFinite(n));
    const maxPage = pages.length ? Math.max(...pages) : 0;
    const fracs = beats.map((b, i) => parseAt(b.at, maxPage) ?? i / last);

    const sx = scaleLinear([0, 1], [PAD.l, W - PAD.r]);
    let curve = '';
    let dots: { x: number; y: number }[] = [];
    if (tension && tension.length >= 2) {
      const lo = Math.min(...tension);
      const hi = Math.max(...tension);
      const sy = scaleLinear([lo, hi === lo ? lo + 1 : hi], [H - PAD.b, PAD.t]);
      // Pair each tension reading with a beat fraction (or spread the readings evenly if the
      // counts differ), then draw a smooth curve through the points.
      dots = tension.map((t, i) => {
        const frac = i < fracs.length ? fracs[i] : i / Math.max(1, tension.length - 1);
        return { x: sx(frac), y: sy(t) };
      });
      curve = dots
        .map((p, i) => {
          if (i === 0) return `M ${p.x} ${p.y}`;
          const prev = dots[i - 1];
          const cx = (prev.x + p.x) / 2;
          return `C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
        })
        .join(' ');
    }
    return { fracs, sx, curve, dots, baseY: H - PAD.b };
  }, [beats, tension]);

  return (
    <div
      className="card reveal lay-beat"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {framework && (
        <div className="lay-beat-framework">
          <span className="lay-beat-fw-tag">Structure</span>
          {framework}
        </div>
      )}

      <ol className="lay-beat-list">
        {beats.map((b: StoryBeat, i) => (
          <li className="lay-beat-row" key={i}>
            <div className="lay-beat-rail">
              <span className="lay-beat-dot" />
            </div>
            <div className="lay-beat-body">
              <div className="lay-beat-head">
                <span className="lay-beat-name">{b.name}</span>
                {b.at && <span className="lay-beat-at tab-num">{b.at}</span>}
              </div>
              <div className="lay-beat-line">{b.line}</div>
            </div>
          </li>
        ))}
      </ol>

      {geom.curve && (
        <figure className="lay-beat-curve">
          <figcaption className="lay-beat-curve-cap faint">Dramatic tension</figcaption>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="lay-beat-svg"
            role="img"
            aria-label="tension curve"
          >
            <defs>
              <linearGradient id="lay-beat-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--presence)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--presence)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${geom.curve} L ${geom.dots[geom.dots.length - 1].x} ${geom.baseY} L ${geom.dots[0].x} ${geom.baseY} Z`}
              fill="url(#lay-beat-fill)"
            />
            <path d={geom.curve} className="lay-beat-stroke" fill="none" />
            {geom.dots.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.6} className="lay-beat-pt" />
            ))}
          </svg>
        </figure>
      )}

      {caption && <div className="lay-beat-caption faint">{caption}</div>}

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
