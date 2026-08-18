import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CompareMatrixProps, CompareCell, CompareCellKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CompareMatrixProps & { delay?: number };

const RATING_MAX = 5;

// Column floors, in px. Above them the tracks share the card evenly; below them they stop
// shrinking and `.tbl-cmx-scroll` scrolls instead. 96px is about the narrowest a comparison column
// can be and still hold an ordinary word at the smallest step of the cell type scale (and the
// rating row's five dots) without breaking it mid-word; the attribute column needs a little more
// for a two-word label.
const COL_MIN_W = 96;
const ATTR_MIN_W = 120;

/** Parse a rating score from a loose value: a number, a numeric string, or "4/5". Clamped to
 *  0..RATING_MAX so an out-of-range score never paints more dots than the scale has. */
function toScore(value: CompareCell['value']): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(RATING_MAX, Math.round(n)));
}

function Rating({ score }: { score: number }) {
  return (
    <span className="tbl-cmx-rating" aria-label={`${score} out of ${RATING_MAX}`}>
      {Array.from({ length: RATING_MAX }, (_, i) => (
        <span key={i} className={'tbl-cmx-dot' + (i < score ? ' on' : '')} />
      ))}
    </span>
  );
}

/** A half-filled disc for a "partial" verdict — drawn rather than relying on a glyph font so it
 *  reads the same on every platform. */
function PartialGlyph() {
  return (
    <svg className="tbl-cmx-glyph partial" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
    </svg>
  );
}

function CellBody({ cell }: { cell: CompareCell }) {
  const kind: CompareCellKind = cell.kind ?? 'text';
  switch (kind) {
    case 'yes':
      return <Icon.check className="tbl-cmx-glyph yes" aria-label="yes" />;
    case 'no':
      return <Icon.x className="tbl-cmx-glyph no" aria-label="no" />;
    case 'partial':
      return <PartialGlyph />;
    case 'rating':
      return <Rating score={toScore(cell.value)} />;
    default:
      return <span className="tbl-cmx-text">{cell.value != null ? String(cell.value) : '—'}</span>;
  }
}

/** The verdict kinds (everything but plain text) — those whose glyph needs explaining. */
type VerdictKind = Exclude<CompareCellKind, 'text'>;

/** Which verdict kinds appear anywhere in the grid — drives the small legend so the half-disc and
 *  the rating scale are never left unexplained. Order is stable for a calm reading. */
function usedKinds(rows: CompareMatrixProps['rows']): VerdictKind[] {
  const seen = new Set<CompareCellKind>();
  for (const r of rows) for (const c of r.cells) seen.add(c.kind ?? 'text');
  return (['yes', 'no', 'partial', 'rating'] as const).filter((k) => seen.has(k));
}

const LEGEND_LABEL: Record<VerdictKind, string> = {
  yes: 'yes',
  no: 'no',
  partial: 'partial',
  rating: `out of ${RATING_MAX}`,
};

export function CompareMatrix({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  cols,
  rows,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const ncols = cols.length;
  // The attribute column gets a touch more room; every comparison column shares the rest evenly.
  // The grid fills the card width (each cell is its own even track) so a wide card reads as a full,
  // balanced table rather than a narrow block stranded against the left edge. Values wrap inside
  // their own column, so a sentence-length cell makes its row taller rather than demanding one
  // long line; only on a card narrower than the floors does `.tbl-cmx-scroll` scroll instead of
  // crushing the columns.
  const gridCols = `minmax(${ATTR_MIN_W}px, 1.3fr) repeat(${ncols}, minmax(${COL_MIN_W}px, 1fr))`;
  const legendKinds = usedKinds(rows);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {caption && <div className="tbl-cmx-cap">{caption}</div>}

      <div className="tbl-cmx-scroll">
        <div className="tbl-cmx-grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="tbl-cmx-corner" />
          {cols.map((c, i) => (
            <div key={`h${i}`} className="tbl-cmx-colh">
              {c}
            </div>
          ))}

          {rows.map((r, ri) => (
            <Fragment key={ri}>
              <div className="tbl-cmx-rowh">{r.label}</div>
              {cols.map((_, ci) => {
                const cell = r.cells[ci];
                const best = r.best === ci;
                return (
                  <div key={ci} className={'tbl-cmx-cell' + (best ? ' best' : '')}>
                    {cell ? <CellBody cell={cell} /> : <span className="tbl-cmx-text">—</span>}
                    {cell?.note && <div className="tbl-cmx-note">{cell.note}</div>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {legendKinds.length > 0 && (
        <div className="tbl-cmx-legend">
          {legendKinds.map((k) => (
            <span key={k} className="tbl-cmx-legend-item">
              <CellBody cell={{ kind: k, value: k === 'rating' ? RATING_MAX : undefined }} />
              {LEGEND_LABEL[k]}
            </span>
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
