import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MoneyToken, MoneyTrayProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MoneyTrayProps & { delay?: number };

// Below this face value a denomination is a coin (circle); at/above it, a bill (rectangle).
const BILL_THRESHOLD = 1;
// Cap the drawn glyphs per stack so a count of 40 doesn't blow the row; the count badge tells truth.
const MAX_GLYPHS = 6;

/** Format a money amount with the given symbol. Cents shown only when the value isn't whole. */
function money(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  return currency + amount.toFixed(whole && Math.abs(amount) >= 1 ? 0 : 2);
}

/** A short denomination label, e.g. 0.25 → "25¢", 5 → "$5". Used when the model omits one. */
function denomLabel(denom: number, currency: string): string {
  if (denom < BILL_THRESHOLD) return `${Math.round(denom * 100)}¢`;
  return money(denom, currency);
}

/** Greedily make `amount` from the largest available denominations down — the fewest-token change. */
function fewestTokens(amount: number, denoms: number[]): { denom: number; count: number }[] {
  const out: { denom: number; count: number }[] = [];
  // Work in cents to dodge floating-point drift on values like 0.1 + 0.2.
  let cents = Math.round(amount * 100);
  for (const d of [...denoms].sort((a, b) => b - a)) {
    const dc = Math.round(d * 100);
    if (dc <= 0) continue;
    const n = Math.floor(cents / dc);
    if (n > 0) {
      out.push({ denom: d, count: n });
      cents -= n * dc;
    }
  }
  return out;
}

/** One stack of like tokens — coins as overlapping circles, bills as stacked rectangles. */
function TokenStack({ token, currency }: { token: MoneyToken; currency: string }) {
  const isBill = token.denom >= BILL_THRESHOLD;
  const shown = Math.min(MAX_GLYPHS, Math.max(1, token.count));
  const label = token.label ?? denomLabel(token.denom, currency);

  return (
    <div className="lr-mt-stack">
      <div className={`lr-mt-glyphs${isBill ? ' lr-mt-glyphs--bill' : ''}`} aria-hidden="true">
        {Array.from({ length: shown }, (_, i) =>
          isBill ? (
            <span key={i} className="lr-mt-bill" style={{ ['--i' as string]: i } as CSSProperties}>
              {label}
            </span>
          ) : (
            <span key={i} className="lr-mt-coin" style={{ ['--i' as string]: i } as CSSProperties}>
              {label}
            </span>
          ),
        )}
      </div>
      <div className="lr-mt-count">
        <b>{token.count}</b> × {label}
      </div>
    </div>
  );
}

export function MoneyTray({
  title,
  icon = 'cart',
  iconColor = 'var(--presence)',
  currency = '$',
  tokens,
  target,
  mode = 'count',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.cart;

  const { total, change } = useMemo(() => {
    const t = tokens.reduce((sum, tk) => sum + tk.denom * Math.max(0, tk.count), 0);
    // In change mode, suggest the fewest standard tokens to close a positive gap to target.
    let ch: { gap: number; tokens: { denom: number; count: number }[] } | null = null;
    if (mode === 'change' && target !== undefined) {
      const gap = Math.round((target - t) * 100) / 100;
      const STANDARD = [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05, 0.01];
      ch = { gap, tokens: gap > 0 ? fewestTokens(gap, STANDARD) : [] };
    }
    return { total: t, change: ch };
  }, [tokens, target, mode]);

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

      <div className="lr-mt-tray">
        {tokens.map((tk, i) => (
          <TokenStack key={i} token={tk} currency={currency} />
        ))}
      </div>

      {/* Running total, computed from the tray. */}
      <div className="lr-mt-total">
        <span className="lr-mt-total-k">Total</span>
        <span className="lr-mt-total-v">{money(total, currency)}</span>
      </div>

      {/* Change mode: the gap to target + the fewest-token suggestion. */}
      {change && (
        <div className="lr-mt-change">
          {change.gap > 0 ? (
            <>
              <div className="lr-mt-change-line">
                Need <b>{money(change.gap, currency)}</b> more to reach{' '}
                {money(target ?? 0, currency)}
              </div>
              {change.tokens.length > 0 && (
                <ul className="lr-mt-change-list">
                  {change.tokens.map((c, i) => (
                    <li key={i} className="lr-mt-change-item">
                      <b>{c.count}</b> × {denomLabel(c.denom, currency)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : change.gap < 0 ? (
            <div className="lr-mt-change-line lr-mt-change-line--over">
              <b>{money(-change.gap, currency)}</b> over {money(target ?? 0, currency)}
            </div>
          ) : (
            <div className="lr-mt-change-line lr-mt-change-line--exact">
              Exactly {money(target ?? 0, currency)} — no change needed
            </div>
          )}
        </div>
      )}

      {caption && <p className="lr-mt-cap">{caption}</p>}

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
