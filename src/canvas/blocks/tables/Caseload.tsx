import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { CaseloadProps, CaseRiskLevel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CaseloadProps & { delay?: number };

const RISK_SET = new Set<CaseRiskLevel>(['low', 'medium', 'high']);
const RISK_COLOR: Record<CaseRiskLevel, string> = {
  low: 'var(--insight)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
};

/** Missing/garbage risk reads as genuinely unscored (a dash), not a silent "low" — a caseworker
 *  triaging a list needs to know the difference between "checked, low risk" and "not yet
 *  assessed", the same reasoning DataDictionary's missing-percent dash follows. */
function toRisk(v: unknown): CaseRiskLevel | null {
  return typeof v === 'string' && RISK_SET.has(v as CaseRiskLevel) ? (v as CaseRiskLevel) : null;
}

// A social-worker caseload: one row per client (a case reference or initials — this is
// confidentiality-sensitive data, never a full name), a risk-flag badge banded like a risk
// matrix (low/medium/high), and the next scheduled contact. Social work, case management —
// "where does each case stand, and who needs attention first".
export function Caseload({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  cases,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const list = Array.isArray(cases) ? cases : [];
  const valid = list.filter(
    (c) => typeof c?.clientRef === 'string' && c.clientRef.trim().length > 0,
  );

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No cases on this list" />
      ) : (
        <div className="csl-list">
          {valid.map((c, i) => {
            const risk = toRisk(c.riskLevel);
            return (
              <div
                key={`${c.clientRef}-${i}`}
                className="csl-row m-stagger-item m-fade-rise"
                style={
                  {
                    ['--i' as string]: i,
                    ['--csl-c' as string]: risk ? RISK_COLOR[risk] : 'var(--line-strong)',
                  } as CSSProperties
                }
              >
                <div className="csl-risk-bar" />
                <div className="csl-body">
                  <div className="csl-top">
                    <span className="csl-ref">{c.clientRef}</span>
                    <span className="csl-status">{c.status || '—'}</span>
                    <span className="csl-spacer" />
                    {risk ? (
                      // Inherits --csl-c from the row wrapper above — same color as the risk bar,
                      // so the badge and the bar never need to be kept in sync separately.
                      <span className="csl-riskbadge">{risk} risk</span>
                    ) : (
                      <span className="csl-riskbadge csl-unscored">unscored</span>
                    )}
                  </div>
                  <div className="csl-meta">
                    {c.nextContact && (
                      <span className="csl-contact">Next contact {c.nextContact}</span>
                    )}
                    {c.note && <span className="csl-note">{c.note}</span>}
                  </div>
                </div>
              </div>
            );
          })}
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
