// A "conceptmap" finish as a small orbital system: a center "sun" pill for the concept, with each
// satellite node on its OWN dashed SVG ring at an increasing radius (a spiral of orbits rather than
// one shared ring). Only the rings themselves are SVG geometry — every label (center and satellites)
// is an ordinary HTML chip absolutely positioned at the ring's computed coordinates, so it uses the
// normal fitText/FitScale machinery like any other DOM text instead of the SVG-text overflow math
// constellation.tsx/svgLabel.ts need for in-SVG labels.
import type { SlideProps } from '../types';
import { fitLine, TITLE_TIERS, type Ladder } from '../fitText';

const RING = [
  'var(--reel-accent)',
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-orb-2)',
  'var(--reel-accent)',
];
// Evenly spread, independent of node count, so a 3-node map doesn't bunch up.
const ANGLES = [-90, -18, 54, 126, 198];
// Radius (in viewBox percent, box is 0-100) per orbit — outermost stays well inside the 50-unit
// half-width so a node chip's own footprint never clears the frame.
const RADII = [18, 24, 30, 36, 40];

// Chip labels max at 18 chars (CHAR_BUDGET.conceptmap.node) — a ladder scaled well down from the
// card-title ramp keeps that comfortably on one line in a compact chip. The center pill (16-char
// ceiling, but the sun of the system) rides the same ramp a little larger.
const NODE_TIERS: Ladder = TITLE_TIERS.map((t) => ({ ...t, size: t.size * 0.46, maxLines: 1 }));
const CENTER_TIERS: Ladder = TITLE_TIERS.map((t) => ({ ...t, size: t.size * 0.62, maxLines: 1 }));

export function OrbitMapSlide({ slots }: SlideProps<'conceptmap'>) {
  const nodes = slots.nodes.slice(0, 5);
  const centerFit = fitLine(slots.center, CENTER_TIERS);
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 84)',
        maxWidth: '92%',
        aspectRatio: '1',
      }}
    >
      <style>{`@keyframes orbit-ring{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>

      <svg
        viewBox="0 0 100 100"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        {nodes.map((_, i) => (
          <circle
            key={i}
            cx={50}
            cy={50}
            r={RADII[i]}
            fill="none"
            stroke={RING[i % RING.length]}
            strokeWidth="0.4"
            strokeDasharray="2.2 2.4"
            opacity="0.5"
            style={{
              transformOrigin: '50px 50px',
              animation: `orbit-ring 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.1}s both`,
            }}
          />
        ))}
      </svg>

      {nodes.map((n, i) => {
        const angle = (ANGLES[i % ANGLES.length] * Math.PI) / 180;
        const r = RADII[i];
        const left = 50 + r * Math.cos(angle);
        const top = 50 + r * Math.sin(angle);
        const fit = fitLine(n.label, NODE_TIERS);
        return (
          <span
            key={i}
            data-fit-tier={fit.tier}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: 'translate(-50%, -50%)',
              padding: 'calc(var(--ru) * 1.1) calc(var(--rw) * 2.2)',
              borderRadius: 999,
              fontWeight: 600,
              fontFamily: 'var(--reel-sans)',
              color: 'var(--reel-ink)',
              background: `color-mix(in oklab, ${RING[i % RING.length]} 18%, transparent)`,
              border: `1px solid color-mix(in oklab, ${RING[i % RING.length]} 46%, transparent)`,
              animation: `reel-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) ${0.2 + i * 0.1}s both`,
              ...fit.style,
            }}
          >
            {n.label}
          </span>
        );
      })}

      <span
        data-fit-tier={centerFit.tier}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          padding: 'calc(var(--ru) * 2) calc(var(--rw) * 3.6)',
          borderRadius: 999,
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          color: '#fff',
          background: 'linear-gradient(135deg, var(--reel-accent), var(--reel-accent-2))',
          boxShadow: '0 0 calc(var(--ru) * 5) var(--reel-glow)',
          animation: 'reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) both',
          ...centerFit.style,
        }}
      >
        {slots.center}
      </span>
    </div>
  );
}
