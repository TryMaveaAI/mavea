// Live sports scoreboard: away/home teams, scores, and status, with live games highlighted.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { ScoreboardProps } from '../data/conversation';

type Props = ScoreboardProps & { delay?: number };

export function Scoreboard({
  title = 'Around the league',
  icon = 'bell',
  iconColor = 'var(--presence-soft)',
  games,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  // The live/hot game is the flagged emphasis; if none, the first game is the authored lead.
  const salientIdx = Math.max(
    0,
    games.findIndex((g) => g.hot),
  );
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <ul className="score-list">
        {games.map((g, i) => (
          <li
            key={i}
            className={'game' + (g.hot ? ' hot' : '')}
            data-mark={i === salientIdx ? 'circle' : undefined}
            style={{ '--ti': i } as CSSProperties}
          >
            <div className="g-rows">
              <div className="g-team">
                <span className="g-name">{g.away}</span>
                <span className="g-score tab-num">{g.as}</span>
              </div>
              <div className="g-team">
                <span className="g-name">{g.home}</span>
                <span className="g-score tab-num">{g.hs}</span>
              </div>
            </div>
            <span className={'g-status' + (g.hot ? ' live' : '')}>
              {g.hot && <span className="live-dot" />}
              {g.status}
            </span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
