import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { AnatomyFigureProps, OrganKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AnatomyFigureProps & { delay?: number };

// Pins arrive from untrusted model output — keep every callout on the figure even if a coordinate
// drifts out of range.
const clampPct = (v: number) => Math.max(3, Math.min(97, v));

// A small built-in library of recognizable organ illustrations, each authored in a shared 0–100
// coordinate space so the model's pins (also 0–100) land in the right place. Drawing the organ
// ourselves keeps anatomy answers consistent and image-free — the model names the organ and points
// at parts; the faithful shape is ours. `outline` is the silhouette, `detail` the inner lines/parts.
const ORGANS: Record<OrganKind, { outline: ReactNode; detail?: ReactNode }> = {
  heart: {
    outline: (
      <path d="M50 88 C26 70 12 54 12 37 C12 24 22 15 33 15 C42 15 48 21 50 27 C52 21 58 15 67 15 C78 15 88 24 88 37 C88 54 74 70 50 88 Z" />
    ),
    detail: (
      <>
        {/* great vessels rising from the base, and the septum dividing the chambers */}
        <path className="an-vessel" d="M42 18 C40 9 36 6 31 6" />
        <path className="an-vessel" d="M52 18 C53 8 58 5 63 6" />
        <path className="an-vessel" d="M59 20 C64 12 70 11 73 14" />
        <path className="an-septum" d="M50 27 L50 84" />
        <path className="an-septum" d="M50 50 C62 48 70 54 72 62" />
        <path className="an-septum" d="M50 50 C38 48 30 54 28 62" />
      </>
    ),
  },
  kidney: {
    outline: (
      <path d="M62 14 C78 14 86 30 86 50 C86 72 76 88 60 88 C50 88 46 80 44 70 C42 62 38 60 34 60 C24 60 18 70 18 50 C18 28 30 14 50 14 C55 14 58 14 62 14 Z" />
    ),
    detail: (
      <>
        {/* the hilum notch + the renal pelvis/medulla feeding the ureter */}
        <path
          className="an-cavity"
          d="M40 50 C46 46 52 46 56 50 C60 54 60 60 56 64 C52 68 46 68 40 64"
        />
        <path className="an-vessel" d="M40 50 C32 50 26 54 22 58" />
        <path className="an-vessel" d="M48 66 C48 76 50 84 52 90" />
      </>
    ),
  },
  nephron: {
    outline: <path d="M22 18 C12 18 8 28 16 34 C8 40 12 50 22 48" />,
    detail: (
      <>
        {/* glomerulus in Bowman's capsule, then the looping tubule down to the collecting duct */}
        <circle className="an-cavity" cx="20" cy="32" r="9" />
        <circle className="an-node" cx="20" cy="32" r="5" />
        <path
          className="an-tube"
          d="M28 30 C40 26 44 36 38 42 C32 48 44 52 50 46 C58 38 62 52 56 60 C50 68 60 72 66 64 C74 54 80 64 78 74 L78 92"
        />
        <path className="an-tube an-tube-dn" d="M78 74 C72 78 66 76 64 70" />
      </>
    ),
  },
  brain: {
    outline: (
      <path d="M30 22 C22 18 12 24 14 34 C8 38 8 48 14 52 C12 60 18 68 26 66 C30 74 42 76 48 70 C54 76 66 74 70 66 C80 68 86 58 82 50 C90 44 88 32 80 30 C82 20 70 14 62 20 C56 14 42 14 38 22 C36 21 33 21 30 22 Z" />
    ),
    detail: (
      <>
        {/* the central sulcus, a few gyral folds, and the brainstem stub */}
        <path className="an-fold" d="M48 18 L48 70" />
        <path className="an-fold" d="M26 34 C34 32 36 40 30 44 C36 46 34 54 28 54" />
        <path className="an-fold" d="M68 34 C60 32 58 40 64 44 C58 46 60 54 66 54" />
        <path className="an-fold" d="M40 30 C44 36 44 44 40 50" />
        <path className="an-fold" d="M56 30 C52 36 52 44 56 50" />
        <path className="an-vessel" d="M44 70 C44 82 44 88 42 92" />
        <path className="an-vessel" d="M52 70 C52 82 52 88 54 92" />
      </>
    ),
  },
  lung: {
    outline: (
      <>
        {/* left + right lobes flanking the central trachea/bronchi */}
        <path d="M44 22 C44 40 42 58 36 74 C30 88 18 86 14 74 C10 60 14 40 26 26 C32 19 40 18 44 22 Z" />
        <path d="M56 22 C56 40 58 58 64 74 C70 88 82 86 86 74 C90 60 86 40 74 26 C68 19 60 18 56 22 Z" />
      </>
    ),
    detail: (
      <>
        <path className="an-tube" d="M50 8 L50 30" />
        <path className="an-tube" d="M50 30 C44 32 40 38 36 46" />
        <path className="an-tube" d="M50 30 C56 32 60 38 64 46" />
        <path className="an-tube an-tube-dn" d="M36 46 C32 52 30 58 28 64" />
        <path className="an-tube an-tube-dn" d="M64 46 C68 52 70 58 72 64" />
      </>
    ),
  },
  eye: {
    outline: <path d="M8 50 C24 28 76 28 92 50 C76 72 24 72 8 50 Z" />,
    detail: (
      <>
        {/* iris, pupil, and a corneal highlight */}
        <circle className="an-cavity" cx="50" cy="50" r="20" />
        <circle className="an-node" cx="50" cy="50" r="9" />
        <circle className="an-glint" cx="44" cy="44" r="3" />
        <path className="an-vessel" d="M14 50 C20 46 26 45 30 45" />
        <path className="an-vessel" d="M86 50 C80 54 74 55 70 55" />
      </>
    ),
  },
  ear: {
    outline: (
      <path d="M62 12 C40 8 24 24 24 46 C24 64 32 78 30 88 C28 94 34 96 40 92 C46 88 44 78 50 74 C58 68 60 58 54 54 C48 50 52 42 58 44 C66 46 72 38 70 28 C69 20 67 14 62 12 Z" />
    ),
    detail: (
      <>
        {/* the helix curl, the concha bowl, and the canal */}
        <path className="an-fold" d="M58 20 C46 18 36 28 36 42 C36 52 40 58 40 64" />
        <path className="an-cavity" d="M50 40 C44 40 42 48 48 50 C54 52 56 44 50 40 Z" />
        <path className="an-tube" d="M48 50 C40 54 36 60 34 66" />
      </>
    ),
  },
  neuron: {
    outline: <circle cx="42" cy="50" r="14" />,
    detail: (
      <>
        {/* dendrites in, the nucleus, then the axon out to terminal branches */}
        <circle className="an-node" cx="42" cy="50" r="5" />
        <path className="an-tube" d="M30 42 C20 34 14 32 8 30" />
        <path className="an-tube" d="M30 50 C20 50 14 52 8 54" />
        <path className="an-tube" d="M32 60 C24 66 18 70 12 74" />
        <path className="an-axon" d="M56 50 L82 50" />
        <path className="an-tube an-tube-dn" d="M82 50 C88 44 92 44 96 42" />
        <path className="an-tube an-tube-dn" d="M82 50 C88 56 92 56 96 58" />
        <path className="an-tube an-tube-dn" d="M82 50 L96 50" />
      </>
    ),
  },
  skeleton: {
    outline: (
      <>
        {/* skull, spine, ribcage, pelvis — a schematic axial skeleton */}
        <path d="M50 8 C58 8 62 16 62 22 C62 28 58 32 50 32 C42 32 38 28 38 22 C38 16 42 8 50 8 Z" />
        <path d="M50 32 L50 66" />
        <path d="M46 70 C46 66 54 66 54 70 L58 88 C58 92 42 92 42 88 Z" />
      </>
    ),
    detail: (
      <>
        <path className="an-bone" d="M50 38 C40 40 30 44 26 50" />
        <path className="an-bone" d="M50 38 C60 40 70 44 74 50" />
        <path className="an-bone" d="M50 46 C40 48 32 52 28 58" />
        <path className="an-bone" d="M50 46 C60 48 68 52 72 58" />
        <path className="an-bone" d="M50 54 C42 56 36 60 32 66" />
        <path className="an-bone" d="M50 54 C58 56 64 60 68 66" />
        <path className="an-bone" d="M44 36 L56 36 M44 44 L56 44 M44 52 L56 52" />
      </>
    ),
  },
  stomach: {
    outline: (
      <path d="M30 14 C30 22 32 28 36 34 C42 42 44 54 44 64 C44 78 54 88 66 88 C80 88 86 76 84 64 C82 52 74 46 66 44 C58 42 54 36 54 28 C54 22 52 18 48 16 C42 13 34 12 30 14 Z" />
    ),
    detail: (
      <>
        {/* the esophagus in, the pylorus + duodenum out, and the rugae folds */}
        <path className="an-tube" d="M40 6 C36 6 32 9 30 14" />
        <path className="an-tube an-tube-dn" d="M82 70 C90 70 94 78 94 86" />
        <path className="an-fold" d="M48 40 C56 44 60 52 60 62" />
        <path className="an-fold" d="M44 50 C52 54 56 62 56 70" />
        <path className="an-fold" d="M52 62 C60 66 64 72 64 78" />
      </>
    ),
  },
  liver: {
    outline: (
      <path d="M10 38 C10 30 18 26 30 26 C50 26 70 28 86 34 C92 36 92 44 88 50 C80 62 62 70 42 70 C24 70 12 60 10 48 C10 45 10 41 10 38 Z" />
    ),
    detail: (
      <>
        {/* the falciform ligament splitting the lobes, the gallbladder, and the portal vessels */}
        <path className="an-septum" d="M52 28 L52 66" />
        <path className="an-cavity" d="M40 62 C40 70 36 76 32 76 C28 76 26 70 30 64" />
        <path className="an-vessel" d="M52 50 C44 52 38 56 34 60" />
        <path className="an-vessel" d="M52 50 C62 52 70 54 76 56" />
      </>
    ),
  },
};

export function AnatomyFigure({
  title,
  icon = 'spark',
  iconColor = 'var(--danger)',
  organ,
  pins,
  view,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const [active, setActive] = useState(0);
  const fig = ORGANS[organ] ?? ORGANS.heart;

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

      <div className="an-wrap">
        <div className="an-figbox">
          {view && <span className="an-view">{view}</span>}
          <svg viewBox="0 0 100 100" className="an-svg" role="img" aria-label={title || organ}>
            <g className="an-organ">{fig.outline}</g>
            {fig.detail && <g className="an-organ-detail">{fig.detail}</g>}

            {pins.map((p, i) => {
              const on = i === active;
              const cx = clampPct(p.x);
              const cy = clampPct(p.y);
              return (
                <g
                  key={i}
                  className={'an-pin' + (on ? ' on' : '')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  {/* halo ring on the active pin */}
                  {on && <circle cx={cx} cy={cy} r={5.4} className="an-pin-halo" />}
                  {/* First pin is the authored lead callout; ≤12px dot → point gesture. */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3.4}
                    className="an-pin-dot"
                    {...(i === 0 ? { 'data-mark': 'point' } : {})}
                  />
                  <text x={cx} y={cy} className="an-pin-num">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="an-list">
          {pins.map((p, i) => {
            const on = i === active;
            return (
              <button
                key={i}
                className={'an-row' + (on ? ' on' : '')}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <span className="an-rownum">{i + 1}</span>
                <span className="an-rowbody">
                  <span className="an-rowtitle">{p.label}</span>
                  {p.note && <span className="an-rownote">{p.note}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {caption && <div className="an-caption">{caption}</div>}

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
