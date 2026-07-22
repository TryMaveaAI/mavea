import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { KpidashboardProps, KpiTile } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = KpidashboardProps & { delay?: number };

// Sparkline geometry — a wide, short strip that fills each tile's footer. Same
// area+polyline idiom as Sparkstat, sized for the smaller KPI tile.
const SW = 132;
const SH = 40;
const SPAD = 4;

/** Pick a token for the delta chip from its direction. 'up'/'good' read positive
 *  (insight), 'down' reads negative (danger) — explicit here so a KPI never inherits
 *  the ambiguous global ".delta.up = warning" mapping where up isn't always good. */
function deltaColor(dir: KpiTile['deltaDir']): string {
  return dir === 'down' ? 'var(--danger)' : 'var(--insight)';
}

function TileSpark({ spark, color }: { spark: number[]; color: string }) {
  // hover index defaults to the last point so the revealed state reads as "current";
  // clamp at 0 so a one-point series doesn't seed a negative index.
  const [hover, setHover] = useState<number>(Math.max(0, spark.length - 1));

  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const span = max - min || 1;
  const x = (i: number) => SPAD + (i / Math.max(1, spark.length - 1)) * (SW - SPAD * 2);
  const y = (v: number) => SH - SPAD - ((v - min) / span) * (SH - SPAD * 2);

  const line = spark.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${SPAD},${SH} ${line} ${SW - SPAD},${SH}`;
  const hi = Math.min(hover, spark.length - 1);
  const gid = `kd-${Math.round(min)}-${Math.round(max)}-${spark.length}`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${SW} ${SH}`}
      className="kd-spark"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* invisible hover columns scrub the active point */}
      {spark.map((_, i) => (
        <rect
          key={i}
          x={x(i) - SW / spark.length / 2}
          y={0}
          width={SW / spark.length}
          height={SH}
          fill="transparent"
          onMouseEnter={() => setHover(i)}
          style={{ cursor: 'pointer' }}
        />
      ))}
      <circle
        cx={x(hi)}
        cy={y(spark[hi])}
        r="2.6"
        fill={color}
        stroke="var(--surface-elevated)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function KpiDashboard({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  tiles,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="kd-grid">
        {tiles.map((t, i) => {
          const dir = t.deltaDir || 'up';
          const dc = deltaColor(dir);
          const spark = t.spark?.filter((n) => Number.isFinite(n)) ?? [];
          return (
            <div key={i} className="kd-tile">
              <div className="kd-tile-label">{t.label}</div>
              <div className="kd-tile-val tab-num">
                {t.value}
                {t.unit && <span className="kd-tile-unit">{t.unit}</span>}
              </div>
              {t.delta && (
                <div className="kd-tile-delta" style={{ color: dc }}>
                  <Icon.arrowUp
                    className="ic"
                    style={{
                      width: 12,
                      height: 12,
                      transform: dir === 'down' ? 'rotate(180deg)' : 'none',
                    }}
                  />
                  <span className="kd-tile-delta-t">{t.delta}</span>
                </div>
              )}
              {spark.length > 1 && (
                <div className="kd-tile-spark">
                  <TileSpark spark={spark} color={dc} />
                </div>
              )}
              {t.conf && <div className="kd-tile-conf faint">{t.conf}</div>}
            </div>
          );
        })}
      </div>

      {caption && <div className="kd-caption faint">{caption}</div>}

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
