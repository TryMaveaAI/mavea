import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ConfidencemeterProps, ConfidenceSegment } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ConfidencemeterProps & { delay?: number };

const BAND: Record<string, string> = {
  strong: 'var(--insight)',
  partial: 'var(--warning)',
  weak: 'var(--danger)',
  none: 'var(--text-muted)',
};
const BAND_SCORE: Record<string, number> = { strong: 1, partial: 0.6, weak: 0.3, none: 0 };

export function Confidencemeter({
  title,
  icon = 'shield',
  iconColor = 'var(--insight)',
  claim,
  overall,
  segments,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  // default hovered = strongest-contributing segment so the basis shows on reveal
  const def = segments.reduce(
    (best, s, i) => {
      const score = (s.weight || 0) * BAND_SCORE[s.band || 'partial'];
      return score > best.score ? { i, score } : best;
    },
    { i: 0, score: -1 },
  ).i;
  const [hover, setHover] = useState<number>(def);

  const total = segments.reduce((a, s) => a + (s.weight || 0), 0) || 1;
  const derived =
    overall ??
    Math.round(
      (segments.reduce((a, s) => a + (s.weight || 0) * BAND_SCORE[s.band || 'partial'], 0) /
        total) *
        100,
    );
  const headColor =
    derived >= 75 ? 'var(--insight)' : derived >= 45 ? 'var(--warning)' : 'var(--danger)';
  const hs = segments[hover];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {claim && <div className="cm-claim" dangerouslySetInnerHTML={richInnerHtml(claim)} />}

      <div className="insight-stat" style={{ margin: '8px 0 10px' }}>
        {/* the overall confidence figure is the single called-out number */}
        <span className="big tab-num" data-mark="underline" style={{ color: headColor }}>
          {derived}%
        </span>
        <span className="cm-conf-label faint">overall confidence</span>
      </div>

      <div className="cm-track">
        {segments.map((s: ConfidenceSegment, i) => {
          const c = BAND[s.band || 'partial'];
          const w = ((s.weight || 0) / total) * 100;
          const on = hover === i;
          return (
            <button
              key={i}
              className={`cm-seg ${on ? 'on' : ''}`}
              style={{ width: w + '%', ['--c' as string]: c } as CSSProperties}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
      </div>

      <div className="cm-legend">
        {segments.map((s, i) => {
          const c = BAND[s.band || 'partial'];
          const on = hover === i;
          return (
            <button key={i} className={`cm-leg ${on ? 'on' : ''}`} onMouseEnter={() => setHover(i)}>
              <span className="cm-leg-dot" style={{ background: c }} />
              <span className="cm-leg-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {hs && (
        <div
          key={hover}
          className="cm-basis"
          style={{ ['--c' as string]: BAND[hs.band || 'partial'] } as CSSProperties}
        >
          <div className="cm-basis-head">
            <span className="cm-basis-name">{hs.label}</span>
            <span className="cm-basis-band tab-num">
              {Math.round((hs.weight / total) * 100)}% weight
            </span>
          </div>
          {hs.basis && (
            <div className="cm-basis-body" dangerouslySetInnerHTML={richInnerHtml(hs.basis)} />
          )}
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
