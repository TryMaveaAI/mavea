import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SpeciesCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = SpeciesCardProps & { delay?: number };

// A nature field-ID card: a photo/illustration banner over the common + scientific name,
// an ID field-marks band (size · colour · habitat · range · song · season), and a strip of
// confusion species. The banner shows a real `image.src` when given and otherwise falls back
// to the from→to gradient like the media family, so a dead or absent image leaves a tasteful
// placeholder rather than a broken icon. The marks ARE the identification — each chip is read
// straight from the props, nothing is invented inside the component.
export function SpeciesCard({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  commonName,
  scientificName,
  image,
  marks,
  lookalikes,
  status,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  // AccentVar is a closed token union at the type level, but the live schema only tag-neutralizes
  // this field at runtime — it never validates it against the token set. Gate at the render
  // boundary, same principle as richInnerHtml/safeImageUrl elsewhere in this family.
  const from = safeCssColor(image?.from, 'var(--presence-deep)');
  const to = safeCssColor(image?.to, 'var(--presence-soft)');
  // untrusted model URL — a rejected banner keeps the gradient, same as a 404
  const bannerSrc = safeBlockImageSrc(image?.src);
  const fieldMarks = marks ?? [];
  const confusable = lookalikes ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="sp-banner" style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}>
        {bannerSrc && (
          <img
            className="me-img-fill"
            src={bannerSrc}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            // A model-supplied photo URL can 404 — hide the <img> so the gradient shows
            // instead of a broken-image icon.
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {status && <span className="sp-status">{status}</span>}
      </div>

      {/* underline gesture resolves to the species' common name */}
      <div className="sp-common" data-mark="underline">
        {commonName}
      </div>
      {scientificName && <div className="sp-scientific">{scientificName}</div>}
      {caption && <div className="sp-caption">{caption}</div>}

      {fieldMarks.length > 0 && (
        <div className="sp-marks">
          {fieldMarks.map((m, i) => (
            <div key={i} className="sp-mark">
              <span className="sp-mark-label">{m.label}</span>
              <span className="sp-mark-value">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {confusable.length > 0 && (
        <div className="sp-lookalikes">
          <span className="sp-lookalikes-k">
            <Icon.layers className="ic sp-lookalikes-ic" /> Easily confused with
          </span>
          <ul className="sp-lookalike-list">
            {confusable.map((name, i) => (
              <li key={i} className="sp-lookalike">
                {name}
              </li>
            ))}
          </ul>
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
