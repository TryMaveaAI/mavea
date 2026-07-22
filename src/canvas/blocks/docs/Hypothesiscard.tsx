import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HypothesiscardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HypothesiscardProps & { delay?: number };

const DIRECTION_LABEL: Record<NonNullable<HypothesiscardProps['direction']>, string> = {
  'two-tailed': 'two-tailed',
  greater: 'one-tailed · greater',
  less: 'one-tailed · less',
};

// A formal research hypothesis statement — the null and alternative laid out as they'd
// appear in a stats write-up, not the loose free-text `question` researchsummary carries.
// Rejecting the null is evidence FOR the alternative, so once a test has actually run the
// two statements swap emphasis together off one `rejected` verdict rather than each reading
// its own independent badge.
export function Hypothesiscard({
  title = 'Hypothesis Test',
  icon = 'proof',
  iconColor = 'var(--presence)',
  h0,
  h1,
  direction,
  alpha,
  variables,
  rejected,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  const hasVerdict = typeof rejected === 'boolean';
  const iv = variables?.iv;
  const dv = variables?.dv;
  const hasAlpha = typeof alpha === 'number' && Number.isFinite(alpha);
  const dirLabel = direction ? DIRECTION_LABEL[direction] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(iv || dv || hasAlpha) && (
        <div className="hyp-meta">
          {iv && <span className="hyp-meta-chip">IV · {iv}</span>}
          {dv && <span className="hyp-meta-chip">DV · {dv}</span>}
          {hasAlpha && <span className="hyp-meta-chip hyp-alpha tab-num">α = {alpha}</span>}
        </div>
      )}

      <div
        className={
          'hyp-stmt hyp-h0 m-fade-rise m-stagger-item' +
          (hasVerdict ? (rejected ? ' rejected' : ' retained') : '')
        }
        style={{ ['--i' as string]: 0 } as CSSProperties}
      >
        <div className="hyp-stmt-head">
          <span className="hyp-stmt-tag">H₀ · Null hypothesis</span>
          {hasVerdict && (
            <span className="hyp-verdict">
              {rejected ? (
                <Icon.x className="ic hyp-verdict-ic" />
              ) : (
                <Icon.check className="ic hyp-verdict-ic" />
              )}
              {rejected ? 'Rejected' : 'Retained'}
            </span>
          )}
        </div>
        <div className="hyp-stmt-body">{h0}</div>
      </div>

      <div
        className={
          'hyp-stmt hyp-h1 m-fade-rise m-stagger-item' +
          (hasVerdict ? (rejected ? ' supported' : ' unsupported') : '')
        }
        style={{ ['--i' as string]: 1 } as CSSProperties}
      >
        <div className="hyp-stmt-head">
          <span className="hyp-stmt-tag">
            H₁ · Alternative hypothesis
            {dirLabel && <span className="hyp-direction">{dirLabel}</span>}
          </span>
          {hasVerdict && (
            <span className="hyp-verdict">
              {rejected ? (
                <Icon.check className="ic hyp-verdict-ic" />
              ) : (
                <Icon.x className="ic hyp-verdict-ic" />
              )}
              {rejected ? 'Supported' : 'Not supported'}
            </span>
          )}
        </div>
        <div className="hyp-stmt-body">{h1}</div>
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
