import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ReviewSynthProps, ReviewTheme } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ReviewSynthProps & { delay?: number };

// Compact integer + tenths so "4.3" reads cleanly even when the model hands us 4.3333.
function fmtRating(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

// Distilled reviews from many real customers: an aggregate rating + a 5→1 star distribution, then
// a what-people-love vs complaints split (each theme carries a rough frequency + one verbatim
// quote), plus the single biggest dealbreaker. Themes/quotes must come from real reviews only —
// distinct from worthit (one reviewer's verdict) and proscons (the model's own ledger).
export function ReviewSynth({
  title,
  icon = 'quote',
  iconColor = 'var(--presence)',
  rating,
  count,
  distribution,
  loves,
  complaints,
  dealbreaker,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.quote;
  const likes = loves ?? [];
  const gripes = complaints ?? [];

  // Distribution is [5★,4★,3★,2★,1★] counts; the widest band sets the relative scale of the bars.
  const dist = distribution && distribution.length === 5 ? distribution : null;
  const distMax = dist ? Math.max(...dist, 1) : 1;
  // Derive the headline rating from the distribution when it was not handed to us directly.
  const distTotal = dist ? dist.reduce((a, b) => a + b, 0) : 0;
  const derivedRating =
    rating ??
    (dist && distTotal > 0 ? dist.reduce((a, n, i) => a + n * (5 - i), 0) / distTotal : undefined);
  const totalCount = count ?? (distTotal > 0 ? distTotal : undefined);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(derivedRating !== undefined || dist) && (
        <div className="rv-summary">
          {derivedRating !== undefined && (
            <div className="rv-score">
              <span className="rv-score-val tab-num">{fmtRating(derivedRating)}</span>
              <span className="rv-stars" aria-hidden="true">
                <span
                  className="rv-stars-fill"
                  style={{ width: (Math.min(derivedRating, 5) / 5) * 100 + '%' }}
                >
                  {'★★★★★'}
                </span>
                <span className="rv-stars-track">{'★★★★★'}</span>
              </span>
              {totalCount !== undefined && (
                <span className="rv-count">{totalCount.toLocaleString()} reviews</span>
              )}
            </div>
          )}

          {dist && (
            <div className="rv-dist">
              {dist.map((n, i) => {
                const star = 5 - i;
                return (
                  <div key={i} className="rv-dist-row">
                    <span className="rv-dist-star tab-num">{star}</span>
                    <Icon.spark className="rv-dist-ic" />
                    <span className="rv-dist-track">
                      <span className="rv-dist-fill" style={{ width: (n / distMax) * 100 + '%' }} />
                    </span>
                    <span className="rv-dist-n tab-num">{n.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(likes.length > 0 || gripes.length > 0) && (
        <div className="rv-split">
          {likes.length > 0 && (
            <section className="rv-col rv-col--love">
              <div className="rv-col-h">
                <Icon.check className="rv-col-ic" /> People love
              </div>
              <ul className="rv-themes">
                {likes.map((t, i) => (
                  <ThemeItem key={i} theme={t} />
                ))}
              </ul>
            </section>
          )}
          {gripes.length > 0 && (
            <section className="rv-col rv-col--gripe">
              <div className="rv-col-h">
                <Icon.x className="rv-col-ic" /> Complaints
              </div>
              <ul className="rv-themes">
                {gripes.map((t, i) => (
                  <ThemeItem key={i} theme={t} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {dealbreaker && (
        <div className="rv-dealbreaker">
          <Icon.alert className="rv-db-ic" />
          <span>
            <b>Biggest dealbreaker:</b> {dealbreaker}
          </span>
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

function ThemeItem({ theme }: { theme: ReviewTheme }) {
  return (
    <li className="rv-theme">
      <div className="rv-theme-head">
        <span className="rv-theme-name">{theme.theme}</span>
        {theme.freq && <span className="rv-theme-freq">{theme.freq}</span>}
      </div>
      {theme.quote && <blockquote className="rv-quote">{'“' + theme.quote + '”'}</blockquote>}
    </li>
  );
}
