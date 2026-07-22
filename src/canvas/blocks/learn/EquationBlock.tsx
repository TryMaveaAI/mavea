import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { MathML } from './mathml';
import { TeX } from './TeX';
import type { EquationBlockProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EquationBlockProps & { delay?: number };

export function EquationBlock({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  tex,
  math,
  number,
  caption,
  inline = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // Pick the source: an explicit `tex`, or a `math` string that's actually LaTeX (carries a
  // backslash), routes through KaTeX→MathML; a MathNode tree renders directly. `tex` wins.
  const latex = tex ?? (typeof math === 'string' && math.includes('\\') ? math : undefined);
  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className={'lr-eq' + (inline ? ' inline' : '')}>
        {/* The equation itself is the one datum Mavéa's drawn gesture underlines. */}
        <div className="lr-eq-body" data-mark="underline">
          {latex !== undefined ? (
            <TeX tex={latex} display={!inline} label={title} />
          ) : math !== undefined ? (
            <MathML node={math} display={!inline} label={title} />
          ) : null}
        </div>
        {number && <span className="lr-eq-num">{number}</span>}
      </div>
      {caption && <div className="lr-eq-cap">{caption}</div>}
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
