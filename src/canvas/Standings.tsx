// Ranked league standings: team, record, and games-back per row.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { StandingsProps } from '../data/conversation';

type Props = StandingsProps & { delay?: number };

export function Standings({
  title = 'Standings',
  icon = 'table',
  iconColor = 'var(--insight)',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <ul className="stand-list">
        {rows.map((s, i) => (
          // rank-1 is the authored lead — Mavéa's gesture underlines the top team
          <li key={i} className="stand" style={{ '--ti': i } as CSSProperties}>
            <span className="stand-rank">{i + 1}</span>
            <span className="stand-team" data-mark={i === 0 ? 'underline' : undefined}>
              {s.team}
            </span>
            <span className="stand-rec tab-num">{s.rec}</span>
            <span className="stand-gb tab-num">{s.gb}</span>
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
