import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PregnancyWeekProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PregnancyWeekProps & { delay?: number };

const FULL_TERM = 40; // weeks; the bar measures progress against a full-term pregnancy

// Derive the trimester from the gestational week when the prop is omitted (1–13, 14–27, 28+).
function trimesterFor(week: number): number {
  if (week <= 13) return 1;
  if (week <= 27) return 2;
  return 3;
}

// A week-by-week pregnancy card. The trimester progress bar is computed as week/40, and the fruit
// "to-scale" disc grows with the same fraction (a small base radius plus a span that fills toward
// term) so a later week visibly reads bigger. Length, weight, and milestones are shown verbatim
// from the props — nothing about the baby is invented inside the component.
export function PregnancyWeek({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  week,
  trimester,
  fruitSize,
  lengthCm,
  weightG,
  milestones,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  const w = Math.max(0, Math.min(FULL_TERM, week));
  const pct = (w / FULL_TERM) * 100;
  const tri = trimester ?? trimesterFor(w);
  const weeksToGo = Math.max(0, FULL_TERM - w);

  // The comparison disc scales with gestational progress: a 14px floor up to a ~56px diameter.
  const fruitSizePx = 28 + (w / FULL_TERM) * 28;

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
      {caption && <div className="pw-caption">{caption}</div>}

      <div className="pw-head">
        <div className="pw-week">
          <span className="pw-week-num">{w}</span>
          <span className="pw-week-unit">weeks</span>
        </div>
        <div className="pw-tri">
          <span className="pw-tri-label">Trimester {tri}</span>
          <span className="pw-togo">{weeksToGo} weeks to go</span>
        </div>
      </div>

      <div className="pw-bar" role="progressbar" aria-valuenow={w} aria-valuemax={FULL_TERM}>
        <span className="pw-bar-fill" style={{ width: `${pct}%` }} />
        <span className="pw-bar-marks" aria-hidden>
          <span className="pw-bar-tick" style={{ left: `${(13 / FULL_TERM) * 100}%` }} />
          <span className="pw-bar-tick" style={{ left: `${(27 / FULL_TERM) * 100}%` }} />
        </span>
      </div>
      <div className="pw-bar-legend">
        <span>1st</span>
        <span>2nd</span>
        <span>3rd</span>
      </div>

      {(fruitSize || lengthCm !== undefined || weightG !== undefined) && (
        <div className="pw-stats">
          {fruitSize && (
            <div className="pw-fruit">
              <span
                className="pw-fruit-disc"
                style={{ width: fruitSizePx, height: fruitSizePx }}
                aria-hidden
              />
              <div className="pw-fruit-text">
                <span className="pw-stat-label">Size of a</span>
                <span className="pw-fruit-name">{fruitSize}</span>
              </div>
            </div>
          )}
          <div className="pw-measures">
            {lengthCm !== undefined && (
              <div className="pw-measure">
                <span className="pw-stat-label">Length</span>
                <span className="pw-stat-val">{lengthCm} cm</span>
              </div>
            )}
            {weightG !== undefined && (
              <div className="pw-measure">
                <span className="pw-stat-label">Weight</span>
                <span className="pw-stat-val">{weightG} g</span>
              </div>
            )}
          </div>
        </div>
      )}

      {milestones && milestones.length > 0 && (
        <ul className="pw-milestones">
          {milestones.map((m, i) => (
            <li key={i} className="pw-milestone">
              {m}
            </li>
          ))}
        </ul>
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
