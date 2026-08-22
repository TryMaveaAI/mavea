import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SegmentedProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SegmentedProps & { delay?: number };

export function Segmented({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  options,
  selected = 0,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [sel, setSel] = useState<number>(Math.min(options.length - 1, Math.max(0, selected)));
  // `cur` can be undefined when `options` is empty (sel clamps to -1)
  const cur = options[sel];
  const n = options.length;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sg-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={`sg-control${n > 4 ? ' sg-control--dense' : ''}`}
        role="radiogroup"
        style={{ ['--sg-n' as string]: n } as CSSProperties}
      >
        <span
          className="sg-thumb"
          style={{
            width: `calc((100% - 6px) / ${n})`,
            left: `calc(3px + (100% - 6px) / ${n} * ${sel})`,
          }}
        />
        {options.map((o, i) => {
          const OptIc = o.icon ? Icon[o.icon] : null;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={sel === i}
              className={`sg-opt ${sel === i ? 'on' : ''}`}
              onClick={() => setSel(i)}
            >
              {OptIc && <OptIc className="ic sg-opt-ic" />}
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="sg-preview" key={sel}>
        {cur?.value && (
          // the selected-option metric is the salient figure Mavéa underlines
          <div className="sg-value tab-num" data-mark="underline" style={{ color }}>
            {cur.value}
          </div>
        )}
        {cur?.caption && (
          <div className="sg-caption dim" dangerouslySetInnerHTML={richInnerHtml(cur.caption)} />
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
