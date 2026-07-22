// Shared value formatting for the canvas.
//
// The `hours9` bug came from blocks rendering `{value}{unit}` directly: no thousands
// separators, no space before the unit, no compact notation for big numbers. This module is
// the one place a number becomes a string, so every block reads consistently and a fix here
// fixes the whole library. Locale-aware via Intl; pure and side-effect-free.

export interface FormatOptions {
  /** Unit suffix, e.g. `hours`, `kg`, `ms`. Rendered with a separating space → "9 hours". */
  unit?: string;
  /** Fixed number of decimal places. By default the value is shown as-is (up to 3 dp). */
  decimals?: number;
  /** ISO 4217 currency code, e.g. `USD`. Overrides `unit` and renders a currency symbol. */
  currency?: string;
  /** Render as a percent. `42` → "42%". Pair with `decimals` for "42.0%". */
  percent?: boolean;
  /** Use compact notation for large magnitudes: 1_200_000 → "1.2M". */
  compact?: boolean;
  /** BCP-47 locale; defaults to the runtime locale. */
  locale?: string;
}

/** Non-breaking space, so a value and its unit never wrap apart ("9⍽hours"). */
const NBSP = ' ';

/**
 * Format a numeric value with optional unit/currency/percent. The single entry point that
 * replaces raw `{value}{unit}` concatenation across the blocks.
 *
 * Examples: `formatValue(9, { unit: 'hours' })` → "9 hours";
 * `formatValue(1234.5, { decimals: 0 })` → "1,235";
 * `formatValue(1_200_000, { compact: true })` → "1.2M";
 * `formatValue(2500, { currency: 'USD' })` → "$2,500".
 */
export function formatValue(value: number, opts: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return '—';
  const { unit, decimals, currency, percent, compact, locale } = opts;

  const num: Intl.NumberFormatOptions = {};
  if (decimals !== undefined) {
    num.minimumFractionDigits = decimals;
    num.maximumFractionDigits = decimals;
  } else {
    num.maximumFractionDigits = 3;
  }
  if (compact) num.notation = 'compact';

  if (currency) {
    return new Intl.NumberFormat(locale, { ...num, style: 'currency', currency }).format(value);
  }
  if (percent) {
    return new Intl.NumberFormat(locale, num).format(value) + '%';
  }

  const text = new Intl.NumberFormat(locale, num).format(value);
  return unit ? `${text}${NBSP}${unit}` : text;
}

/**
 * Compose a value with a free-form `unit` string the way a person reads it, so a model that
 * sets `unit: "Millions"` renders "1,000 Millions" — not "Millions1000". A currency symbol
 * ($, €, £, ¥, ₹) prefixes; "%" suffixes tight; any word unit suffixes with a (non-breaking)
 * space. Thousands separators / compact notation come from `formatValue`.
 */
export function withUnit(
  value: number,
  unit?: string,
  opts: Omit<FormatOptions, 'unit'> = {},
): string {
  const text = formatValue(value, opts);
  const u = unit?.trim();
  if (!u) return text;
  if (/^[$€£¥₹]/.test(u)) return `${u}${text}`;
  if (u === '%') return `${text}%`;
  return `${text}${NBSP}${u}`;
}

/** Format a 0–100 (or 0–1) ratio as a percent string. `0.42` and `42` both → "42%". */
export function formatPercent(
  value: number,
  opts: { decimals?: number; locale?: string } = {},
): string {
  if (!Number.isFinite(value)) return '—';
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return formatValue(pct, { percent: true, ...opts });
}

export interface DateFormatOptions {
  /** Preset granularity. `month` → "Jun 2026", `day` → "Jun 8, 2026", `time` → "3:04 PM". */
  style?: 'year' | 'month' | 'day' | 'time' | 'datetime';
  locale?: string;
}

const DATE_PRESETS: Record<NonNullable<DateFormatOptions['style']>, Intl.DateTimeFormatOptions> = {
  year: { year: 'numeric' },
  month: { year: 'numeric', month: 'short' },
  day: { year: 'numeric', month: 'short', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  datetime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
};

/**
 * Format a date (Date | epoch-ms | ISO string) at a preset granularity. Charts and timelines
 * pass raw values; this normalises and localises them. Invalid input → em dash, never "Invalid Date".
 */
export function formatDate(input: Date | number | string, opts: DateFormatOptions = {}): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(opts.locale, DATE_PRESETS[opts.style ?? 'day']).format(d);
}
