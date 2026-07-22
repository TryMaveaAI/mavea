import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StickerChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StickerChartProps & { delay?: number };

// A small 5-point star, centred on its own origin — the earned-day glyph. Icon has no 'star'
// key, and a sticker/reward chart specifically wants a star, not a generic checkmark.
const STAR_D =
  'M0 -5 L1.23 -1.7 L4.76 -1.55 L2 0.65 L2.94 4.05 L0 2.1 L-2.94 4.05 L-2 0.65 L-4.76 -1.55 L-1.23 -1.7 Z';

function Star({ className }: { className: string }) {
  return (
    <svg viewBox="-5 -5 10 10" className={className} aria-hidden="true">
      <path d={STAR_D} />
    </svg>
  );
}

// A behavior/reward chart: one row per person (or a single shared row when `people` is
// omitted), one column per day, a star for each earned day. Skins HabitTracker's
// row/column/cell grid — the completion pattern is the same, the glyph and the reward
// progress meter are what's different here.
export function StickerChart({
  title,
  icon = 'sparkle',
  iconColor = 'var(--warning)',
  behavior,
  people,
  days,
  marks,
  rewardAt,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const safeDays = days ?? [];
  const safeMarks = marks ?? [];
  const isPersonMode = !!people && people.length > 0;
  const rows = isPersonMode ? people! : [''];

  const earnedSet = new Set(
    safeMarks.filter((m) => m.earned).map((m) => `${m.person ?? ''}:${m.day}`),
  );
  const totalEarned = safeMarks.filter((m) => m.earned).length;
  const hasReward = rewardAt !== undefined && rewardAt > 0;
  const rewardPct = hasReward ? Math.min(100, (totalEarned / rewardAt!) * 100) : 0;

  if (safeDays.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div className="sk-note">No days were given for this chart.</div>
      </div>
    );
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {behavior && <div className="sk-behavior">{behavior}</div>}

      <div className="sk-scroll">
        <div
          className={`sk-grid${isPersonMode ? ' sk-grid--labeled' : ''}`}
          style={{ ['--sk-cols' as string]: safeDays.length } as CSSProperties}
        >
          {isPersonMode && <span className="sk-corner" aria-hidden="true" />}
          {safeDays.map((d, i) => (
            <span key={i} className="sk-day">
              {d}
            </span>
          ))}

          {rows.map((row, ri) => (
            <div className="sk-row" key={ri} style={{ display: 'contents' }}>
              {isPersonMode && <span className="sk-person">{row}</span>}
              {safeDays.map((d, di) => {
                const earned = earnedSet.has(`${row}:${d}`);
                return (
                  <span
                    key={di}
                    className={`sk-cell m-stagger-item m-scale-in${earned ? ' earned' : ''}`}
                    style={{ ['--i' as string]: ri * safeDays.length + di } as CSSProperties}
                    title={`${row || title} · ${d}${earned ? ' · earned' : ''}`}
                  >
                    {earned ? <Star className="sk-star" /> : <span className="sk-empty" />}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hasReward && (
        <div className="sk-reward">
          <div className="sk-reward-row">
            <span>Toward the reward</span>
            <span className="tab-num">
              {Math.min(totalEarned, rewardAt!)} of {rewardAt}
            </span>
          </div>
          <div className="sk-reward-bar" role="progressbar" aria-valuenow={Math.round(rewardPct)}>
            <span className="sk-reward-fill" style={{ width: `${rewardPct}%` }} />
          </div>
        </div>
      )}

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
