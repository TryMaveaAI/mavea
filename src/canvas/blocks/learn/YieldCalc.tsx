import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { withUnit } from '../../lib/format';
import { useCountUp } from '../../lib/motion';
import type { YieldCalcProps, YieldMolesEntry } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = YieldCalcProps & { delay?: number };

/** Lower digit runs to subscripts (H2 → H₂), the same technique EquationBalancer's Formula
 *  uses — split on runs of digits vs. non-digits and emit React text nodes, so untrusted text
 *  stays escaped rather than going through HTML. */
function Formula({ text }: { text: string }) {
  const parts = text.split(/(\d+)/).filter((s) => s !== '');
  return (
    <span className="lr-yc-formula">
      {parts.map((p, i) =>
        /^\d+$/.test(p) ? <sub key={i}>{p}</sub> : <Fragment key={i}>{p}</Fragment>,
      )}
    </span>
  );
}

export function YieldCalc({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  reaction,
  limitingReagent,
  molesAvailable,
  theoreticalYield,
  actualYield,
  unit = 'g',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  // A row only renders when it actually has a name and a real number — a loose model JSON
  // dropping a field just skips that row instead of leaking "undefined"/NaN into the table.
  const molesRows = useMemo(
    () =>
      Array.isArray(molesAvailable)
        ? molesAvailable.filter(
            (m): m is YieldMolesEntry =>
              !!m &&
              typeof m.reagent === 'string' &&
              m.reagent.trim() !== '' &&
              Number.isFinite(m.moles),
          )
        : [],
    [molesAvailable],
  );

  // Both are free-form model fields — guard the type before calling string methods, the same
  // way molesRows above guards `reagent`, rather than trusting the declared prop type.
  const limitingName = typeof limitingReagent === 'string' ? limitingReagent.trim() : '';
  const limitingKey = limitingName ? limitingName.toLowerCase() : undefined;

  // The one piece of real arithmetic this component does: percent yield from the caller's own
  // two figures. Anything short of a positive theoretical yield and a non-negative actual one
  // degrades to "no percent" rather than a guessed or divide-by-zero readout.
  const pct = useMemo(() => {
    if (
      typeof theoreticalYield !== 'number' ||
      !Number.isFinite(theoreticalYield) ||
      theoreticalYield <= 0 ||
      typeof actualYield !== 'number' ||
      !Number.isFinite(actualYield) ||
      actualYield < 0
    ) {
      return null;
    }
    return (actualYield / theoreticalYield) * 100;
  }, [theoreticalYield, actualYield]);

  const pctDecimals = pct !== null && Math.abs(pct - Math.round(pct)) > 0.05 ? 1 : 0;
  const pctText = useCountUp(pct ?? 0, { delay: (delay || 0) + 140, decimals: pctDecimals });

  // "->"/"=>" read as arrows in a typed reaction string — the only cosmetic transform applied;
  // the formula itself is shown exactly as given, never re-parsed or re-balanced.
  const reactionText = typeof reaction === 'string' ? reaction.trim() : '';
  const displayReaction = reactionText ? reactionText.replace(/-+>|=+>/g, '→') : null;

  const hasAnything = displayReaction || limitingName || molesRows.length > 0 || pct !== null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {pct !== null && (
          <span
            className={pct > 100 ? 'lr-yc-badge lr-yc-badge--over' : 'lr-yc-badge lr-yc-badge--ok'}
          >
            {pct > 100 ? 'above 100%' : 'yield'}
          </span>
        )}
      </div>

      {displayReaction && <p className="lr-yc-reaction">{displayReaction}</p>}

      {pct !== null ? (
        <div className="lr-yc-head">
          <div className="lr-yc-pct-row">
            <span className="lr-yc-pct tab-num">{pctText}</span>
            <span className="lr-yc-pct-suffix">% yield</span>
          </div>
          <div className="lr-yc-yield-line">
            <strong className="tab-num">{withUnit(actualYield as number, unit)}</strong> actual
            {' / '}
            <strong className="tab-num">{withUnit(theoreticalYield as number, unit)}</strong>{' '}
            theoretical
          </div>
        </div>
      ) : (
        limitingName &&
        molesRows.length === 0 && (
          <p className="lr-yc-cap">
            Limiting reagent: <strong>{limitingName}</strong>
          </p>
        )
      )}

      {molesRows.length > 0 && (
        <div className="lr-yc-table" role="table" aria-label="Moles available by reagent">
          <div className="lr-yc-trow lr-yc-thead" role="row">
            <span role="columnheader">Reagent</span>
            <span role="columnheader">Moles</span>
          </div>
          {molesRows.map((m, i) => {
            const isLimiting =
              limitingKey !== undefined && m.reagent.trim().toLowerCase() === limitingKey;
            return (
              <div
                key={i}
                className={
                  isLimiting
                    ? 'lr-yc-trow lr-yc-trow--limiting m-stagger-item m-fade-rise'
                    : 'lr-yc-trow m-stagger-item m-fade-rise'
                }
                style={{ ['--i' as string]: i } as CSSProperties}
                role="row"
              >
                <span className="lr-yc-reagent" role="cell">
                  <Formula text={m.reagent} />
                  {isLimiting && <span className="lr-yc-limbadge">limiting</span>}
                </span>
                <span className="lr-yc-moles tab-num" role="cell">
                  {m.moles}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!hasAnything && (
        <p className="faint" style={{ fontSize: 13, margin: '4px 0 0' }}>
          Provide a reaction, limiting reagent, or yield figures to compute a result.
        </p>
      )}

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
