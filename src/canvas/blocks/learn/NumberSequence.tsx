import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { NumberSequenceKind, NumberSequenceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NumberSequenceProps & { delay?: number };

const MAX_TERMS_SHOWN = 24;
const MIN_PX = 26;
const MAX_PX = 58;

const KIND_LABEL: Record<NumberSequenceKind, string> = {
  fibonacci: 'Fibonacci sequence',
  prime: 'Prime numbers',
  triangular: 'Triangular numbers',
  square: 'Square numbers',
};

/** Dot diameter scaled to the term's magnitude relative to the row's largest — area-proportional
 *  (sqrt of the ratio) so a term twice as large doesn't look four times as big. */
function tileSize(absValue: number, maxAbsValue: number): number {
  if (!(maxAbsValue > 0)) return MIN_PX;
  const t = Math.sqrt(Math.min(1, absValue / maxAbsValue));
  return MIN_PX + t * (MAX_PX - MIN_PX);
}

// A row of size-scaled dots, one per term, with the generating rule read off the real numbers:
// the gap between each adjacent pair is annotated on the connector between them. Works the same
// way for all four kinds because it never assumes which formula produced the terms — it only
// ever shows the caller's own numbers and the arithmetic between them.
export function NumberSequence({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  kind,
  terms,
  rule,
  highlightPattern = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const { shown, maxAbsValue, hiddenCount } = useMemo(() => {
    const list = Array.isArray(terms) ? terms : [];
    const valid = list.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const s = valid.slice(0, MAX_TERMS_SHOWN);
    return {
      shown: s,
      maxAbsValue: Math.max(0, ...s.map((v) => Math.abs(v))),
      hiddenCount: valid.length - s.length,
    };
  }, [terms]);

  const kindLabel = (KIND_LABEL as Record<string, string | undefined>)[kind] ?? 'Number sequence';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <span className="lr-ns-kind">{kindLabel}</span>
      </div>

      {shown.length === 0 ? (
        <div className="lr-ns-empty">No terms to show.</div>
      ) : (
        <div className="lr-ns-row">
          {shown.map((v, i) => {
            const px = tileSize(Math.abs(v), maxAbsValue);
            const delta = i > 0 ? v - shown[i - 1] : null;
            return (
              <span key={i} className="lr-ns-pair">
                {delta !== null && highlightPattern && (
                  <span
                    className="lr-ns-connector m-stagger-item m-fade-rise"
                    style={{ ['--i' as string]: i } as CSSProperties}
                  >
                    <span className="lr-ns-delta">
                      {delta >= 0 ? '+' : '−'}
                      {formatValue(Math.abs(delta), { compact: true })}
                    </span>
                    <span className="lr-ns-connector-line" aria-hidden="true" />
                  </span>
                )}
                <span
                  className="lr-ns-item m-stagger-item m-scale-in"
                  style={{ ['--i' as string]: i, width: px, height: px } as CSSProperties}
                  title={formatValue(v)}
                >
                  {formatValue(v, { compact: true })}
                </span>
              </span>
            );
          })}
        </div>
      )}
      {hiddenCount > 0 && <p className="lr-ns-more">+{hiddenCount} more terms</p>}
      {rule && <p className="lr-ns-rule">{rule}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
