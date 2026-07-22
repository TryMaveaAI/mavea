import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IngredientMatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = IngredientMatrixProps & { delay?: number };

export function IngredientMatrix({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  recipes,
  ingredients,
  matrix,
  quantities,
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="im-scroll">
        <table className="im-table">
          <thead>
            <tr>
              <th className="im-th im-th--label">Ingredient</th>
              {recipes.map((r, j) => (
                <th key={j} className="im-th">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing, i) => {
              const isHighlighted = highlight && ing.toLowerCase() === highlight.toLowerCase();
              return (
                <tr key={i} className={`im-row${isHighlighted ? ' highlighted' : ''}`}>
                  <td className="im-td-label">{ing}</td>
                  {recipes.map((_, j) => {
                    const used = matrix[i]?.[j] ?? false;
                    const qty = quantities?.[i]?.[j];
                    return (
                      <td key={j} className={`im-td${used ? ' used' : ''}`}>
                        {used ? (
                          qty ? (
                            <span className="im-qty">{qty}</span>
                          ) : (
                            <Icon.check
                              className="ic"
                              style={{ width: 13, height: 13, color: 'var(--insight)' }}
                            />
                          )
                        ) : (
                          <span className="im-empty" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
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
