import { useMemo, Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AreaModelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AreaModelProps & { delay?: number };

// One accent color per body row, cycling for grids with many rows
const ROW_PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

function parseTerm(s: string): { coef: number; varPart: string } {
  const t = s.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return { coef: Number(t), varPart: '' };
  // Match optional sign+digits then one or more variable characters (incl. Unicode superscripts)
  const m = t.match(/^(-?\d*\.?\d*)([a-zA-Z][a-zA-Z0-9²³⁴⁵]*)$/);
  if (!m) return { coef: 1, varPart: t };
  const cs = m[1];
  const coef = cs === '' || cs === '+' ? 1 : cs === '-' ? -1 : Number(cs);
  return { coef, varPart: m[2] };
}

// Multiplies two polynomial term strings and returns a display string.
// Handles: number×number, number×var, var×same-var (→ squared), var×different-var (→ concat).
function multiplyTerms(a: string, b: string): string {
  const pa = parseTerm(a);
  const pb = parseTerm(b);
  const coef = pa.coef * pb.coef;
  const vA = pa.varPart;
  const vB = pb.varPart;

  if (!vA && !vB) return String(coef);

  let varPart: string;
  if (!vA) {
    varPart = vB;
  } else if (!vB) {
    varPart = vA;
  } else if (vA === vB) {
    varPart = vA + '²';
  } else {
    // alphabetical so "xy" and "yx" both render consistently as "xy"
    varPart = [vA, vB].sort().join('');
  }

  if (coef === 1) return varPart;
  if (coef === -1) return '-' + varPart;
  return String(coef) + varPart;
}

export function AreaModel({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  factorA,
  factorB,
  labelsA,
  labelsB,
  showProducts = true,
  showSum = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.table;

  // Build display labels, falling back to numeric values when no algebraic override is given
  const colTerms = useMemo(
    () => factorA.map((v, j) => labelsA?.[j] ?? String(v)),
    [factorA, labelsA],
  );

  const rowTerms = useMemo(
    () => factorB.map((v, i) => labelsB?.[i] ?? String(v)),
    [factorB, labelsB],
  );

  // products[i][j] is the display string for body cell at row i, col j
  const products = useMemo(
    () => rowTerms.map((row) => colTerms.map((col) => multiplyTerms(col, row))),
    [rowTerms, colTerms],
  );

  // Sum line: all partial products joined, with canonical sign handling
  const sumLine = useMemo(() => {
    const flat = products.flat();
    return '= ' + flat.join(' + ').replace(/\+ -/g, '- ');
  }, [products]);

  const cols = factorA.length;
  const colTemplate = `min-content repeat(${cols}, minmax(56px, 1fr))`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-am-wrap">
        <div className="lr-am-grid" style={{ gridTemplateColumns: colTemplate }}>
          {/* Empty corner anchors the top-left intersection */}
          <div className="lr-am-cell lr-am-corner" aria-hidden="true" />

          {/* Column header row — one cell per factorA term */}
          {colTerms.map((term, j) => (
            <div key={j} className="lr-am-cell lr-am-col-hdr">
              {term}
            </div>
          ))}

          {/* Body rows — row header + one body cell per column */}
          {rowTerms.map((rowTerm, i) => {
            const color = ROW_PALETTE[i % ROW_PALETTE.length];
            return (
              <Fragment key={i}>
                <div
                  className="lr-am-cell lr-am-row-hdr"
                  style={
                    {
                      background: `color-mix(in srgb, ${color} 25%, transparent)`,
                    } as CSSProperties
                  }
                >
                  {rowTerm}
                </div>
                {colTerms.map((_, j) => (
                  <div
                    key={j}
                    className="lr-am-cell lr-am-body-cell"
                    style={
                      {
                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                      } as CSSProperties
                    }
                  >
                    {showProducts ? products[i][j] : null}
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>

        {showSum && (
          <div className="lr-am-sum" aria-label={`Product sum: ${sumLine}`}>
            {sumLine}
          </div>
        )}
      </div>

      {caption && <p className="lr-am-caption">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
