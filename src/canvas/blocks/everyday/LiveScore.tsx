import { type CSSProperties, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { LiveScoreProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LiveScoreProps & { delay?: number };

// An interactive scorekeeper: tap +/- on each side and the ranking recomputes live, leader
// highlighted. For game night, classroom points, or trivia — the user drives it, nothing is invented.
export function LiveScore({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  entries,
  unit,
  step = 1,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const base = entries ?? [];
  const [scores, setScores] = useState<number[]>(() => base.map((e) => Number(e.score) || 0));
  const bump = (i: number, d: number) =>
    setScores((s) => s.map((v, j) => (j === i ? Math.max(0, v + d) : v)));

  const ranked = base.map((e, i) => ({ e, i, v: scores[i] ?? 0 })).sort((a, b) => b.v - a.v);
  const lead = ranked.length ? ranked[0].v : 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ul className="lvs-list">
        {ranked.map(({ e, i, v }, rank) => {
          const leadRow = v === lead && v > 0;
          const color = e.color || 'var(--presence)';
          return (
            <li
              key={i}
              className={'lvs-row m-stagger-item m-fade-rise' + (leadRow ? ' lead' : '')}
              style={{ ['--i' as string]: rank } as CSSProperties}
            >
              <span className="lvs-rank">{rank + 1}</span>
              <span
                className="lvs-dot"
                style={{ background: color } as CSSProperties}
                aria-hidden="true"
              />
              <span className="lvs-name">{e.name}</span>
              <span className="lvs-score">
                {v}
                {unit ? <span className="lvs-unit"> {unit}</span> : null}
              </span>
              <span className="lvs-btns">
                <button
                  type="button"
                  className="lvs-btn"
                  aria-label={`Subtract ${step} from ${e.name}`}
                  onClick={() => bump(i, -step)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="lvs-btn lvs-btn--add"
                  aria-label={`Add ${step} to ${e.name}`}
                  onClick={() => bump(i, step)}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

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
