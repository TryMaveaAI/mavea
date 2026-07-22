import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EligibilityCheckProps, EligibilityStatus, EligibilityOverall } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EligibilityCheckProps & { delay?: number };

// Per-requirement verdict → accent, badge word, and icon. Pass reads good, fail reads danger,
// needs-info reads caution (a gap we cannot judge from the stated facts yet).
const STATUS: Record<EligibilityStatus, { color: string; label: string; icon: keyof typeof Icon }> =
  {
    pass: { color: 'var(--insight)', label: 'Met', icon: 'check' },
    fail: { color: 'var(--danger)', label: 'Not met', icon: 'x' },
    'needs-info': { color: 'var(--warning)', label: 'Needs info', icon: 'alert' },
  };

// Overall verdict → accent + headline word. Deliberately hedged: "depends" when any requirement
// is still unknown, "likely qualify / do not yet" only when the stated facts actually decide it.
const OVERALL: Record<EligibilityOverall, { color: string; label: string }> = {
  likely: { color: 'var(--insight)', label: 'Likely qualify' },
  'not-yet': { color: 'var(--danger)', label: 'Do not qualify yet' },
  depends: { color: 'var(--warning)', label: 'Depends' },
};

// Rules judged against MY situation: each requirement gets a met / not-met / needs-info verdict
// versus the user's stated facts, the specific gap named, and how to confirm it — then an honest
// overall call and a "verify with the official source" caveat. Distinct from a plain checklist:
// this weighs each rule against real facts rather than just listing what to tick off.
export function EligibilityCheck({
  title,
  icon = 'proof',
  iconColor = 'var(--insight)',
  requirements,
  overall,
  caveat,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  const rules = requirements ?? [];
  const ov = overall ? OVERALL[overall] : undefined;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {ov && (
        <div className="ec-overall" style={{ ['--eo' as string]: ov.color } as CSSProperties}>
          <span className="ec-overall-label">Overall</span>
          <span className="ec-overall-verdict">{ov.label}</span>
        </div>
      )}

      <ul className="ec-list">
        {rules.map((r, i) => {
          const s = STATUS[r.status] ?? STATUS['needs-info'];
          const Si = Icon[s.icon] || Icon.alert;
          return (
            <li key={i} className="ec-row" style={{ ['--es' as string]: s.color } as CSSProperties}>
              <span className="ec-mark">
                <Si className="ec-mark-ic" />
              </span>
              <div className="ec-body">
                <div className="ec-rule-line">
                  <span className="ec-rule">{r.rule}</span>
                  <span className="ec-badge">{s.label}</span>
                </div>
                {r.detail && <div className="ec-detail">{r.detail}</div>}
                {r.fix && (
                  <div className="ec-fix">
                    <span className="ec-fix-tag">
                      {r.status === 'fail' ? 'To qualify' : 'Confirm'}
                    </span>
                    <span>{r.fix}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {caveat && (
        <div className="ec-caveat">
          <Icon.shield className="ec-caveat-ic" />
          <span>{caveat}</span>
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
