import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ErDiagramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ErDiagramProps & { delay?: number };

export function ErDiagram({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  entities,
  relationships,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;

  // Auto-grid entities that don't carry explicit positions (2 columns flow).
  const placed = useMemo(
    () =>
      entities.map((e, i) => ({
        ...e,
        gx: e.x !== undefined ? undefined : (i % 2) + 1,
        gy: e.y !== undefined ? undefined : Math.floor(i / 2) + 1,
      })),
    [entities],
  );

  // Relationships resolve both endpoints by id, so index once rather than scanning the entity list
  // twice per row.
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const card = (cardinality?: '1' | 'many') => (cardinality === 'many' ? '∞' : '1');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-er">
        {placed.map((e) => (
          <div
            key={e.id}
            className="dg-er-entity"
            style={e.gx ? ({ gridColumn: e.gx, gridRow: e.gy } as CSSProperties) : undefined}
          >
            <div className="dg-er-name">{e.label}</div>
            <ul className="dg-er-fields">
              {e.fields.map((f, j) => (
                <li key={j} className={'dg-er-field' + (f.key ? ' k-' + f.key : '')}>
                  {f.key && <span className="dg-er-key">{f.key.toUpperCase()}</span>}
                  <span className="dg-er-fname">{f.name}</span>
                  {f.type && <span className="dg-er-ftype">{f.type}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {relationships.length > 0 && (
        <ul className="dg-er-rels">
          {relationships.map((r, i) => {
            const a = byId.get(r.from);
            const b = byId.get(r.to);
            return (
              <li key={i} className="dg-er-rel">
                <b>{a?.label ?? r.from}</b>
                <span className="dg-er-card">{card(r.fromCard)}</span>
                <span className="dg-er-line" />
                <span className="dg-er-card">{card(r.toCard)}</span>
                <b>{b?.label ?? r.to}</b>
                {r.label && <span className="dg-er-rlbl">{r.label}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
