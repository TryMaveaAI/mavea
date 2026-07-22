import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TypeSpecProps, TypeStyle } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TypeSpecProps & { delay?: number };

// A display head can be authored at any size; render it at that size but clamp so an oversized
// specimen can never push past the card. The body sizes below the clamp render verbatim.
const MAX_RENDER_PX = 46;
// Generic specimen line when a row gives no sample — short enough to set at the largest size
// without wrapping awkwardly, but with mixed case + a descender to show the face honestly.
const DEFAULT_SAMPLE = 'The quick brown fox';

/** Render a font-size as a readable px chip ("32 px"), trimming a trailing ".0". */
function px(n: number): string {
  return `${Number.isInteger(n) ? n : Number(n.toFixed(1))} px`;
}

export function TypeSpec({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  styles,
  pairing,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // The clamp scale is derived once from the largest authored size, so the whole sheet keeps its
  // relative proportions even when the biggest row is scaled down to fit.
  const maxPx = styles.reduce((m, s) => Math.max(m, s.sizePx || 0), 1);
  const scale = maxPx > MAX_RENDER_PX ? MAX_RENDER_PX / maxPx : 1;

  const specChips = (s: TypeStyle) => {
    const chips: string[] = [];
    if (s.family) chips.push(s.family);
    if (s.weight) chips.push(String(s.weight));
    chips.push(px(s.sizePx));
    if (s.lineHeight) chips.push(`${s.lineHeight}×`); // line-height as a multiplier
    if (s.tracking) chips.push(s.tracking);
    return chips;
  };

  return (
    <div
      className="card reveal lay-tspec"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <ol className="lay-tspec-list">
        {styles.map((s, i) => {
          const color = s.color || 'var(--presence)';
          const renderPx = Math.max(11, Math.round((s.sizePx || 16) * scale));
          return (
            <li className="lay-tspec-row" key={i}>
              <div className="lay-tspec-meta">
                <span className="lay-tspec-name" style={{ color }}>
                  {s.name}
                </span>
                <div className="lay-tspec-chips">
                  {specChips(s).map((c, j) => (
                    <span className="lay-tspec-chip tab-num" key={j}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className="lay-tspec-sample"
                style={{
                  fontSize: renderPx + 'px',
                  fontWeight: s.weight ?? 500,
                  lineHeight: s.lineHeight ?? 1.15,
                  letterSpacing: s.tracking,
                  fontFamily: s.family,
                }}
              >
                {s.sample || DEFAULT_SAMPLE}
              </div>
            </li>
          );
        })}
      </ol>

      {pairing && (
        <div className="lay-tspec-pairing">
          <div className="lay-tspec-pair-tag">Pairing</div>
          <div className="lay-tspec-pair-head" style={{ fontFamily: pairing.heading }}>
            {pairing.heading}
          </div>
          <div className="lay-tspec-pair-body" style={{ fontFamily: pairing.body }}>
            <span className="lay-tspec-pair-faces tab-num">
              {pairing.heading} {'·'} {pairing.body}
            </span>{' '}
            pair a confident display face with a calm, readable body face — the heading carries the
            voice while the paragraph stays out of the way and lets the words breathe.
          </div>
        </div>
      )}

      {caption && <div className="lay-tspec-caption faint">{caption}</div>}

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
