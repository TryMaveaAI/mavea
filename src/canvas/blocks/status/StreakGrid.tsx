import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StreakgridProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StreakgridProps & { delay?: number };

// Walk the run backwards from today and count consecutive kept days — the live streak.
function tailStreak(done: boolean[]): number {
  let n = 0;
  for (let i = done.length - 1; i >= 0 && done[i]; i--) n++;
  return n;
}

// Longest consecutive run anywhere in the history — the personal best the card backstops with.
function longestStreak(done: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const d of done) {
    run = d ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function StreakGrid({
  title,
  icon = 'spark',
  iconColor = 'var(--warning)',
  habit,
  days,
  current,
  best,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const flags = days.map((d) => d.done === true);
  // Prefer the supplied counters, but compute honest fallbacks from the data so the figures
  // are never invented — current = the live tail run, best = the longest run on record.
  const cur = current != null ? Math.max(0, current) : tailStreak(flags);
  const bst = best != null ? Math.max(cur, best) : Math.max(cur, longestStreak(flags));
  const keptTotal = flags.filter(Boolean).length;
  // The live tail run, for the forgiving "don't break the chain" highlight on recent dots.
  const tail = tailStreak(flags);
  const tailStart = flags.length - tail;

  // Cap the rendered dot row so a long history can't overflow; keep the most recent days
  // (the chain you're protecting), oldest of the window first.
  const MAX_DOTS = 35;
  const window = days.slice(Math.max(0, days.length - MAX_DOTS));
  const windowOffset = days.length - window.length;

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

      <div className="sg-counters">
        <div className="sg-counter sg-counter-cur">
          <span className="sg-counter-n tab-num" data-mark="underline">
            {cur}
          </span>
          <span className="sg-counter-flame" aria-hidden="true">
            <Icon.spark className="ic" />
          </span>
          <span className="sg-counter-label">day streak{habit ? ` · ${habit}` : ''}</span>
        </div>
        <div className="sg-counter sg-counter-best">
          <span className="sg-counter-n tab-num">{bst}</span>
          <span className="sg-counter-label">best ever</span>
        </div>
      </div>

      <div className="sg-grid" aria-hidden="true">
        {window.map((d, i) => {
          const idx = i + windowOffset;
          const inChain = d.done && idx >= tailStart;
          return (
            <span
              key={i}
              className={`sg-dot ${d.done ? 'done' : 'miss'} ${inChain ? 'chain' : ''}`}
              title={d.date ? `${d.date}${d.done ? ' · kept' : ' · missed'}` : undefined}
            />
          );
        })}
      </div>

      <div className="sg-foot">
        <span className="sg-chain-note">
          {cur > 0
            ? caption || `Don’t break the chain — ${cur} and counting`
            : caption || 'A fresh chain starts with one day'}
        </span>
        <span className="sg-kept tab-num faint">
          {keptTotal}/{days.length} days
        </span>
      </div>

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
