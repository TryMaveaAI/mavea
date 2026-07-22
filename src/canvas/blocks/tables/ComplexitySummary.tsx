import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { ComplexitySummaryProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ComplexitySummaryProps & { delay?: number };

// A multi-approach Big-O comparison — the wrap-up artifact at the end of a technical-interview
// walkthrough. A fixed 4-column subgrid (the same column-alignment trick datadictionary uses)
// so the monospace complexity columns line up row to row regardless of label length.
export function ComplexitySummary({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  approaches,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  // A required item array with no ItemSpec-covered field still needs a real name to anchor a
  // row on — an approach missing one is dropped rather than rendered as a blank row.
  const list = (Array.isArray(approaches) ? approaches : []).filter(
    (a) => a && typeof a.name === 'string' && a.name.trim().length > 0,
  );

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {list.length === 0 ? (
        <BlockEmpty message="No approaches to compare" />
      ) : (
        <div className="cxs-scroll">
          <div className="cxs-grid" role="grid" aria-label={title}>
            <div className="cxs-colh" role="columnheader">
              Approach
            </div>
            <div className="cxs-colh" role="columnheader">
              Time
            </div>
            <div className="cxs-colh" role="columnheader">
              Space
            </div>
            <div className="cxs-colh cxs-colh-notes" role="columnheader">
              Notes
            </div>

            {list.map((a, i) => (
              <div
                key={`${a.name}-${i}`}
                className="cxs-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
                role="row"
              >
                <div className="cxs-name" role="gridcell" title={a.name}>
                  {a.name}
                </div>
                <div className="cxs-complexity tab-num" role="gridcell">
                  {a.timeComplexity || '—'}
                </div>
                <div className="cxs-complexity tab-num" role="gridcell">
                  {a.spaceComplexity || '—'}
                </div>
                <div className="cxs-notes" role="gridcell">
                  {a.notes || '—'}
                </div>
              </div>
            ))}
          </div>
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
