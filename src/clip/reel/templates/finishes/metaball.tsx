// A "concept" finish that suspends the term over a blob of liquid goo: two or three overlapping circles
// fused by an SVG gaussian-blur + color-matrix filter (the classic "metaball" alpha threshold), each
// drifting on its own loop so the mass kneads and morphs. No card — the goo floats on the reel's wash,
// which is what sells the organic, lava-lamp feel; the title rides above it with a mono tag below.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

// Each ball's resting spot (cx, cy), radius, and a drift offset — hand-tuned so the three overlap into
// one connected mass at rest and pull apart as they wander, never fully separating.
const BALLS = [
  { cx: 50, cy: 46, r: 24, anim: 'goo1' },
  { cx: 38, cy: 56, r: 18, anim: 'goo2' },
  { cx: 64, cy: 54, r: 16, anim: 'goo1' },
] as const;

export function MetaballSlide({ slots }: SlideProps<'concept'>) {
  // Both lines size by length: a bridged title re-sets smaller so it never dwarfs the goo, and the
  // caption line takes whichever slot is present.
  const head = fitText(slots.title, HERO_TIERS);
  const caption = slots.subtitle ?? slots.tag;
  const cap = caption ? fitText(caption, BODY_TIERS) : undefined;
  return (
    <div
      className="reel-fade"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3)',
        width: 'calc(var(--rw) * 84)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes meta-goo1 { 0%,100% { transform: translate(0,0); } 33% { transform: translate(6%,-5%); } 66% { transform: translate(-5%,4%); } }
        @keyframes meta-goo2 { 0%,100% { transform: translate(0,0); } 33% { transform: translate(-6%,5%); } 66% { transform: translate(5%,-4%); } }
      `}</style>

      {/* The goo lives in one square. The filter blurs the fills, then the color-matrix steepens alpha
          so blurred edges snap to a hard rim — overlapping balls melt into a single contour. */}
      <svg
        viewBox="0 0 100 100"
        style={{
          width: 'calc(var(--ru) * 50)',
          height: 'calc(var(--ru) * 50)',
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient id="meta-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--reel-orb-1)" />
            <stop offset="100%" stopColor="var(--reel-orb-2)" />
          </linearGradient>
          <filter id="meta-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
          </filter>
        </defs>
        <g filter="url(#meta-goo)">
          {BALLS.map((b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill="url(#meta-fill)"
              style={{
                transformOrigin: `${b.cx}px ${b.cy}px`,
                animation: `meta-${b.anim} ${7 + i * 1.6}s ease-in-out ${i * 0.5}s infinite`,
              }}
            />
          ))}
        </g>
      </svg>

      <h2
        data-fit-tier={head.tier}
        style={{
          margin: 0,
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'var(--reel-ink)',
          ...head.style,
        }}
      >
        {slots.title}
      </h2>

      {caption && cap && (
        <span
          data-fit-tier={cap.tier}
          style={{
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            letterSpacing: '0.06em',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
            maxWidth: 'calc(var(--rw) * 76)',
            ...cap.style,
          }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}
