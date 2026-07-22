import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MacroBreakdownProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MacroBreakdownProps & { delay?: number };

export function MacroBreakdown({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  calories,
  protein,
  carbs,
  fat,
  fiber,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatCal = fat * 9;
  const total = proteinCal + carbsCal + fatCal || 1;

  const macros = [
    {
      label: 'Protein',
      value: protein,
      color: 'var(--presence)',
      pct: (proteinCal / total) * 100,
    },
    {
      label: 'Carbs',
      value: carbs,
      color: 'var(--insight)',
      pct: (carbsCal / total) * 100,
    },
    {
      label: 'Fat',
      value: fat,
      color: 'var(--warning)',
      pct: (fatCal / total) * 100,
    },
    ...(fiber !== undefined
      ? [{ label: 'Fiber', value: fiber, color: 'var(--text-muted)', pct: 0 }]
      : []),
  ];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="mb-calorie">
        <span className="mb-cal-num">{calories.toLocaleString()}</span>
        <span className="mb-cal-unit">kcal</span>
      </div>

      <div className="mb-stack">
        {macros.slice(0, 3).map((m, i) => (
          <div
            key={m.label}
            className="mb-stack-seg m-stagger-item m-scale-in"
            style={
              { width: `${m.pct}%`, background: m.color, ['--i' as string]: i } as CSSProperties
            }
            title={`${m.label}: ${m.value}g`}
          />
        ))}
      </div>

      <div className="mb-macros">
        {macros.map((m) => (
          <div key={m.label} className="mb-macro">
            <span className="mb-macro-dot" style={{ background: m.color }} />
            <span className="mb-macro-label">{m.label}</span>
            <span className="mb-macro-value">{m.value}g</span>
            {m.pct > 0 && <span className="mb-macro-pct">{Math.round(m.pct)}%</span>}
          </div>
        ))}
      </div>

      {items && items.length > 0 && (
        <div className="mb-items">
          <div className="mb-items-label">Per item</div>
          {items.map((it, i) => (
            <div key={i} className="mb-item">
              <span className="mb-item-name">{it.label}</span>
              <span className="mb-item-stats">
                {it.calories !== undefined && (
                  <span className="mb-item-cal">{it.calories} kcal</span>
                )}
                {it.protein !== undefined && <span className="mb-item-macro">P {it.protein}g</span>}
                {it.carbs !== undefined && <span className="mb-item-macro">C {it.carbs}g</span>}
                {it.fat !== undefined && <span className="mb-item-macro">F {it.fat}g</span>}
              </span>
            </div>
          ))}
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
