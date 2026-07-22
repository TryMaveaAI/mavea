import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EquationBalancerProps, EquationSpecies, ElementTally } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EquationBalancerProps & { delay?: number };

/** Render a formula with its digits lowered to subscripts (CH4 → CH₄). Charges written as a
 *  trailing ^+ / ^2- are kept as a superscript so ions read correctly. We split on runs of
 *  digits vs. non-digits and emit React nodes — no HTML, so untrusted text stays escaped. */
function Formula({ text }: { text: string }) {
  // Pull off a trailing charge (e.g. "SO4^2-" or "Na^+") before subscripting the rest.
  const chargeMatch = text.match(/\^(\d*[+-])$/);
  const body = chargeMatch ? text.slice(0, chargeMatch.index) : text;
  const charge = chargeMatch ? chargeMatch[1].replace('-', '−') : null;

  const parts = body.split(/(\d+)/).filter((s) => s !== '');
  return (
    <span className="lr-eqb-formula">
      {parts.map((p, i) =>
        /^\d+$/.test(p) ? <sub key={i}>{p}</sub> : <Fragment key={i}>{p}</Fragment>,
      )}
      {charge && <sup className="lr-eqb-charge">{charge}</sup>}
    </span>
  );
}

/** One side of the equation — its species joined by "+". A leading coefficient of 1 is hidden. */
function Side({ species }: { species: EquationSpecies[] }) {
  return (
    <>
      {species.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="lr-eqb-plus">+</span>}
          <span className="lr-eqb-species">
            {s.coeff > 1 && <span className="lr-eqb-coeff">{s.coeff}</span>}
            <Formula text={s.formula} />
          </span>
        </Fragment>
      ))}
    </>
  );
}

export function EquationBalancer({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  reactants = [],
  products = [],
  elementTally = [],
  balanced,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  // Derive the balanced verdict from the tally when not explicitly stated: every element's atom
  // count must match across the arrow. We never fabricate the chemistry — only compare the numbers.
  const tallyMatched = useMemo(
    () => elementTally.every((t: ElementTally) => t.left === t.right),
    [elementTally],
  );
  const isBalanced = balanced ?? (elementTally.length > 0 ? tallyMatched : undefined);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {isBalanced !== undefined && (
          <span
            className={
              isBalanced ? 'lr-eqb-badge lr-eqb-badge--ok' : 'lr-eqb-badge lr-eqb-badge--no'
            }
          >
            {isBalanced ? 'balanced ✓' : 'not balanced'}
          </span>
        )}
      </div>

      {/* The equation: reactants → products. Scrolls horizontally if a long equation overruns. */}
      <div className="lr-eqb-eq">
        <Side species={reactants} />
        <span className="lr-eqb-arrow" aria-label="reacts to form">
          →
        </span>
        <Side species={products} />
      </div>

      {/* Element-conservation tally: a matched row reads insight, a mismatched row danger. */}
      {elementTally.length > 0 && (
        <div className="lr-eqb-tally" role="table" aria-label="Atom balance by element">
          <div className="lr-eqb-trow lr-eqb-thead" role="row">
            <span role="columnheader">Element</span>
            <span role="columnheader">Left</span>
            <span role="columnheader">Right</span>
          </div>
          {elementTally.map((t, i) => {
            const ok = t.left === t.right;
            return (
              <div
                key={i}
                className={ok ? 'lr-eqb-trow lr-eqb-trow--ok' : 'lr-eqb-trow lr-eqb-trow--no'}
                role="row"
              >
                <span className="lr-eqb-el" role="cell">
                  {t.element}
                </span>
                <span className="lr-eqb-n" role="cell">
                  {t.left}
                </span>
                <span className="lr-eqb-n" role="cell">
                  {t.right}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {caption && <p className="lr-eqb-cap">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
