import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DifferentialProps, DiffLikelihood } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DifferentialProps & { delay?: number };

const BAND: Record<DiffLikelihood, { label: string; color: string }> = {
  common: { label: 'Common', color: 'var(--insight)' },
  'less-common': { label: 'Less common', color: 'var(--warning)' },
  rare: { label: 'Rare', color: 'var(--text-muted)' },
};

// Ranked plausible explanations with HONEST likelihood — never one confident answer. Each cause
// carries the tell-tale that fits, what points elsewhere, and a can't-miss-serious flag. For
// "what could be causing X" (symptoms, a fault, an error) where the uncertainty must stay visible.
export function Differential({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  causes,
  prompt,
  caveat,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;
  const list = causes ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ol className="df-list">
        {list.map((c, i) => {
          const band = c.likelihood ? BAND[c.likelihood] : undefined;
          return (
            <li key={i} className="df-cause">
              <div className="df-head">
                <span className="df-rank">{i + 1}</span>
                <span className="df-name">{c.name}</span>
                {band && (
                  <span
                    className="df-band"
                    style={{ ['--db' as string]: band.color } as CSSProperties}
                  >
                    {band.label}
                  </span>
                )}
                {c.serious && (
                  <span className="df-serious">
                    <Icon.alert className="ic" /> serious
                  </span>
                )}
              </div>
              {c.tell && (
                <div className="df-tell">
                  <span className="df-tag df-tag--fit">Fits if</span> {c.tell}
                </div>
              )}
              {c.pointsAway && (
                <div className="df-away">
                  <span className="df-tag">Points away</span> {c.pointsAway}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {prompt && (
        <div className="df-prompt">
          <Icon.check className="ic" />
          <span>{prompt}</span>
        </div>
      )}
      {caveat && <div className="df-caveat">{caveat}</div>}

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
