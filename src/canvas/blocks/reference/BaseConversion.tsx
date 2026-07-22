import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BaseConversionProps, BaseRow } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BaseConversionProps & { delay?: number };

/** Split a digit string into place-value groups of 4, counted from the RIGHT (a
 *  nibble/thousands rhythm), so a long binary or hex string stays scannable. Purely a
 *  string operation — no arithmetic, so it can't NaN even on a malformed `digits`. */
function groupFromRight(digits: string): { ch: string; group: number }[] {
  const chars = Array.from(digits);
  const n = chars.length;
  return chars.map((ch, i) => ({ ch, group: Math.floor((n - 1 - i) / 4) }));
}

// A value written out in several number bases side by side. `digits` is the raw
// per-base string the model supplies (never parsed or re-derived here — the base
// arithmetic is the model's job, this block only displays it), grouped visually in
// fours from the right so long binary/hex runs stay readable.
export function BaseConversion({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  value,
  bases,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;
  const safeBases: BaseRow[] = bases ?? [];
  const displayValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {displayValue && (
        <div className="bcv-value" data-mark="underline">
          {displayValue}
        </div>
      )}

      {safeBases.length > 0 ? (
        <div className="bcv-rows">
          {safeBases.map((b, i) => {
            const digits = typeof b.digits === 'string' ? b.digits.trim() : '';
            const radix = typeof b.radix === 'number' && Number.isFinite(b.radix) ? b.radix : null;
            return (
              <div
                key={i}
                className="bcv-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <div className="bcv-row-head">
                  <span className="bcv-label">{b.label}</span>
                  {radix !== null && <span className="bcv-radix">base {radix}</span>}
                </div>
                {digits ? (
                  <div className="bcv-digits">
                    {groupFromRight(digits).map((d, j) => (
                      <span
                        key={j}
                        className="bcv-digit"
                        data-group={d.group % 2 === 0 ? 'a' : 'b'}
                      >
                        {d.ch}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="bcv-dash">—</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bcv-empty">No bases yet.</div>
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
