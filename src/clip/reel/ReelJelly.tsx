// The reel's brand mark — the same creature as the living face, drawn from the shared geometry
// (src/presence/geometry.ts) exactly like the flagship marks, never a hollow-eyed CSS lookalike.
// It stays a static SVG (the reel's float animation rides the wrapper): each template palette tints
// the one jelly through the --reel-orb-* slots rather than inventing its own mascot. The gradient id
// is per-instance because several boards render at once (the gallery grid, the offscreen export
// pass), and shared SVG ids would cross-wire their bell fills.
import { useId } from 'react';
import {
  BELL,
  BELL_SHEEN,
  TENTS,
  EYES,
  EYE_Y,
  EYE_R,
  SMILE,
  CHEEKS,
} from '../../presence/geometry';

export function ReelJelly({ size }: { size?: 'sm' }) {
  const uid = useId().replace(/\W/g, '');
  const grad = `reel-jelly-${uid}`;
  return (
    <div className="reel-jelly" data-size={size} aria-hidden="true">
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
            <stop className="reel-jelly-stop s1" offset="0" />
            <stop className="reel-jelly-stop s2" offset="0.55" />
            <stop className="reel-jelly-stop s3" offset="1" />
          </linearGradient>
        </defs>
        <g className="reel-jelly-strands">
          {TENTS.map((d, i) => (
            <path className={`c${i + 1}`} d={d} key={i} />
          ))}
        </g>
        <path className="reel-jelly-bell" d={BELL} fill={`url(#${grad})`} />
        <path className="reel-jelly-sheen" d={BELL_SHEEN} />
        <g className="reel-jelly-face">
          {CHEEKS.map(({ side, cx, cy }) => (
            <ellipse className="reel-jelly-cheek" cx={cx} cy={cy} rx={8} ry={5} key={side} />
          ))}
          {EYES.map(({ side, x }) => (
            <g key={side}>
              <circle className="reel-jelly-ball" cx={x} cy={EYE_Y} r={EYE_R} />
              <circle className="reel-jelly-pupil" cx={x} cy={EYE_Y + 0.7} r={5.2} />
              <circle className="reel-jelly-glint" cx={x + 2.5} cy={EYE_Y - 2.7} r={2.3} />
            </g>
          ))}
          <path className="reel-jelly-smile" d={SMILE} />
        </g>
      </svg>
    </div>
  );
}
