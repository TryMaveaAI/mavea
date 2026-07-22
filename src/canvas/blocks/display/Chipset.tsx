import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChipsetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ChipsetProps & { delay?: number };

interface ChipState {
  label: string;
  icon?: Props['chips'][number]['icon'];
  avatar?: string;
  color: string;
  selected: boolean;
  removable: boolean;
}

export function Chipset({
  title,
  icon = 'plus',
  iconColor = 'var(--presence)',
  chips,
  mode = 'multi',
  summary,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.plus;
  const [items, setItems] = useState<ChipState[]>(() =>
    chips.map((c) => ({
      label: c.label,
      icon: c.icon,
      avatar: c.avatar,
      color: c.color || color,
      selected: !!c.selected,
      removable: c.removable !== false,
    })),
  );

  const toggle = (i: number) =>
    setItems((prev) =>
      prev.map((c, j) =>
        mode === 'single'
          ? { ...c, selected: j === i }
          : j === i
            ? { ...c, selected: !c.selected }
            : c,
      ),
    );
  const remove = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setItems((prev) => prev.filter((_, j) => j !== i));
  };

  const selCount = items.filter((c) => c.selected).length;
  const selNames = items.filter((c) => c.selected).map((c) => c.label);
  // first selected chip is the active/highlighted datum; -1 means none selected (skip mark)
  const firstSelIdx = items.findIndex((c) => c.selected);

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--chip-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cs-wrap">
        {items.map((c, i) => {
          const CIc = c.icon ? Icon[c.icon] : null;
          return (
            <span
              key={c.label + i}
              role="button"
              tabIndex={0}
              className={`cs-chip ${c.selected ? 'on' : ''}`}
              style={{ ['--c-c' as string]: c.color } as CSSProperties}
              onClick={() => toggle(i)}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(i))
              }
              // first selected chip is the active/highlighted datum
              {...(i === firstSelIdx && firstSelIdx !== -1 ? { 'data-mark': 'circle' } : {})}
            >
              {c.avatar ? (
                <span className="cs-chip-avatar">{c.avatar.slice(0, 2).toUpperCase()}</span>
              ) : CIc ? (
                <CIc className="cs-chip-ic" />
              ) : null}
              <span className="cs-chip-label">{c.label}</span>
              {c.removable && (
                <button
                  type="button"
                  className="cs-chip-x"
                  onClick={(e) => remove(i, e)}
                  aria-label={`Remove ${c.label}`}
                >
                  <Icon.x />
                </button>
              )}
            </span>
          );
        })}
        {items.length === 0 && <span className="cs-empty faint">All chips removed</span>}
      </div>

      <div className="cs-summary">
        {summary ? (
          <span className="faint" dangerouslySetInnerHTML={richInnerHtml(summary)} />
        ) : selCount === 0 ? (
          <span className="faint">Nothing selected</span>
        ) : (
          <span>
            <strong style={{ color }}>{selCount}</strong> selected
            <span className="faint"> · {selNames.join(', ')}</span>
          </span>
        )}
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
