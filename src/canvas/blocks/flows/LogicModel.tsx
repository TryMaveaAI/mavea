import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LogicModelProps, LogicStage } from './types';

type Props = LogicModelProps & { delay?: number };

// The five stages always render in this canonical order, regardless of how (or whether) the
// model ordered `columns` — a program logic model reads left to right as a causal chain, so
// the order itself is part of the meaning, not just a display preference.
const STAGE_ORDER: LogicStage[] = ['inputs', 'activities', 'outputs', 'outcomes', 'impact'];
const STAGE_SET = new Set<string>(STAGE_ORDER);
const STAGE_LABEL: Record<LogicStage, string> = {
  inputs: 'Inputs',
  activities: 'Activities',
  outputs: 'Outputs',
  outcomes: 'Outcomes',
  impact: 'Impact',
};
// A steady warm-up left to right, raw resources through to the program's ultimate effect —
// not a semantic status color, so an early column never accidentally reads as "bad".
const STAGE_COLOR: Record<LogicStage, string> = {
  inputs: 'var(--text-muted)',
  activities: 'var(--presence-soft)',
  outputs: 'var(--presence)',
  outcomes: 'var(--insight)',
  impact: 'var(--warning)',
};

export function LogicModel({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  columns,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const given = Array.isArray(columns) ? columns : [];

  // Bucket whatever the model authored onto its stage key; a stage nobody filled in still
  // gets its own empty column below rather than collapsing the grid to fewer than five, and
  // a repeated stage key keeps its first entry (never silently merges or overwrites).
  const byStage = new Map<string, string[]>();
  given.forEach((c) => {
    const stage = typeof c?.stage === 'string' ? c.stage.toLowerCase().trim() : '';
    if (!STAGE_SET.has(stage) || byStage.has(stage)) return;
    const items = Array.isArray(c?.items)
      ? c.items.filter((it): it is string => typeof it === 'string' && it.trim().length > 0)
      : [];
    byStage.set(stage, items);
  });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fl-lm">
        {STAGE_ORDER.map((stage, i) => {
          const items = byStage.get(stage) ?? [];
          return (
            <div
              className="fl-lm-col m-stagger-item m-fade-rise"
              style={
                { ['--i' as string]: i, ['--c' as string]: STAGE_COLOR[stage] } as CSSProperties
              }
              key={stage}
            >
              <div className="fl-lm-head">
                <span className="fl-lm-dot" />
                <span className="fl-lm-headtext">{STAGE_LABEL[stage]}</span>
                {i < STAGE_ORDER.length - 1 && <Icon.chevR className="ic fl-lm-arrow" />}
              </div>
              <div className="fl-lm-items">
                {items.length === 0 ? (
                  <div className="fl-lm-empty">—</div>
                ) : (
                  items.map((it, ii) => (
                    <div className="fl-lm-chip" key={ii}>
                      {it}
                    </div>
                  ))
                )}
              </div>
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
