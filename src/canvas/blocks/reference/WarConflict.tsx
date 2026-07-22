import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ConflictSide, KeyBattle, WarConflictProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WarConflictProps & { delay?: number };

/** Sides without an explicit `color` fall back to a fixed sequence so two+ columns are
 *  always visually distinguishable even when the model omits the field entirely. */
const DEFAULT_COLORS: readonly string[] = [
  'var(--presence)',
  'var(--danger)',
  'var(--warning)',
  'var(--text-muted)',
];
const ALLOWED_COLORS = new Set(DEFAULT_COLORS);

function sideColor(side: ConflictSide, i: number): string {
  if (typeof side.color === 'string' && ALLOWED_COLORS.has(side.color)) return side.color;
  return DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

// Historical conflict overview: two (or more) color-coded side columns with their
// leaders, a compact key-battles strip beneath, and an outcome paragraph. Use for
// "tell me about this war/conflict", history-class overviews.
export function WarConflict({
  title,
  icon = 'shield',
  iconColor = 'var(--danger)',
  dates,
  sides,
  keyBattles,
  casualties,
  outcome,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.shield;
  const safeSides: ConflictSide[] = Array.isArray(sides) ? sides : [];
  const safeBattles: KeyBattle[] = Array.isArray(keyBattles) ? keyBattles : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {dates && <div className="wc-dates">{dates}</div>}

      {safeSides.length > 0 && (
        <div className="wc-sides">
          {safeSides.map((s, i) => {
            const c = sideColor(s, i);
            const leaders = Array.isArray(s.leaders) ? s.leaders : [];
            return (
              <div
                key={i}
                className="wc-side m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i, ['--wc-c' as string]: c } as CSSProperties}
              >
                <div className="wc-side-name">{s.name}</div>
                {leaders.length > 0 && (
                  <ul className="wc-leaders">
                    {leaders
                      .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
                      .map((l, j) => (
                        <li key={j} className="wc-leader">
                          {l}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {safeBattles.length > 0 && (
        <div className="wc-battles">
          {safeBattles.map((b, i) => (
            <div key={i} className="wc-battle">
              <span className="wc-battle-dot" aria-hidden="true" />
              <span className="wc-battle-label">{b.label}</span>
              {b.at && <span className="wc-battle-at">{b.at}</span>}
            </div>
          ))}
        </div>
      )}

      {casualties && (
        <div className="wc-stat-row">
          <span className="wc-stat-k">Casualties</span>
          <span className="wc-stat-v">{casualties}</span>
        </div>
      )}

      {outcome && <div className="wc-outcome">{outcome}</div>}

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
