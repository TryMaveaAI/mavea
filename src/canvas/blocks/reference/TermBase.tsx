import { type CSSProperties, useMemo } from 'react';
import { Icon } from '../../../icons/icons';
import type { TermBaseProps, TermEntry, TermTranslation } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TermBaseProps & { delay?: number };

// A term-consistency table for professional translators and localization reviewers:
// one row per source term, one column per target language, so a reviewer can scan
// straight down a column and catch a rendering that drifted from the approved one.
// The language columns are DERIVED from whatever `lang` values actually show up
// across the terms (in first-seen order) rather than a fixed list, so the table
// adapts to however many languages a given glossary covers.
export function TermBase({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  terms,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.table;

  // A loose model reply (or the item-array coercer's own repair) can leave `lang`
  // blank on a translation; fold every blank into one shared "—" column rather than
  // one throwaway column per blank entry.
  const langKey = (lang: unknown): string =>
    typeof lang === 'string' && lang.trim() ? lang.trim() : '—';

  const { rows, langs } = useMemo(() => {
    const safeTerms: TermEntry[] = terms ?? [];
    const order: string[] = [];
    const seen = new Set<string>();
    const built = safeTerms.map((t) => {
      const cells = new Map<string, TermTranslation>();
      for (const tr of t.translations ?? []) {
        if (!tr || typeof tr !== 'object') continue;
        const key = langKey(tr.lang);
        if (!seen.has(key)) {
          seen.add(key);
          order.push(key);
        }
        // first translation for a given language wins, in case the model repeats one
        if (!cells.has(key)) cells.set(key, tr);
      }
      return { term: t, cells };
    });
    return { rows: built, langs: order };
  }, [terms]);

  const statusColor = (status?: string): string | undefined => {
    if (status === 'preferred') return 'var(--insight)';
    if (status === 'deprecated') return 'var(--warning)';
    if (status === 'avoid') return 'var(--danger)';
    return undefined;
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 ? (
        <div className="tb-empty">No terms yet.</div>
      ) : langs.length === 0 ? (
        // Terms with no usable translation data at all — still show the source
        // terms rather than an empty card.
        <ul className="tb-flat">
          {rows.map(({ term }, i) => (
            <li
              key={i}
              className="tb-flat-term m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              {term.term}
            </li>
          ))}
        </ul>
      ) : (
        <div className="tb-wrap">
          <table className="tb-table">
            <thead>
              <tr>
                <th scope="col">Term</th>
                {langs.map((lang) => (
                  <th scope="col" key={lang}>
                    {lang}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ term, cells }, i) => (
                <tr
                  key={i}
                  className="m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <td className="tb-term-col">{term.term}</td>
                  {langs.map((lang) => {
                    const cell = cells.get(lang);
                    const text = cell && typeof cell.text === 'string' ? cell.text : '';
                    const c = statusColor(cell?.status);
                    return (
                      <td className="tb-cell" key={lang}>
                        {text ? (
                          <span className="tb-cell-text">
                            {c && (
                              <span
                                className="tb-dot"
                                style={{ ['--tb-c' as string]: c } as CSSProperties}
                                title={cell?.status}
                              />
                            )}
                            {text}
                          </span>
                        ) : (
                          <span className="tb-dash">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
