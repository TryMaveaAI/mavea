import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CocktailCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CocktailCardProps & { delay?: number };

// A drink recipe / tasting card — recipecard's ingredients+steps shell reskinned for a pour
// list, where the pour ORDER doubles as the build steps (you make a cocktail by pouring each
// in turn). Closed by a flavor-notes / rating footer instead of nutrition.
export function CocktailCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  pours,
  notes,
  rating,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const safePours = Array.isArray(pours) ? pours : [];
  const safeRating = Number.isFinite(rating)
    ? Math.min(5, Math.max(0, rating as number))
    : undefined;
  const noteRows: { label: string; text: string }[] = [];
  if (notes?.aroma) noteRows.push({ label: 'Aroma', text: notes.aroma });
  if (notes?.taste) noteRows.push({ label: 'Taste', text: notes.taste });
  if (notes?.finish) noteRows.push({ label: 'Finish', text: notes.finish });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeRating !== undefined && (
        <div className="cc-rating">
          <span className="cc-stars" aria-hidden="true">
            <span className="cc-stars-fill" style={{ width: (safeRating / 5) * 100 + '%' }}>
              {'★★★★★'}
            </span>
            <span className="cc-stars-track">{'★★★★★'}</span>
          </span>
          <span className="cc-rating-val tab-num">{safeRating.toFixed(1)}</span>
        </div>
      )}

      <div className="cc-section-label">Build</div>
      <ol className="cc-pour-list">
        {safePours.map((pour, i) => (
          <li key={i} className="cc-pour">
            <span className="cc-pour-num">{i + 1}</span>
            {pour?.qty && <span className="cc-pour-qty">{pour.qty}</span>}
            <span className="cc-pour-item">{pour?.item}</span>
          </li>
        ))}
      </ol>

      {noteRows.length > 0 && (
        <div className="cc-notes">
          {noteRows.map((row) => (
            <div key={row.label} className="cc-note-row">
              <span className="cc-note-label">{row.label}</span>
              <span className="cc-note-text">{row.text}</span>
            </div>
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
