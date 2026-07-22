import { type CSSProperties, type SVGProps } from 'react';
import { Icon } from '../../../icons/icons';
import type { SizeCompareProps, SizeSubject } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SizeCompareProps & { delay?: number };

type Shape = 'whale' | 'bus' | 'human' | 'building' | 'generic';

/** Each template's own natural bounding box — the SOURCE of its aspect ratio. The art is
 *  fixed/decorative (hand-drawn, not derived from any prop); only the final on-screen size
 *  is data-driven, via `principalPx` below. `orient` says which axis of the template IS the
 *  subject's real-world "length": horizontal creatures/vehicles grow by width, upright
 *  things grow by height, so a whale and a building measured in the same unit land on one
 *  honest, shared scale instead of each shape inventing its own. */
const SHAPE_DEF: Record<Shape, { w: number; h: number; orient: 'horizontal' | 'vertical' }> = {
  whale: { w: 240, h: 70, orient: 'horizontal' },
  bus: { w: 200, h: 90, orient: 'horizontal' },
  generic: { w: 90, h: 70, orient: 'horizontal' },
  human: { w: 40, h: 100, orient: 'vertical' },
  building: { w: 70, h: 160, orient: 'vertical' },
};

function isShape(v: unknown): v is Shape {
  return typeof v === 'string' && v in SHAPE_DEF;
}

// Flat, single-tone body silhouettes — decorative icon art (like GhsPictograms or the
// IPA vowel trapezoid elsewhere in this family), not a plotted data curve. Only the
// overall width/height passed in by the caller is data-driven.
function ShapeGlyph({ shape, ...svgProps }: { shape: Shape } & SVGProps<SVGSVGElement>) {
  const vb = SHAPE_DEF[shape];
  return (
    <svg
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMax meet"
      fill="currentColor"
      aria-hidden="true"
      {...svgProps}
    >
      {shape === 'human' && (
        <>
          <circle cx="20" cy="11" r="10" />
          <path d="M8 30 Q20 22 32 30 L34 62 Q27 68 20 68 Q13 68 6 62 Z" />
          <path d="M11 66 L8 100 L17 100 L19 70 Z" />
          <path d="M29 66 L32 100 L23 100 L21 70 Z" />
        </>
      )}
      {shape === 'bus' && (
        <>
          <path d="M6 20 Q6 8 18 8 H172 Q188 8 188 24 V58 Q188 66 180 66 H16 Q6 66 6 56 Z" />
          <rect
            x="18"
            y="17"
            width="152"
            height="19"
            rx="3"
            className="szc-glyph-cut"
            fill="var(--surface-elevated)"
          />
          <circle cx="46" cy="70" r="13" />
          <circle cx="154" cy="70" r="13" />
        </>
      )}
      {shape === 'whale' && (
        <>
          <path d="M4 40 C4 20 40 10 100 9 C170 8 210 20 224 32 L236 26 L232 42 L236 56 L224 50 C214 60 170 66 100 65 C40 64 4 56 4 40 Z" />
          <path d="M60 12 C64 2 76 2 78 12 C72 14 66 14 60 12 Z" />
          <path d="M18 46 C22 54 34 56 40 50 C34 46 24 44 18 46 Z" />
        </>
      )}
      {shape === 'building' && (
        <>
          <rect x="10" y="6" width="50" height="154" rx="2" />
          {Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 3 }, (_, col) => (
              <rect
                key={`${row}-${col}`}
                x={17 + col * 13}
                y={16 + row * 17}
                width="8"
                height="9"
                rx="1"
                className="szc-glyph-cut"
                fill="var(--surface-elevated)"
              />
            )),
          )}
        </>
      )}
      {shape === 'generic' && (
        <path d="M8 55 Q2 30 28 18 Q46 4 66 14 Q86 22 82 42 Q90 52 78 58 Q55 68 30 64 Q12 62 8 55 Z" />
      )}
    </svg>
  );
}

const MAX_PRINCIPAL_PX = 190;
const MIN_PRINCIPAL_PX = 16;

function displayLength(length: unknown, unit?: string): string {
  if (typeof length !== 'number' || !Number.isFinite(length)) return '—';
  const n = length.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}

// Silhouette-based scale comparison: each subject's shape is drawn on a shared ground
// baseline, its size scaled from ONE common pixels-per-unit ratio so a whale and a
// building — measured on totally different natural axes — still land honestly on the
// same scale. Distinct from ScaleFelt, which compares magnitude with a proportional
// BAR rather than a recognisable shape's own footprint.
export function SizeCompare({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  unit,
  subjects,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const safeSubjects: SizeSubject[] = subjects ?? [];

  const maxLength = safeSubjects.reduce((m, s) => {
    const n = typeof s.length === 'number' && Number.isFinite(s.length) ? s.length : -Infinity;
    return n > m ? n : m;
  }, 0);
  const pxPerUnit = maxLength > 0 ? MAX_PRINCIPAL_PX / maxLength : 0;

  const rendered = safeSubjects.map((s) => {
    const shape = isShape(s.shape) ? s.shape : 'generic';
    const def = SHAPE_DEF[shape];
    const validLength = typeof s.length === 'number' && Number.isFinite(s.length) && s.length > 0;
    const principal =
      validLength && pxPerUnit > 0
        ? Math.max(s.length * pxPerUnit, MIN_PRINCIPAL_PX)
        : MIN_PRINCIPAL_PX;
    const width = def.orient === 'horizontal' ? principal : principal * (def.w / def.h);
    const height = def.orient === 'vertical' ? principal : principal * (def.h / def.w);
    return { subject: s, shape, width, height };
  });

  const trackHeight = Math.max(...rendered.map((r) => r.height), MIN_PRINCIPAL_PX);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rendered.length === 0 ? (
        <div className="szc-empty">No subjects yet.</div>
      ) : (
        <div className="szc-scroll">
          <div
            className="szc-row"
            style={{ ['--szc-track-h' as string]: trackHeight + 'px' } as CSSProperties}
          >
            {rendered.map(({ subject, shape, width, height }, i) => (
              <div
                key={i}
                className="szc-item m-stagger-item m-scale-in"
                style={{ ['--i' as string]: i, color: iconColor } as CSSProperties}
              >
                <div className="szc-shape-box">
                  <ShapeGlyph shape={shape} style={{ width, height }} />
                </div>
                <div className="szc-item-label" {...(i === 0 ? { 'data-mark': 'underline' } : {})}>
                  {subject.label}
                </div>
                <div className="szc-item-value">{displayLength(subject.length, unit)}</div>
              </div>
            ))}
          </div>
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
