import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { UnitConvertProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = UnitConvertProps & { delay?: number };

// Equivalent rows are a flex row (.uc-row); a unit name long enough to outrun its share of that
// row (well past short demo units like "ml"/"tbsp" — real units run "fluid ounces",
// "kilometers per hour") would otherwise overflow past the card edge instead of truncating —
// same fixed-width-name-in-a-flex-row bug as settleup's .su-from/.su-to.
const truncateUnitStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// A measurement-conversion panel: the from-amount is shown prominently, then each equivalent value is
// listed in an aligned "= value unit" row, so "1 cup = 240 ml = 16 tbsp" reads down the card. The
// equivalents are given (real conversions); the component only lays them out and tags the category.
export function UnitConvert({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  quantity,
  from,
  equivalents,
  category,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;

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
      {caption && <div className="uc-caption">{caption}</div>}

      <div className="uc-from">
        <span className="uc-from-qty">{formatValue(quantity)}</span>
        <span className="uc-from-unit">{from}</span>
        {category && <span className="uc-category">{category}</span>}
      </div>

      <ul className="uc-rows">
        {equivalents.map((eq, i) => (
          <li key={i} className="uc-row">
            <span className="uc-eq">=</span>
            <span className="uc-val">{eq.value}</span>
            <span className="uc-unit" style={truncateUnitStyle} title={eq.unit}>
              {eq.unit}
            </span>
          </li>
        ))}
      </ul>

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
