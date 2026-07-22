// Entity-relationship view of the data model: tables with typed fields and the relations between them.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { SchemaProps } from '../data/conversation';

type Props = SchemaProps & { delay?: number };

export function SchemaDiagram({
  title = 'The data model',
  entities,
  relations,
  footer,
  delay,
}: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.layers className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="schema">
        {entities.map((e, i) => (
          <div
            className="entity"
            key={i}
            style={{ '--ec': e.color || 'var(--presence)' } as CSSProperties}
          >
            <div className="entity-head">
              <Icon.table style={{ width: 13, height: 13 }} /> {e.name}
              {e.badge && <span className="entity-badge">{e.badge}</span>}
            </div>
            <div className="entity-fields">
              {e.fields.map((f, j) => (
                <div className="entity-field" key={j}>
                  <span className={'ef-key' + (f.key ? ' is-key' : '')}>{f.name}</span>
                  <span className="ef-type">{f.type}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {relations && (
        <div className="relations">
          {relations.map((r, i) => (
            <span className="relation" key={i}>
              <b>{r.from}</b> {r.label} <b>{r.to}</b>
            </span>
          ))}
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
