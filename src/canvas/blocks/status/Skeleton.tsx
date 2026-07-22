import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SkeletonProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SkeletonProps & { delay?: number };

export function Skeleton({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  variant = 'list',
  rows = 4,
  loadedLabel = 'Preview loaded',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // default = shimmering (loading) — looks intentional in the revealed state
  const [loaded, setLoaded] = useState(false);
  const n = Math.max(1, Math.min(8, rows));

  return (
    <div
      className={`card reveal sk-card ${loaded ? 'loaded' : 'loading'}`}
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <button type="button" className="sk-toggle" onClick={() => setLoaded((v) => !v)}>
          {loaded ? <Icon.undo className="ic" /> : <Icon.play className="ic" />}
          {loaded ? 'Reload' : 'Load'}
        </button>
      </div>

      <div className="sk-stage">
        {variant === 'chart' && (
          <div className="sk-chart">
            <div className="sk-bars">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className="sk-bar"
                  style={{ ['--h' as string]: 30 + ((i * 37) % 60) + '%' } as CSSProperties}
                />
              ))}
            </div>
            <div className="sk-line sk-w40" />
          </div>
        )}

        {variant === 'profile' && (
          <div className="sk-profile">
            <span className="sk-avatar" />
            <div className="sk-stack">
              <span className="sk-line sk-w60" />
              <span className="sk-line sk-w40" />
            </div>
          </div>
        )}

        {variant === 'media' && (
          <div className="sk-media">
            <span className="sk-thumb" />
            <span className="sk-thumb" />
            <span className="sk-thumb" />
          </div>
        )}

        {(variant === 'list' || variant === 'profile' || variant === 'media') &&
          Array.from({ length: n }).map((_, i) => (
            <div className="sk-row" key={i}>
              <span className="sk-chip" />
              <div className="sk-stack">
                <span className="sk-line sk-w80" />
                <span className="sk-line sk-w50" />
              </div>
              <span className="sk-pill" />
            </div>
          ))}
      </div>

      {loaded && <div className="sk-loaded-note dim">{loadedLabel}</div>}

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
