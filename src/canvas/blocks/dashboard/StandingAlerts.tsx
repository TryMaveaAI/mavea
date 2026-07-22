// StandingAlerts — the tripwires you set, each shown as WATCHING / CLEAR / TRIGGERED (or AWAITING
// when there's no real value to check yet). A triggered row is your own stated reversal condition
// breaking — the one thing the dashboard exists to tell you.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StandingAlertsProps } from './types';
import { alertAccent, alertLabel } from './alertTone';

type Props = StandingAlertsProps & { delay?: number };

export function StandingAlerts({
  title = 'Standing alerts',
  icon = 'bell',
  iconColor = 'var(--warning)',
  alerts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  return (
    <div
      className="card reveal dash-alerts"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {alerts.length === 0 ? (
        <div className="dash-alerts-empty faint">No standing alerts.</div>
      ) : (
        <div className="dash-alerts-list">
          {alerts.map((a, i) => (
            <div
              className="dash-alert-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="dash-alert-dot" style={{ background: alertAccent(a.state) }} />
              <span className="dash-alert-label">{a.label}</span>
              <span className="dash-alert-state" style={{ color: alertAccent(a.state) }}>
                {a.status ?? alertLabel(a.state)}
              </span>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="dash-foot">{footer}</div>}
    </div>
  );
}
