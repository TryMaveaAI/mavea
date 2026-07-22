import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VariantsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VariantsProps & { delay?: number };

export function Variants({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  prompt,
  variants,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* The original request that produced these variants — quoted for clarity */}
      {prompt && <div className="vt-prompt">{prompt}</div>}

      {/* Variant list: each item is a numbered, labelled, copyable text block */}
      <div className="vt-list vs-stanzas">
        {(variants ?? []).map((v, i) => (
          <div key={i} className="vt-item">
            <div className="vt-label">
              {/* Numeric badge keeps visual ordering without relying on DOM order alone */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'color-mix(in oklab, var(--presence) 14%, var(--surface-elevated))',
                  color: 'var(--presence)',
                  fontSize: '10px',
                  fontWeight: 700,
                  marginRight: 6,
                  flexShrink: 0,
                  verticalAlign: 'middle',
                }}
              >
                {i + 1}
              </span>
              {v.label}
            </div>

            <div className="vt-text">{v.text}</div>

            {v.note && <div className="vt-note">{v.note}</div>}
          </div>
        ))}
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
