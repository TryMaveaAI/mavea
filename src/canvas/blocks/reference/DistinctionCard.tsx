import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DistinctionCardProps, DistinctionTerm } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DistinctionCardProps & { delay?: number };

/** Terms without an explicit `color` fall back to this sequence, so the panels stay
 *  distinguishable even when the model omits the field entirely. */
const DEFAULT_COLORS: readonly string[] = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--text-muted)',
];

/** Every accent the design system allows on a block (`AccentVar`). Authored data is already
 *  typed to this set; the runtime check exists for loose model JSON, which must never reach a
 *  `style` value we didn't author. */
const ALLOWED_COLORS: ReadonlySet<string> = new Set([
  'var(--presence)',
  'var(--presence-soft)',
  'var(--presence-deep)',
  'var(--insight)',
  'var(--insight-soft)',
  'var(--warning)',
  'var(--warning-soft)',
  'var(--danger)',
  'var(--text-muted)',
]);

function termColor(term: DistinctionTerm, i: number): string {
  if (typeof term.color === 'string' && ALLOWED_COLORS.has(term.color)) return term.color;
  return DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

/** Widest the term row ever gets. Below this a panel stops being readable at the card's own
 *  `colMin`, so a longer list wraps onto more rows rather than narrowing the panels further. */
const MAX_COLS = 3;

/** Columns for the term row. The card is designed for the two or three terms people actually
 *  confuse; a longer list (a model that over-answered) breaks into balanced rows of at most
 *  `MAX_COLS` instead of shaving every panel down to an unreadable sliver — 4 terms go 2×2, 5
 *  go 3+2, and any n stays within `MAX_COLS` because `ceil(n / ceil(n / MAX_COLS)) <= MAX_COLS`.
 *  The count is handed to CSS rather than assumed there, so the layout follows the data instead
 *  of a fixed N — a mid-width card steps it down to `--dcd-cols-narrow` and the narrowest
 *  stacks the panels. */
function columnCount(n: number): number {
  if (n <= MAX_COLS) return Math.max(n, 1);
  return Math.ceil(n / Math.ceil(n / MAX_COLS));
}

function isFilled(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

// "What's the difference between X and Y" for terms that get mixed up — affect/effect,
// weather/climate, HTTP/HTTPS. Each term gets a panel with its gist and a concrete
// in-context example; beneath them sits the discriminator, the single test that tells them
// apart, as the card's visual anchor. An optional common-mistake line names the slip itself.
export function DistinctionCard({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  terms,
  discriminator,
  discriminatorLabel,
  commonMistake,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.proof;
  // A term with no name has nothing to distinguish — drop it rather than render an unlabelled
  // panel that silently widens the row.
  const safeTerms: DistinctionTerm[] = (Array.isArray(terms) ? terms : []).filter(
    (t): t is DistinctionTerm => !!t && isFilled(t.term),
  );
  const cols = columnCount(safeTerms.length);
  const hasRule = isFilled(discriminator);
  // A blank label (a loose reply sending "" rather than omitting the field) would strand the
  // icon beside nothing, so fall back on empty as well as missing.
  const ruleLabel = isFilled(discriminatorLabel) ? discriminatorLabel : 'The test';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeTerms.length > 0 && (
        <div
          className="dcd-terms"
          style={
            {
              ['--dcd-cols' as string]: cols,
              ['--dcd-cols-narrow' as string]: Math.min(cols, 2),
            } as CSSProperties
          }
        >
          {safeTerms.map((t, i) => (
            <div
              key={i}
              className="dcd-term m-stagger-item m-fade-rise"
              style={
                { ['--i' as string]: i, ['--dcd-c' as string]: termColor(t, i) } as CSSProperties
              }
            >
              <div className="dcd-term-head">
                <span className="dcd-term-name">{t.term}</span>
                {isFilled(t.tag) && <span className="dcd-term-tag">{t.tag}</span>}
              </div>
              {isFilled(t.gist) && <p className="dcd-gist">{t.gist}</p>}
              {isFilled(t.example) && (
                <p className="dcd-example">
                  <span className="dcd-example-k">e.g.</span>
                  {t.example}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The anchor — the one rule that separates them, landing after the panels. It also carries
          data-mark, so the live annotation layer underlines the rule rather than a term. */}
      {hasRule && (
        <div
          className="dcd-rule m-stagger-item m-fade-rise"
          style={{ ['--i' as string]: safeTerms.length } as CSSProperties}
        >
          <div className="dcd-rule-label">
            <Icon.spark className="ic" aria-hidden="true" />
            {ruleLabel}
          </div>
          <p className="dcd-rule-text" data-mark="underline">
            {discriminator}
          </p>
        </div>
      )}

      {isFilled(commonMistake) && (
        <p className="dcd-mistake">
          <Icon.alert className="ic" aria-hidden="true" />
          <span className="dcd-mistake-text">
            <span className="dcd-mistake-k">Common slip&ensp;</span>
            {commonMistake}
          </span>
        </p>
      )}

      {safeTerms.length === 0 && !hasRule && (
        <div className="dcd-empty">No terms to tell apart yet.</div>
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
