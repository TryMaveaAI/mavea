import type { CSSProperties } from 'react';
import type { ConjugationTableProps } from './types';

type Props = ConjugationTableProps & { delay?: number };

export function ConjugationTable({ title, verb, language, tenses, note, delay }: Props) {
  // Collect the ordered pronoun list from the first tense; all tenses share the same
  // set of persons so the first tense is the canonical source of truth.
  const pronouns = tenses[0]?.forms.map((f) => f.pronoun) ?? [];

  return (
    <div
      className="card reveal tbl tbl-cj"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {/* eyebrow — language badge + title */}
      <div className="tbl-cj-header">
        <div className="card-eyebrow" style={{ marginBottom: 0 }}>
          {language && <span className="tbl-cj-lang">{language}</span>}
          {title}
        </div>
        <div className="tbl-cj-verb">{verb}</div>
      </div>

      {/* horizontal scroll wrapper so many tenses stay legible on narrow cards */}
      <div className="tbl-cj-scroll">
        <table className="tbl-cj-table">
          <thead>
            <tr>
              {/* top-left corner: empty pronoun header cell */}
              <th className="tbl-cj-corner" scope="col" />
              {tenses.map((t) => (
                <th key={t.name} className="tbl-cj-tense-head" scope="col">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pronouns.map((pronoun, pi) => (
              <tr key={pronoun} className="tbl-cj-row">
                <th className="tbl-cj-pronoun" scope="row">
                  {pronoun}
                </th>
                {tenses.map((t) => {
                  const form = t.forms[pi];
                  return (
                    <td
                      key={t.name}
                      className={`tbl-cj-form${form?.irregular ? ' tbl-cj-irregular' : ''}`}
                    >
                      {form?.form ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* irregular legend + optional note */}
      {tenses.some((t) => t.forms.some((f) => f.irregular)) && (
        <div className="tbl-cj-legend faint">
          <span className="tbl-cj-legend-swatch" /> irregular form
        </div>
      )}

      {note && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {note}
        </div>
      )}
    </div>
  );
}
