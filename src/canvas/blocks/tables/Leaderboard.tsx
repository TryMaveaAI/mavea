import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useCountUp } from '../../lib/motion';
import type { LeaderboardProps, LeaderRow } from './types';

type Props = LeaderboardProps & { delay?: number };

const MEDAL = ['var(--warning)', 'var(--text-secondary)', 'var(--presence-soft)'];

// One ranked row, its own component so the metric value can count up on mount — a hook can't be
// called from inside the parent's .map() directly, only from a real component instance per row.
function LbRow({
  r,
  rank,
  value,
  width,
  unit,
  color,
  hot,
  onEnter,
  onLeave,
}: {
  r: LeaderRow;
  rank: number;
  value: number;
  width: number;
  unit: string;
  color: string;
  hot: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const shown = useCountUp(value, { duration: 900, decimals: 0 });
  const move = r.move ?? 0;
  return (
    <div
      className={`lb-row m-stagger-item m-fade-rise ${hot ? 'hot' : ''} ${rank < 3 ? 'podium' : ''}`}
      style={{ ['--i' as string]: rank } as CSSProperties}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="lb-rank" style={rank < 3 ? { color: MEDAL[rank] } : undefined}>
        {rank < 3 ? <span className="lb-medal">●</span> : null}
        {rank + 1}
      </div>
      <div className="lb-body">
        <div className="lb-top">
          <span className="lb-name">{r.name}</span>
          {r.sub && <span className="lb-sub faint">{r.sub}</span>}
          <span className="lb-spacer" />
          <span className="lb-val tab-num" data-mark={rank === 0 ? 'underline' : undefined}>
            {shown}
            {unit}
          </span>
        </div>
        <div className="lb-track">
          <div className="lb-fill" style={{ width: `${width}%`, background: color }} />
        </div>
      </div>
      <div className={`lb-move ${move > 0 ? 'up' : move < 0 ? 'down' : 'flat'}`}>
        {move > 0 ? (
          <Icon.arrowUp />
        ) : move < 0 ? (
          <Icon.arrowDown />
        ) : (
          <span className="lb-dash">–</span>
        )}
        {move !== 0 && <span className="tab-num">{Math.abs(move)}</span>}
      </div>
    </div>
  );
}

export function Leaderboard({
  title,
  icon = 'chart',
  iconColor = 'var(--insight)',
  metrics,
  rows,
  metric = 0,
  accent = 'var(--insight)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [mi, setMi] = useState(Math.max(0, Math.min(metric, metrics.length - 1)));
  const [hover, setHover] = useState<number | null>(null);
  // metrics can be empty → metrics[mi] is undefined; fall back to a safe key
  // so value lookups stay defined (yields 0) instead of throwing on m.key.
  const m = metrics[mi];
  const mKey = m?.key ?? '';

  const ranked = useMemo(() => {
    return [...rows]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (b.r.values[mKey] ?? 0) - (a.r.values[mKey] ?? 0));
  }, [rows, mKey]);
  const max = Math.max(1, ...ranked.map((x) => x.r.values[mKey] ?? 0));

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="tbl-head">
        <div className="card-eyebrow" style={{ marginBottom: 0 }}>
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        {metrics.length > 1 && (
          <div className="seg">
            {metrics.map((mm, i) => (
              <button
                key={mm.key}
                className={`seg-btn ${i === mi ? 'on' : ''}`}
                onClick={() => setMi(i)}
              >
                {mm.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lb">
        {ranked.map(({ r }, rank) => {
          const v = r.values[mKey] ?? 0;
          const w = (v / max) * 100;
          return (
            <LbRow
              key={r.name}
              r={r}
              rank={rank}
              value={v}
              width={w}
              unit={m?.unit || ''}
              color={rank < 3 ? MEDAL[rank] : accent}
              hot={hover === rank}
              onEnter={() => setHover(rank)}
              onLeave={() => setHover(null)}
            />
          );
        })}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
