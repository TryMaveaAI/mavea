// A decorative jelly mark — the marks scattered through the landing (the loop card's title
// dot, the wow grid hub, the closing CTA). Built from the SAME geometry as the living face
// (src/presence/geometry.ts), so every depiction is the one creature at rest — the real
// sparkly eyes, smile and cheeks, never a hollow-eyed lookalike. It stays a static SVG (no
// state machine, no animation loops): Mavéa has exactly one living face (src/presence/
// Presence.tsx, DOM-locked), and these must echo it without competing. All color lives in
// flagship.css (.fl-orb); the gradient id is per-instance — several marks render on one
// page, and shared SVG ids would cross-wire their bell fills.
import { useId } from 'react';
import { BELL, BELL_SHEEN, TENTS, EYES, EYE_Y, EYE_R, SMILE, CHEEKS } from '../presence/geometry';

interface OrbProps {
  /** Mark width in px (the box is a touch taller — the curtains trail below the bell). */
  size?: number;
  className?: string;
}

export function Orb({ size = 84, className }: OrbProps) {
  const uid = useId().replace(/\W/g, '');
  const grad = `fl-jelly-${uid}`;
  return (
    <div
      className={'fl-orb' + (className ? ' ' + className : '')}
      style={{ ['--orb' as string]: `${size}px` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 220" focusable="false">
        <defs>
          <linearGradient
            id={grad}
            x1="40"
            y1="60"
            x2="160"
            y2="104"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="fl-orb-stop s1" offset="0" />
            <stop className="fl-orb-stop s2" offset="0.5" />
            <stop className="fl-orb-stop s3" offset="1" />
          </linearGradient>
        </defs>
        <g className="fl-orb-strands">
          {TENTS.map((d, i) => (
            <path className={`c${i + 1}`} d={d} key={i} />
          ))}
        </g>
        <path className="fl-orb-bell" d={BELL} fill={`url(#${grad})`} />
        <path className="fl-orb-sheen" d={BELL_SHEEN} />
        <g className="fl-orb-face">
          {CHEEKS.map(({ side, cx, cy }) => (
            <ellipse className="fl-orb-cheek" cx={cx} cy={cy} rx={8} ry={5} key={side} />
          ))}
          {EYES.map(({ side, x }) => (
            <g key={side}>
              <circle className="fl-orb-ball" cx={x} cy={EYE_Y} r={EYE_R} />
              <circle className="fl-orb-pupil" cx={x} cy={EYE_Y + 0.7} r={5.2} />
              <circle className="fl-orb-glint" cx={x + 2.5} cy={EYE_Y - 2.7} r={2.3} />
            </g>
          ))}
          <path className="fl-orb-smile" d={SMILE} />
        </g>
      </svg>
    </div>
  );
}
