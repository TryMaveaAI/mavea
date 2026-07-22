import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { WorthItProps, WorthVerdict } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WorthItProps & { delay?: number };

// Verdict → badge word, icon, accent. worth-it reads good, skip reads danger, depends reads caution.
const VERDICT: Record<WorthVerdict, { color: string; label: string; icon: keyof typeof Icon }> = {
  'worth-it': { color: 'var(--insight)', label: 'Worth it', icon: 'check' },
  skip: { color: 'var(--danger)', label: 'Skip it', icon: 'x' },
  depends: { color: 'var(--warning)', label: 'Depends', icon: 'alert' },
};

// A single-product value call: is THIS thing worth it for THIS person? A verdict + honest price
// context, the worth-it-IF vs skip-IF fit split, the one deal-breaker, and who it is for. Distinct
// from verdictcard (a generic yes/no) and proscons (an even ledger): this is purchase judgement.
export function WorthIt({
  title,
  icon,
  iconColor,
  product,
  verdict,
  price,
  priceNote,
  worthItIf,
  skipIf,
  dealBreaker,
  forWho,
  bottomLine,
  footer,
  delay,
}: Props) {
  const v = VERDICT[verdict] ?? VERDICT.depends;
  const EyebrowIcon = Icon[icon ?? 'cart'] || Icon.cart;
  const BadgeIcon = Icon[v.icon] || Icon.check;
  const yes = worthItIf ?? [];
  const no = skipIf ?? [];

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--wi' as string]: v.color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <EyebrowIcon className="ic" style={{ color: iconColor || v.color }} /> {title}
      </div>

      <div className="wi-head">
        <div className="wi-head-l">
          {product && <div className="wi-product">{product}</div>}
          {price && (
            <div className="wi-price">
              <span className="wi-price-val">{price}</span>
              {priceNote && <span className="wi-price-note">{priceNote}</span>}
            </div>
          )}
        </div>
        <span className="wi-badge">
          <BadgeIcon className="ic wi-badge-ic" /> {v.label}
        </span>
      </div>

      {(yes.length > 0 || no.length > 0) && (
        <div className="wi-split">
          {yes.length > 0 && (
            <div className="wi-col wi-col--yes">
              <div className="wi-col-h">Worth it if</div>
              <ul className="wi-list">
                {yes.map((t, i) => (
                  <li key={i}>
                    <Icon.check className="ic wi-li-ic" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {no.length > 0 && (
            <div className="wi-col wi-col--no">
              <div className="wi-col-h">Skip if</div>
              <ul className="wi-list">
                {no.map((t, i) => (
                  <li key={i}>
                    <Icon.x className="ic wi-li-ic" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {dealBreaker && (
        <div className="wi-dealbreaker">
          <Icon.alert className="ic" />
          <span>
            <b>Deal-breaker:</b> {dealBreaker}
          </span>
        </div>
      )}

      {(forWho || bottomLine) && (
        <div className="wi-bottom">
          {forWho && (
            <div className="wi-forwho">
              <span className="wi-forwho-tag">For</span> {forWho}
            </div>
          )}
          {bottomLine && (
            <div className="wi-bottomline" dangerouslySetInnerHTML={richInnerHtml(bottomLine)} />
          )}
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
