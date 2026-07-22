import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NutritionLabelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NutritionLabelProps & { delay?: number };

// A faithful FDA-style Nutrition Facts panel. The numbers are read straight from the props — the
// calorie headline, each nutrient's printed amount, and its %DV — while the heavy rules, the box,
// and the right-aligned %DV column are the recognizable label scaffolding. The header row is shown
// only when at least one nutrient carries a %DV, mirroring how a real panel labels that column.
export function NutritionLabel({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  servingSize,
  servings,
  calories,
  nutrients,
  allergens,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const hasDv = nutrients.some((n) => n.dv !== undefined);

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
      {caption && <div className="nl-caption">{caption}</div>}

      <div className="nl-panel">
        <div className="nl-heading">Nutrition Facts</div>
        <div className="nl-serving-row">
          {servings && <span className="nl-servings">{servings} servings per container</span>}
          <div className="nl-serving">
            <span>Serving size</span>
            <strong>{servingSize}</strong>
          </div>
        </div>

        <div className="nl-rule nl-rule--thick" />

        <div className="nl-cal-row">
          <span className="nl-cal-label">Calories</span>
          <span className="nl-cal-num">{calories.toLocaleString()}</span>
        </div>

        <div className="nl-rule nl-rule--med" />

        {hasDv && <div className="nl-dv-head">% Daily Value*</div>}

        <ul className="nl-nutrients">
          {nutrients.map((n, i) => (
            <li
              key={i}
              className={`nl-nutrient${n.indent ? ' nl-nutrient--sub' : ''}${
                n.bold ? ' nl-nutrient--bold' : ''
              }`}
            >
              <span className="nl-n-name">{n.name}</span>
              <span className="nl-n-amount">{n.amount}</span>
              <span className="nl-n-dv">{n.dv !== undefined ? `${n.dv}%` : ''}</span>
            </li>
          ))}
        </ul>

        {allergens && allergens.length > 0 && (
          <>
            <div className="nl-rule nl-rule--thick" />
            <div className="nl-allergens">
              <strong>Contains:</strong> {allergens.join(', ')}
            </div>
          </>
        )}

        {hasDv && (
          <div className="nl-foot">* Percent Daily Values are based on a 2,000 calorie diet.</div>
        )}
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
