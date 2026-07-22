import { type CSSProperties, useMemo } from 'react';
import { Icon } from '../../../icons/icons';
import type { BracketBarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BracketBarProps & { delay?: number };

// Ranked horizontal-bar comparison. Rows are always sorted highest-value first
// so the dominant entry anchors the eye at the top regardless of model ordering.
// The leader bar runs at full var(--presence) saturation; trailing bars step down
// via color-mix to give an immediate hierarchy read without additional chrome.
export function BracketBar({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  metric,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;

  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => b.value - a.value), [items]);

  const maxValue = useMemo(() => sorted.reduce((m, it) => Math.max(m, it.value), 0) || 1, [sorted]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* ── optional metric sub-header ── */}
      {metric && <div className="bb-metric">{metric}</div>}

      {/* ── bar rows ── */}
      <div className="bb-items">
        {sorted.map((entry, i) => {
          const pct = (entry.value / maxValue) * 100;
          const isLeader = i === 0;

          // Leader bar: full presence. Others: progressively mixed toward transparent
          // so the rank hierarchy is readable at a glance without any extra labels.
          const fillStyle: CSSProperties = isLeader
            ? { width: `${pct}%`, background: 'var(--presence)' }
            : {
                width: `${pct}%`,
                background: 'color-mix(in oklab, var(--presence) 85%, transparent)',
              };

          return (
            <div key={i} className="bb-item">
              {/* rank badge or position number */}
              <span className="bb-badge">{entry.badge ?? `${i + 1}`}</span>

              {/* entry label */}
              <span className="bb-label" title={entry.label}>
                {entry.label}
              </span>

              {/* proportional bar */}
              <div className="bb-bar-track" role="presentation">
                {/* Leader bar (i===0) is the sorted maximum — extreme value */}
                <div
                  className="bb-bar-fill"
                  style={fillStyle}
                  {...(isLeader ? { 'data-mark': 'circle' } : {})}
                />
              </div>

              {/* formatted value in monospace */}
              <span
                className="bb-value"
                style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              >
                {entry.bar ?? entry.value}
              </span>
            </div>
          );
        })}
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
