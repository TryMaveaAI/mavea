import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MediaCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = MediaCardProps & { delay?: number };

// A poster-forward detail card for ONE title (film / show / book / game): cover art over a
// title, a row of meta chips (year · runtime · rating), a numeric score badge, a spoiler-safe
// logline, genre tags, and "where to watch" provider chips. The cover renders a real `src`
// when given and otherwise falls back to the from/to gradient like the rest of the media
// family — so a dead or absent image leaves a tasteful placeholder, never a broken icon.
// For a "what should I watch / read next" pick; carousel/lightbox are galleries of many.
export function MediaCard({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  cover,
  year,
  runtime,
  rating,
  score,
  genres,
  logline,
  providers,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.play;
  // AccentVar is a closed token union at the type level, but the live schema only tag-neutralizes
  // this field at runtime — it never validates it against the token set. Gate at the render
  // boundary, same principle as richInnerHtml/safeImageUrl elsewhere in this family.
  const from = safeCssColor(cover?.from, 'var(--presence-deep)');
  const to = safeCssColor(cover?.to, 'var(--presence-soft)');
  // untrusted model URL — a rejected cover leaves the gradient plate, same as a 404
  const coverSrc = safeBlockImageSrc(cover?.src);
  // A score is on a 0–100 scale; tier the badge accent so a strong pick reads good and a weak
  // one reads muted, without inventing any value the model did not give.
  const scoreNum = typeof score === 'number' ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const scoreColor =
    scoreNum == null
      ? 'var(--text-muted)'
      : scoreNum >= 75
        ? 'var(--insight)'
        : scoreNum >= 55
          ? 'var(--warning)'
          : 'var(--text-muted)';
  const meta = [year, runtime, rating].filter(Boolean) as string[];
  const tags = genres ?? [];
  const where = providers ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="mc-body">
        <div className="mc-cover" style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}>
          {coverSrc && (
            <img
              className="me-img-fill"
              src={coverSrc}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              // A model-supplied poster URL can 404 — hide the <img> so the gradient shows
              // instead of a broken-image icon.
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {scoreNum != null && (
            <span
              className="mc-score"
              style={{ ['--mc-sc' as string]: scoreColor } as CSSProperties}
            >
              <span className="mc-score-val tab-num">{scoreNum}</span>
              <span className="mc-score-unit">/100</span>
            </span>
          )}
        </div>

        <div className="mc-main">
          {meta.length > 0 && (
            <div className="mc-meta">
              {meta.map((m, i) => (
                <span key={i} className="mc-chip">
                  {m}
                </span>
              ))}
            </div>
          )}

          {logline && <p className="mc-logline">{logline}</p>}

          {tags.length > 0 && (
            <div className="mc-genres">
              {tags.map((g, i) => (
                <span key={i} className="mc-genre">
                  {g}
                </span>
              ))}
            </div>
          )}

          {where.length > 0 && (
            <div className="mc-where">
              <span className="mc-where-h">
                <Icon.play className="ic mc-where-ic" /> Where to watch
              </span>
              <div className="mc-providers">
                {where.map((p, i) => (
                  <span key={i} className="mc-provider">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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
