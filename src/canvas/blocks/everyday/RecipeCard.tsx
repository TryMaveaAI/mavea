import { type CSSProperties, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { RecipeCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RecipeCardProps & { delay?: number };

export function RecipeCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  servings,
  prepTime,
  cookTime,
  difficulty,
  ingredients,
  steps,
  tips,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [showTips, setShowTips] = useState(false);

  const difficultyColor =
    difficulty === 'easy'
      ? 'var(--insight)'
      : difficulty === 'hard'
        ? 'var(--warning)'
        : 'var(--text-muted)';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rc2-meta">
        {servings && <span className="rc2-chip">Serves {servings}</span>}
        {prepTime && (
          <span className="rc2-chip">
            <Icon.clock className="ic" style={{ width: 11, height: 11 }} /> Prep {prepTime}
          </span>
        )}
        {cookTime && (
          <span className="rc2-chip">
            <Icon.sun className="ic" style={{ width: 11, height: 11 }} /> Cook {cookTime}
          </span>
        )}
        {difficulty && (
          <span className="rc2-chip" style={{ color: difficultyColor }}>
            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
          </span>
        )}
      </div>

      <div className="rc2-body">
        <div className="rc2-ingredients">
          <div className="rc2-section-label">Ingredients</div>
          <ul className="rc2-ing-list">
            {ingredients.map((ing, i) => (
              <li key={i} className="rc2-ing">
                {(ing.qty || ing.unit) && (
                  <span className="rc2-qty">
                    {ing.qty}
                    {ing.unit ? ' ' + ing.unit : ''}
                  </span>
                )}
                <span className="rc2-ing-name">{ing.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rc2-steps">
          <div className="rc2-section-label">Steps</div>
          <ol className="rc2-step-list">
            {steps.map((step, i) => (
              <li key={i} className="rc2-step">
                <span className="rc2-step-num">{i + 1}</span>
                <span className="rc2-step-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {tips && tips.length > 0 && (
        <div className="rc2-tips-section">
          <button className="rc2-tips-toggle" onClick={() => setShowTips(!showTips)}>
            <Icon.sparkle className="ic" style={{ width: 12, height: 12 }} />
            {showTips ? 'Hide tips' : `${tips.length} pro tip${tips.length > 1 ? 's' : ''}`}
          </button>
          {showTips && (
            <ul className="rc2-tips-list">
              {tips.map((tip, i) => (
                <li key={i} className="rc2-tip">
                  {tip}
                </li>
              ))}
            </ul>
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
