import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ColumnArithmeticProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ColumnArithmeticProps & { delay?: number };

/** Right-pad a whole number's digits to `cols` places, `null` marking the blank leading cells a
 *  shorter operand doesn't reach — never a fabricated "0" in a place the number doesn't have. */
function digitsPadded(n: number, cols: number): (number | null)[] {
  const s = String(n);
  const offset = cols - s.length;
  return Array.from({ length: cols }, (_, c) => (c < offset ? null : Number(s[c - offset])));
}

interface AddResult {
  kind: 'add';
  cols: number;
  rows: (number | null)[][];
  result: (number | null)[];
  carryInto: (number | null)[]; // carry value landing on this column, from the column to its right
  sum: number;
}

interface SubResult {
  kind: 'sub';
  cols: number;
  rows: (number | null)[][];
  result: (number | null)[];
  borrowInto: boolean[]; // this column had a borrow flow into it from its right neighbor
  /** Set when the minuend is smaller than the combined subtrahends — the column borrow model
   *  has nowhere left to borrow from, so the figure falls back to a plain magnitude readout
   *  instead of drawing borrow marks that wouldn't balance. */
  invalidOrder: boolean;
  difference: number;
}

/** Column addition, any number of addend rows. Every carry is the real overflow of that
 *  column's digit sum — never guessed at a fixed "1". */
function computeAdd(ints: number[]): AddResult {
  const sum = ints.reduce((a, b) => a + b, 0);
  const cols = Math.max(...ints.map((n) => String(n).length), String(sum).length);
  const rows = ints.map((n) => digitsPadded(n, cols));
  const result: (number | null)[] = new Array(cols).fill(null);
  const carryInto: (number | null)[] = new Array(cols).fill(null);
  let carry = 0;
  for (let c = cols - 1; c >= 0; c--) {
    const total = carry + rows.reduce((s, r) => s + (r[c] ?? 0), 0);
    result[c] = total % 10;
    carry = Math.floor(total / 10);
    if (c > 0 && carry > 0) carryInto[c - 1] = carry;
  }
  return { kind: 'add', cols, rows, result, carryInto, sum };
}

/** Column subtraction: the first row minus every row after it, combined per column (so any
 *  number of subtrahend rows works the same way addition handles any number of addends). A
 *  borrow into a column is drawn once as a raised "1" — the standard, cascade-safe shorthand —
 *  rather than trying to redraw a chain of crossed-out digits. */
