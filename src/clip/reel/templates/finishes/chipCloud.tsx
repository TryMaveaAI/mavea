// A conceptmap as a tag cloud: the center idea as a bold word, its connected ideas as a wrapped
// grid of tinted chips that pop in around it. Light, airy, fits any aspect.
import type { SlideProps } from '../types';
import { fitLine, fitText, TITLE_TIERS, WORD_TIERS } from '../fitText';

const TINT = [
  'var(--reel-accent)',
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-orb-2)',
  'var(--reel-accent)',
];

export function ChipCloudSlide({ slots }: SlideProps<'conceptmap'>) {
  const nodes = slots.nodes.slice(0, 5);
  const center = slots.center.trim();
  // A one-word center reads best set solid like a hero word (whole, never ellipsized); a phrase
  // reflows on the title ramp instead.
  const centerFit = center.includes(' ')
    ? fitText(center, TITLE_TIERS)
    : fitLine(center, WORD_TIERS);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3.4)',
        width: 'calc(var(--rw) * 90)',
        maxWidth: '92%',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'color-mix(in oklab, var(--reel-ink) 55%, transparent)',
        }}
      >
        How it connects
      </span>
      <div
        className="reel-fade"
        data-fit-tier={centerFit.tier}
        style={{
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'var(--reel-ink)',
          ...centerFit.style,
        }}
      >
        {center}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 'calc(var(--ru) * 1.6) calc(var(--rw) * 2.4)',
        }}
      >
        {nodes.map((n, i) => (
          <span
            key={i}
            style={{
              padding: 'calc(var(--ru) * 1.5) calc(var(--rw) * 3.2)',
              borderRadius: 999,
              font: '600 calc(var(--ru) * 2.9)/1 var(--reel-sans)',
              color: 'var(--reel-ink)',
              background: `color-mix(in oklab, ${TINT[i % TINT.length]} 15%, transparent)`,
              border: `1px solid color-mix(in oklab, ${TINT[i % TINT.length]} 42%, transparent)`,
              animation: `reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) ${0.15 + i * 0.09}s both`,
            }}
          >
            {n.label}
          </span>
        ))}
      </div>
    </div>
  );
}
