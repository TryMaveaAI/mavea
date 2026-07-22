import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ParallelTextProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParallelTextProps & { delay?: number };

export function ParallelText({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  columns,
  rows,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // Equal-width tracks, one per column; the source column reads slightly heavier so the
  // eye lands on it first when scanning a row across renderings.
  const cols = columns.length || 1;
  const gridCols = `repeat(${cols}, minmax(0, 1fr))`;
  const divergences = rows.filter((r) => r.diverge).length;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="pt-caption">{caption}</div>}

      <div className="pt-scroll">
        <div className="pt-grid" style={{ ['--pt-cols' as string]: gridCols } as CSSProperties}>
          <div className="pt-headrow" style={{ gridTemplateColumns: gridCols }}>
            {columns.map((c, i) => (
              <div key={i} className={'pt-colh' + (i === 0 ? ' source' : '')}>
                <span className="pt-colh-label">{c.label}</span>
                {c.lang && <span className="pt-colh-lang mono">{c.lang}</span>}
              </div>
            ))}
          </div>

          {rows.map((row, ri) => (
            <div key={ri} className={'pt-line' + (row.diverge ? ' diverge' : '')}>
              <div className="pt-cells" style={{ gridTemplateColumns: gridCols }}>
                {/* Render exactly `cols` cells so the row stays aligned even if a rendering is
                    missing a line — a gap reads as "this version omits it", not a layout break. */}
                {Array.from({ length: cols }, (_, ci) => (
                  <div key={ci} className={'pt-cell' + (ci === 0 ? ' source' : '')}>
                    {row.cells[ci] ?? ''}
                  </div>
                ))}
              </div>
              {row.note && (
                <div className="pt-note">
                  <span className="pt-note-rail" aria-hidden="true" />
                  <span className="pt-note-text">{row.note}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(footer || divergences > 0) && (
        <div className="pt-foot">
          {divergences > 0 && (
            <span className="pt-foot-tag">
              <span className="pt-foot-pip" aria-hidden="true" />
              {divergences} divergence{divergences === 1 ? '' : 's'}
            </span>
          )}
          {footer && (
            <span className="pt-foot-note" dangerouslySetInnerHTML={richInnerHtml(footer)} />
          )}
        </div>
      )}
    </div>
  );
}
