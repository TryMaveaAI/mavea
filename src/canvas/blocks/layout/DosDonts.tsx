import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HtmlString } from '../../../data/conversation';
import type { DosDontsProps, DosDontsPair } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DosDontsProps & { delay?: number };

/** A field is only "present" when it carries real words — a model that emits `dont: ""` to keep
 *  the shape symmetrical must not open an empty cell opposite a filled one. Takes `unknown`
 *  because it also guards loose JSON: a number or object where a line belongs is not text, and
 *  printing it would read as "[object Object]" (or throw, as a React child). */
function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function Cell({
  text,
  label,
  accent,
  mark,
  solo,
}: {
  text: HtmlString;
  label: string;
  accent: string;
  mark: 'check' | 'x' | 'alert';
  /** the pair has no counterpart, so this cell spans the row */
  solo: boolean;
}) {
  const Mark = mark === 'check' ? Icon.check : mark === 'alert' ? Icon.alert : Icon.x;
  return (
    <div
      className={`lay-dd-cell ${solo ? 'solo' : ''}`}
      style={{ ['--dd' as string]: accent } as CSSProperties}
    >
      <Mark className="ic lay-dd-mark" />
      <div className="lay-dd-cell-body">
        {/* Always in the DOM; CSS shows it only where the column headers can't name the side —
            an unpaired row, a one-sided set, or a card too narrow for two columns. */}
        <span className="lay-dd-tag">{label}</span>
        <span className="lay-dd-text" dangerouslySetInnerHTML={richInnerHtml(text)} />
      </div>
    </div>
  );
}

// Paired guidance: the recommended move next to the thing it replaces, so the contrast reads
// ACROSS each row rather than down two independent columns (proscons' shape, which frames the
// content as a decision being weighed). Pairs are frequently lopsided in practice — four dos and
// one don't — so a pair with one empty side keeps the surviving line and lets it span the row,
// and a set that is one-sided throughout collapses to a single column instead of leaving half
// the card blank.
export function DosDonts({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  heading,
  doLabel = 'Do',
  dontLabel = 'Don’t',
  pairs,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;

  // Loose model JSON does not guarantee an array of objects: `pairs: {}` has no `.filter`, and a
  // null entry throws on `.do` — and a throw here takes the whole card with it, because
  // BlockBoundary's fallback is `null` (a silently vanished card, not a degraded one).
  // Annotated rather than inferred: `Array.isArray` widens a `readonly T[]` to `any[]`, and the
  // point of the guard is that loose JSON can't reach React, not that it loses its type.
  const list: readonly DosDontsPair[] = Array.isArray(pairs) ? pairs : [];
  const rows: DosDontsPair[] = list.filter((p) => !!p && (filled(p.do) || filled(p.dont)));
  const doCount = rows.reduce((n, p) => n + (filled(p.do) ? 1 : 0), 0);
  const dontCount = rows.reduce((n, p) => n + (filled(p.dont) ? 1 : 0), 0);
  // One side missing entirely (all dos, or all don'ts) — a two-column grid would reserve an
  // empty half the whole way down, so drop to one column and let every cell name its own side.
  const single = doCount === 0 || dontCount === 0;

  return (
    <div
      className={`card reveal lay-dd ${single ? 'lay-dd--single' : ''}`}
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {heading && <div className="lay-dd-heading">{heading}</div>}

      {rows.length === 0 ? (
        <div className="lay-dd-empty faint">
          <Icon.eyeOff className="ic" /> No guidance to show yet.
        </div>
      ) : (
        <>
          {!single && (
            <div className="lay-dd-heads">
              <div
                className="lay-dd-head"
                style={{ ['--dd' as string]: 'var(--insight)' } as CSSProperties}
              >
                <Icon.check className="ic" />
                <span>{doLabel}</span>
                <span className="lay-dd-count tab-num">{doCount}</span>
              </div>
              <div
                className="lay-dd-head"
                style={{ ['--dd' as string]: 'var(--warning)' } as CSSProperties}
              >
                <Icon.x className="ic" />
                <span>{dontLabel}</span>
                <span className="lay-dd-count tab-num">{dontCount}</span>
              </div>
            </div>
          )}

          <ul className="lay-dd-list">
            {rows.map((p, i) => {
              const doText = filled(p.do) ? p.do : null;
              const dontText = filled(p.dont) ? p.dont : null;
              // A row always has at least one side (see `rows`), so "one side missing" is exactly
              // "this line has no counterpart". Only meaningful in the two-column layout — in the
              // single-column one every cell already owns the full row.
              const solo = !single && (!doText || !dontText);
              return (
                <li
                  key={i}
                  className="lay-dd-row m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  {/* `filled`, not a truthiness test: a model that sends a number or an object
                      here would otherwise print "[object Object]" or throw on a React child. */}
                  {filled(p.topic) && <span className="lay-dd-topic">{p.topic}</span>}
                  <div className="lay-dd-cells">
                    {doText && (
                      <Cell
                        text={doText}
                        label={doLabel}
                        accent="var(--insight)"
                        mark="check"
                        solo={solo}
                      />
                    )}
                    {dontText && (
                      <Cell
                        text={dontText}
                        label={dontLabel}
                        accent={p.hazard ? 'var(--danger)' : 'var(--warning)'}
                        mark={p.hazard ? 'alert' : 'x'}
                        solo={solo}
                      />
                    )}
                  </div>
                  {filled(p.why) && (
                    <div
                      className="lay-dd-why faint"
                      dangerouslySetInnerHTML={richInnerHtml(p.why)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
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
