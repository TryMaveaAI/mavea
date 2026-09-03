// ShipMigration.tsx — "The migration": a schema change that reads as harmless and can be an outage.
// Left column shows the change as written (the added lines, then the two facts that make it expensive
// — row count and lock cost) and a plain-language note on why it costs what it costs. Right column
// shows the safe way to ship it: an expand / contract timeline, plus the downstream-readers warning.
// Reads only from the grounded model.migration — the explanation below is derived from the REAL sql
// text and row count, never a fixed story: only a genuine `NOT NULL … DEFAULT` add gets the specific
// full-table-rewrite claim (a general SQL fact, true of any table); anything else — an index, a drop,
// a type change — gets an honest, ungrounded-in-specifics caution instead of a fabricated one.
import type { ReactElement } from 'react';
import type { SectionProps } from './types';
import './shipMigration.css';

export function ShipMigration({ model }: SectionProps): ReactElement {
  const { migration } = model;

  // No schema change in this diff — say so honestly rather than rendering an empty frame.
  if (!migration) {
    return <p className="ripple-mig-none">No schema migration in this change.</p>;
  }

  const { file, sql, rows, lockCost, expand, note } = migration;
  const sqlText = (sql ?? []).join(' ');
  const isNotNullDefault = /\bnot\s+null\b/i.test(sqlText) && /\bdefault\b/i.test(sqlText);
  const rowsKnown = !!rows && /\d/.test(rows);

  return (
    <div className="ripple-mig">
      {/* LEFT — the change as written, and why it costs what it costs */}
      <div className="ripple-mig-left">
        <div className="ripple-mig-code">
          <div className="ripple-mig-code-bar">
            <span className="ripple-mig-code-file">{file}</span>
            <span className="ripple-mig-code-tag">looks harmless</span>
          </div>
          {sql && sql.length > 0 && (
            <div className="ripple-mig-code-body" aria-label="The migration SQL">
              {sql.map((line, i) => (
                <div className="ripple-mig-code-row" key={i}>
                  <span className="ripple-mig-code-gutter" aria-hidden="true">
                    +
                  </span>
                  <code className="ripple-mig-code-line">{line}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ripple-mig-stats">
          {rows && (
            <div className="ripple-mig-stat">
              <span className="ripple-mig-stat-num">{rows}</span>
              <span className="ripple-mig-stat-label">rows</span>
            </div>
          )}
          <div className="ripple-mig-stat">
            <span className="ripple-mig-stat-num">{lockCost}</span>
            <span className="ripple-mig-stat-label">the cost</span>
          </div>
        </div>

        <aside className="ripple-mig-explain">
          <div className="ripple-eyebrow">
            {isNotNullDefault ? 'Why this locks writes' : 'Why this is worth a second look'}
          </div>
          <p className="ripple-mig-explain-body">
            {isNotNullDefault ? (
              <>
                Adding a <code className="ripple-mig-inline">NOT NULL DEFAULT</code> column forces
                the database to rewrite{' '}
                {rowsKnown ? `every one of the ${rows} rows` : 'every existing row'} behind an
                exclusive lock — until that finishes, nothing can write to this table.
              </>
            ) : (
              <>
                A schema change like this can hold an exclusive lock on the table while it runs,
                blocking writes until it&rsquo;s done — whether that&rsquo;s instant or an outage
                comes down to {rowsKnown ? `its ${rows} rows` : 'how large the real table is'}.
              </>
            )}
          </p>
        </aside>
      </div>

      {/* RIGHT — the same change, shipped safely */}
      <div className="ripple-mig-right">
        {/* A safe-shipping plan is specific to the operation. Offered only when there is one for
            what this SQL actually does — never a generic recipe printed beside a different change. */}
        {expand.length > 0 && (
          <>
            <div className="ripple-eyebrow">Ship it this way instead — expand / contract</div>

            <ol className="ripple-mig-steps">
              {expand.map((step, i) => (
                <li className="ripple-mig-step" key={i}>
                  <span className="ripple-mig-step-rail" aria-hidden="true">
                    <span className="ripple-mig-step-dot" />
                  </span>
                  <div className="ripple-mig-step-body">
                    <span className="ripple-mig-step-title">{step.title}</span>
                    <span className="ripple-mig-step-detail">{step.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {note && (
          <div className="ripple-mig-tell">
            <span className="ripple-mig-tell-dot" aria-hidden="true" />
            <div className="ripple-mig-tell-body">
              <span className="ripple-mig-tell-label">And tell the team:</span>
              <span className="ripple-mig-tell-text">{note}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
