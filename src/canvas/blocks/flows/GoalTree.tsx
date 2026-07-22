import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GoalTreeProps } from './types';

type Props = GoalTreeProps & { delay?: number };

const progColor = (p: number) =>
  p >= 70 ? 'var(--insight)' : p >= 40 ? 'var(--warning)' : 'var(--danger)';

export function GoalTree({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  objectives,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  // first objective expanded by default
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  // The objective furthest behind (lowest progress) is the most salient — it's what the
  // conversation naturally calls out first when reviewing goal health.
  const salient = objectives.reduce(
    (idx, o, i) => (o.progress < objectives[idx].progress ? i : idx),
    0,
  );
  const toggle = (i: number) => setOpen((o) => ({ ...o, [i]: !o[i] }));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-goals">
        {objectives.map((o, i) => {
          const isOpen = !!open[i];
          return (
            <div className={'fl-goal' + (isOpen ? ' is-open' : '')} key={o.name}>
              <button className="fl-goal-head" onClick={() => toggle(i)}>
                <Icon.chevR className="ic fl-goal-chev" />
                <div className="fl-goal-headmain">
                  <div className="fl-goal-name">{o.name}</div>
                  {o.owner && <div className="fl-goal-owner">{o.owner}</div>}
                </div>
                <div className="fl-goal-prog">
                  <div className="fl-goal-bar">
                    <div
                      className="fl-goal-fill"
                      style={{ width: o.progress + '%', background: progColor(o.progress) }}
                    />
                  </div>
                  <span
                    className="tab-num fl-goal-pct"
                    data-mark={i === salient ? 'underline' : undefined}
                  >
                    {o.progress}%
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="fl-goal-krs">
                  {o.keyResults.map((kr) => (
                    <div className="fl-kr" key={kr.label}>
                      <div className="fl-kr-top">
                        <span className="fl-kr-label">{kr.label}</span>
                        {kr.target && <span className="fl-kr-target faint">{kr.target}</span>}
                      </div>
                      <div className="fl-kr-bar">
                        <div
                          className="fl-kr-fill"
                          style={{
                            width: kr.progress + '%',
                            background: kr.color || progColor(kr.progress),
                          }}
                        />
                        <span className="fl-kr-pct tab-num">{kr.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
