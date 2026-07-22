import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { WeldSymbolProps, WeldJoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WeldSymbolProps & { delay?: number };

// A welding callout: the joint cross-section on the left and the AWS weld symbol on the right.
// The symbol's anatomy (reference line, arrow, weld glyph, size, length-pitch, tail) is the
// engineering-correct convention; a small legend below explains each part so a reader who is
// not a welder can still parse it. All geometry is fixed — the props only choose the joint kind
// and fill the size/length/pitch strings — so the figure is always crisp and correct.

const JOINT_LABEL: Record<WeldJoint, string> = {
  fillet: 'Fillet joint (tee)',
  groove: 'V-groove joint',
  lap: 'Lap joint',
  butt: 'Butt joint',
  tee: 'Tee joint',
};

export function WeldSymbol({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  joint,
  side = 'arrow',
  size,
  length,
  pitch,
  process,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // Per-instance marker id so two weld symbols in one answer don't share `wld-ah`.
  const ahId = `wld-ah-${useId().replace(/:/g, '')}`;
  // The length-pitch field reads "length-pitch" for intermittent welds, else just the length.
  const lenPitch = length && pitch ? `${length}-${pitch}` : (length ?? '');
  const arrowSide = side === 'arrow' || side === 'both';
  const otherSide = side === 'other' || side === 'both';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="wld-grid">
        {/* the physical joint cross-section */}
        <div className="wld-cell">
          <svg viewBox="0 0 100 80" className="wld-svg" role="img" aria-label={JOINT_LABEL[joint]}>
            <JointFigure joint={joint} />
          </svg>
          <div className="wld-cap">{JOINT_LABEL[joint]}</div>
        </div>

        {/* the AWS weld symbol */}
        <div className="wld-cell">
          <svg viewBox="0 0 140 80" className="wld-svg" role="img" aria-label="AWS weld symbol">
            <defs>
              <marker
                id={ahId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {/* arrow pointing to the joint */}
            <line
              x1="6"
              y1="64"
              x2="34"
              y2="40"
              className="wld-arrow"
              markerEnd={`url(#${ahId})`}
            />
            {/* reference line */}
            <line x1="34" y1="40" x2="118" y2="40" className="wld-ref" data-mark="line" />
            {/* tail (process), drawn as the open V at the far end */}
            {process && (
              <>
                <line x1="118" y1="40" x2="132" y2="32" className="wld-ref" />
                <line x1="118" y1="40" x2="132" y2="48" className="wld-ref" />
                <text x="126" y="40" className="wld-process">
                  {process}
                </text>
              </>
            )}

            {/* the weld-type glyph sits below the line for an arrow-side weld, above for other-side */}
            {arrowSide && <WeldGlyph joint={joint} side="below" />}
            {otherSide && <WeldGlyph joint={joint} side="above" />}

            {/* size to the left of the glyph; length-pitch to the right */}
            {size && (
              <text x="44" y={arrowSide ? 56 : 30} className="wld-dim">
                {size}
              </text>
            )}
            {lenPitch && (
              <text x="78" y={arrowSide ? 56 : 30} className="wld-dim">
                {lenPitch}
              </text>
            )}
          </svg>
          <div className="wld-cap">AWS weld symbol</div>
        </div>
      </div>

      <ul className="wld-legend">
        <li>
          <span className="wld-leg-key">Arrow</span>
          <span className="wld-leg-val">points to the joint</span>
        </li>
        <li>
          <span className="wld-leg-key">Reference line</span>
          <span className="wld-leg-val">below = arrow side, above = other side</span>
        </li>
        {size && (
          <li>
            <span className="wld-leg-key">Size</span>
            <span className="wld-leg-val">{size} weld leg / throat</span>
          </li>
        )}
        {lenPitch && (
          <li>
            <span className="wld-leg-key">Length-pitch</span>
            <span className="wld-leg-val">
              {length && pitch ? `${length} long, every ${pitch} (intermittent)` : `${length} long`}
            </span>
          </li>
        )}
        {process && (
          <li>
            <span className="wld-leg-key">Tail</span>
            <span className="wld-leg-val">{process} process</span>
          </li>
        )}
      </ul>

      {caption && <div className="wld-caption">{caption}</div>}

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

// The joint cross-section: two plates arranged for the joint kind, with the deposited weld metal
// shaded so the reader sees what the symbol describes.
function JointFigure({ joint }: { joint: WeldJoint }) {
  switch (joint) {
    case 'fillet':
    case 'tee':
      return (
        <g>
          {/* vertical member sitting on a horizontal member */}
          <rect x="44" y="8" width="12" height="44" className="wld-metal" />
          <rect x="14" y="52" width="72" height="14" className="wld-metal" />
          {/* the fillet weld — a triangle in the inside corner */}
          <path d="M44,52 L44,38 L30,52 Z" className="wld-weld" />
          <path d="M56,52 L56,38 L70,52 Z" className="wld-weld" />
        </g>
      );
    case 'lap':
      return (
        <g>
          <rect x="14" y="30" width="50" height="13" className="wld-metal" />
          <rect x="40" y="43" width="46" height="13" className="wld-metal" />
          <path d="M64,30 L64,43 L51,43 Z" className="wld-weld" />
        </g>
      );
    case 'groove':
      return (
        <g>
          {/* two plates with a V gap, filled with weld metal */}
          <path d="M14,30 L44,30 L50,52 L14,52 Z" className="wld-metal" />
          <path d="M86,30 L56,30 L50,52 L86,52 Z" className="wld-metal" />
          <path d="M44,30 L56,30 L50,52 Z" className="wld-weld" />
        </g>
      );
    case 'butt':
    default:
      return (
        <g>
          <rect x="14" y="34" width="33" height="14" className="wld-metal" />
          <rect x="53" y="34" width="33" height="14" className="wld-metal" />
          <rect x="47" y="32" width="6" height="18" className="wld-weld" />
        </g>
      );
  }
}

// The weld-type glyph on the reference line. Fillet = a right triangle; groove = a V (or vertical
// for butt); lap/tee reuse the fillet triangle (the joint kind sets the figure, the glyph the
// process). Drawn just below or just above the reference line (y=40).
function WeldGlyph({ joint, side }: { joint: WeldJoint; side: 'above' | 'below' }) {
  const dir = side === 'below' ? 1 : -1;
  const y0 = 40;
  const h = 9 * dir;
  const cx = 64;
  if (joint === 'groove' || joint === 'butt') {
    // a V (groove) glyph
    return (
      <path
        d={`M${cx - 7},${y0} L${cx},${y0 + h} L${cx + 7},${y0}`}
        className="wld-glyph"
        fill="none"
      />
    );
  }
  // fillet / lap / tee — a filled right triangle on the line
  return (
    <path d={`M${cx - 7},${y0} L${cx - 7},${y0 + h} L${cx + 5},${y0} Z`} className="wld-glyph" />
  );
}
