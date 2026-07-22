import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ComponentApiProps } from './types';
import './styles.css';
import { richInnerHtml } from '../../../lib/richText';

type Props = ComponentApiProps & { delay?: number };

// A typed prop / contract reference: the full API surface of a component or
// function laid out as a scannable table — name, type, whether it's required,
// its default, and a one-line description. Built for "show me ALL the props of
// X": every row is data the model supplied, so the table never implies a prop
// that wasn't given. Name and type render in the mono face so the contract reads
// like the source it documents; the body scrolls within the card when an API is
// long, keeping the header and column labels pinned in view.
export function ComponentApi({
  title,
  icon = 'sliders',
  iconColor,
  component,
  props,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.sliders;
  const accentColor = iconColor ?? 'var(--insight)';
  const rows = props ?? [];
  const requiredCount = rows.reduce((n, p) => n + (p.required ? 1 : 0), 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: accentColor }} /> {title}
      </div>

      {component && (
        <div className="cap-head">
          <span className="cap-sig">{component}</span>
          {rows.length > 0 && (
            <span className="cap-count">
              {rows.length} {rows.length === 1 ? 'prop' : 'props'}
              {requiredCount > 0 && (
                <span className="cap-count-req"> · {requiredCount} required</span>
              )}
            </span>
          )}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="cap-scroll">
          <div className="cap-table" role="table">
            <div className="cap-row cap-row--head" role="row">
              <span className="cap-th cap-c-name" role="columnheader">
                Prop
              </span>
              <span className="cap-th cap-c-type" role="columnheader">
                Type
              </span>
              <span className="cap-th cap-c-default" role="columnheader">
                Default
              </span>
            </div>

            {rows.map((p, i) => (
              <div className="cap-row" role="row" key={`${p.name}-${i}`}>
                <div className="cap-cell cap-c-name" role="cell">
                  <span className="cap-name">{p.name}</span>
                  {p.required ? (
                    <span className="cap-req" title="Required">
                      <Icon.alert className="ic cap-req-ic" style={{ width: 11, height: 11 }} />
                      required
                    </span>
                  ) : (
                    <span className="cap-opt" title="Optional">
                      optional
                    </span>
                  )}
                </div>

                <div className="cap-cell cap-c-type" role="cell">
                  <span className="cap-type">{p.type}</span>
                </div>

                <div className="cap-cell cap-c-default" role="cell">
                  {p.default != null && p.default !== '' ? (
                    <span className="cap-default">{p.default}</span>
                  ) : (
                    <span className="cap-dash">—</span>
                  )}
                </div>

                {p.desc && (
                  <div className="cap-desc" role="cell">
                    {p.desc}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="cap-empty">No props documented.</p>
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