function computeSub(ints: number[]): SubResult {
  const difference = ints[0] - ints.slice(1).reduce((a, b) => a + b, 0);
  const cols = Math.max(...ints.map((n) => String(n).length));
  const rows = ints.map((n) => digitsPadded(n, cols));
  const [minuendDigits, ...subtrahendDigits] = rows;
  const result: (number | null)[] = new Array(cols).fill(null);
  const borrowInto: boolean[] = new Array(cols).fill(false);

  if (difference < 0) {
    return { kind: 'sub', cols, rows, result, borrowInto, invalidOrder: true, difference };
  }

  let borrow = 0;
  for (let c = cols - 1; c >= 0; c--) {
    if (borrow > 0) borrowInto[c] = true;
    const subtracted = subtrahendDigits.reduce((s, d) => s + (d[c] ?? 0), 0);
    let net = (minuendDigits[c] ?? 0) - borrow - subtracted;
    if (net < 0) {
      net += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    result[c] = net;
  }
  return { kind: 'sub', cols, rows, result, borrowInto, invalidOrder: false, difference };
}

interface DivisionStep {
  col: number;
  partial: number;
  qDigit: number;
  product: number;
  remainder: number;
}

interface LongDivResult {
  dividend: number;
  divisor: number;
  digitCount: number;
  steps: DivisionStep[];
  finalCol: number;
  finalRemainder: number;
  quotient: number;
}

/** Real digit-by-digit long division: one step per dividend digit brought down, exactly the
 *  worksheet algorithm — leading positions where the running partial is still smaller than the
 *  divisor are silently skipped (no "0×" step drawn), matching how it's taught by hand. */
function computeLongDiv(dividend: number, divisor: number): LongDivResult {
  const digits = String(dividend).split('').map(Number);
  const steps: DivisionStep[] = [];
  let remainder = 0;
  let started = false;
  for (let i = 0; i < digits.length; i++) {
    const partial = remainder * 10 + digits[i];
    const qDigit = Math.floor(partial / divisor);
    const product = qDigit * divisor;
    const next = partial - product;
    const isLast = i === digits.length - 1;
    if (started || qDigit > 0 || isLast) {
      steps.push({ col: i, partial, qDigit, product, remainder: next });
    }
    if (qDigit > 0) started = true;
    remainder = next;
  }
  const quotient = Math.floor(dividend / divisor);
  return {
    dividend,
    divisor,
    digitCount: digits.length,
    steps,
    finalCol: digits.length - 1,
    finalRemainder: remainder,
    quotient,
  };
}

/** Right-aligned CSS grid-column span ending at 0-indexed column `end`, sized to `text`'s own
 *  character width — the idiom that lets the product/remainder rows of long division line up
 *  under exactly the dividend columns they cover, without splitting the value back into digits. */
function endSpan(end: number, text: string): CSSProperties {
  const start = end - text.length + 2;
  return { gridColumn: `${start} / ${end + 2}` };
}

function gridCols(n: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(1.4em, 1fr))` };
}

export function ColumnArithmetic({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  op,
  operands,
  showCarries = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;

  // Whole, non-negative magnitudes only — a column-arithmetic drill works on the digits, not
  // the sign. Same map-then-filter idiom as BohrModel's shell counts: Math.floor coerces a
  // numeric string for free, and any non-numeric entry collapses to NaN and drops out here.
  const ints = useMemo(
    () => operands.map((n) => Math.max(0, Math.floor(n))).filter(Number.isFinite),
    [operands],
  );

  const add = op === 'add' && ints.length > 0 ? computeAdd(ints) : null;
  const sub = op === 'sub' && ints.length > 1 ? computeSub(ints) : null;
  const longdiv =
    op === 'longdiv' && ints.length > 1 && ints[1] > 0 ? computeLongDiv(ints[0], ints[1]) : null;

  const ready = add || sub || longdiv;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!ready && (
        <div className="lr-ca-empty">
          {op === 'longdiv'
            ? 'Need a dividend and a non-zero divisor to divide.'
            : op === 'sub'
              ? 'Need at least two whole numbers to subtract.'
              : 'Need at least one whole number to add.'}
        </div>
      )}

      {add && (
        <div className="lr-ca-figure lr-ca-addsub">
          {showCarries && (
            <div className="lr-ca-row lr-ca-marks" style={gridCols(add.cols)}>
              {add.carryInto.map((c, i) => (
                <span key={i} className="lr-ca-cell lr-ca-mark lr-ca-mark--carry">
                  {c !== null ? c : ''}
                </span>
              ))}
            </div>
          )}
          {add.rows.map((row, ri) => (
            <div key={ri} className="lr-ca-row lr-ca-operand" style={gridCols(add.cols)}>
              {row.map((d, ci) => (
                <span key={ci} className="lr-ca-cell">
                  {d !== null ? d : ''}
                </span>
              ))}
            </div>
          ))}
          <div className="lr-ca-rule" />
          <div className="lr-ca-row lr-ca-result" style={gridCols(add.cols)}>
            {add.result.map((d, ci) => (
              <span key={ci} className="lr-ca-cell">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {sub && !sub.invalidOrder && (
        <div className="lr-ca-figure lr-ca-addsub">
          {showCarries && (
            <div className="lr-ca-row lr-ca-marks" style={gridCols(sub.cols)}>
              {sub.borrowInto.map((borrowed, i) => (
                <span key={i} className="lr-ca-cell lr-ca-mark lr-ca-mark--borrow">
                  {borrowed ? 1 : ''}
                </span>
              ))}
            </div>
          )}
          {sub.rows.map((row, ri) => (
            <div key={ri} className="lr-ca-row lr-ca-operand" style={gridCols(sub.cols)}>
              {row.map((d, ci) => (
                <span key={ci} className="lr-ca-cell">
                  {d !== null ? d : ''}
                </span>
              ))}
            </div>
          ))}
          <div className="lr-ca-rule" />
          <div className="lr-ca-row lr-ca-result" style={gridCols(sub.cols)}>
            {sub.result.map((d, ci) => (
              <span key={ci} className="lr-ca-cell">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {sub && sub.invalidOrder && (
        <div className="lr-ca-figure">
          <div className="lr-ca-invalid">
            {ints[0]} − {ints.slice(1).join(' − ')} = −{Math.abs(sub.difference)}
          </div>
          <p className="lr-ca-cap">
            The first number is smaller than the rest combined, so there's no column of digits to
            borrow from — shown as a plain difference instead.
          </p>
        </div>
      )}

      {longdiv && (
        <div className="lr-ca-figure lr-ca-longdiv">
          <div className="lr-ca-row lr-ca-quotient" style={gridCols(longdiv.digitCount)}>
            {longdiv.steps.map((s) => (
              <span key={s.col} className="lr-ca-cell" style={endSpan(s.col, String(s.qDigit))}>
                {s.qDigit}
              </span>
            ))}
          </div>
          <div className="lr-ca-ld-house">
            <span className="lr-ca-ld-divisor">{longdiv.divisor}</span>
            <div className="lr-ca-ld-bracket">
              <div className="lr-ca-row" style={gridCols(longdiv.digitCount)}>
                {String(longdiv.dividend)
                  .split('')
                  .map((d, i) => (
                    <span key={i} className="lr-ca-cell">
                      {d}
                    </span>
                  ))}
              </div>
            </div>
          </div>
          <div className="lr-ca-ld-steps">
            {longdiv.steps.map((s, i) => (
              <div key={i} className="lr-ca-ld-step">
                <div className="lr-ca-row" style={gridCols(longdiv.digitCount)}>
                  <span className="lr-ca-cell" style={endSpan(s.col, String(s.partial))}>
                    {s.partial}
                  </span>
                </div>
                <div className="lr-ca-row lr-ca-ld-subtract" style={gridCols(longdiv.digitCount)}>
                  <span
                    className="lr-ca-cell lr-ca-ld-product"
                    style={endSpan(s.col, String(s.product))}
                  >
                    −{s.product}
                  </span>
                </div>
              </div>
            ))}
            <div className="lr-ca-row lr-ca-ld-remainder" style={gridCols(longdiv.digitCount)}>
              <span
                className="lr-ca-cell"
                style={endSpan(longdiv.finalCol, String(longdiv.finalRemainder))}
              >
                {longdiv.finalRemainder}
              </span>
            </div>
          </div>
          <p className="lr-ca-cap">
            {longdiv.quotient} remainder {longdiv.finalRemainder}
          </p>
        </div>
      )}

      {caption && <p className="lr-ca-cap">{caption}</p>}

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
