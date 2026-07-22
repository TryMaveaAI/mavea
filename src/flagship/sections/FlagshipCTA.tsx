// The closing call to action — the promise restated, earned: the block vocabulary the visitor
// has seen all page (bars, lines, pins, nodes, claims) returns as faint outlines and settles
// into orbit around the orb and the words. Same headline as the hero, new meaning.
import { Orb } from '../Orb';

// Stroke-only outlines of the page's own visual vocabulary, placed around the composition's
// edges. Positions are % of the CTA stage; --gx/--gy is where each drifts in from.
const GHOSTS = [
  { id: 'bars', x: '13%', y: '22%', gx: -46, gy: 12, o: 0.14 },
  { id: 'line', x: '86%', y: '26%', gx: 44, gy: 10, o: 0.13 },
  { id: 'donut', x: '7%', y: '58%', gx: -38, gy: -8, o: 0.12 },
  { id: 'pin', x: '92%', y: '62%', gx: 40, gy: -10, o: 0.13 },
  { id: 'node', x: '20%', y: '86%', gx: -30, gy: 22, o: 0.11 },
  { id: 'claim', x: '79%', y: '87%', gx: 34, gy: 24, o: 0.12 },
  { id: 'wave', x: '50%', y: '7%', gx: 0, gy: -26, o: 0.11 },
];

function GhostShape({ id }: { id: string }) {
  switch (id) {
    case 'bars':
      return (
        <svg viewBox="0 0 74 54" aria-hidden="true">
          <rect x="6" y="26" width="14" height="24" rx="3" />
          <rect x="30" y="10" width="14" height="40" rx="3" />
          <rect x="54" y="34" width="14" height="16" rx="3" />
        </svg>
      );
    case 'line':
      return (
        <svg viewBox="0 0 74 54" aria-hidden="true">
          <polyline points="4,46 22,30 38,36 56,14 70,20" />
          <circle cx="56" cy="14" r="3" />
        </svg>
      );
    case 'donut':
      return (
        <svg viewBox="0 0 54 54" aria-hidden="true">
          <circle cx="27" cy="27" r="19" strokeDasharray="89 30" strokeDashoffset="-12" />
        </svg>
      );
    case 'pin':
      return (
        <svg viewBox="0 0 54 54" aria-hidden="true">
          <path d="M27 6a15 15 0 0 1 15 15c0 10-15 27-15 27S12 31 12 21A15 15 0 0 1 27 6z" />
          <circle cx="27" cy="21" r="5" />
        </svg>
      );
    case 'node':
      return (
        <svg viewBox="0 0 74 54" aria-hidden="true">
          <rect x="14" y="18" width="46" height="20" rx="10" />
          <path d="M4 28h10M60 28h10" />
        </svg>
      );
    case 'claim':
      return (
        <svg viewBox="0 0 74 54" aria-hidden="true">
          <rect x="6" y="8" width="62" height="38" rx="7" />
          <path d="M14 22h34M14 32h24" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 74 54" aria-hidden="true">
          <path d="M8 27v0M20 18v18M32 10v34M44 16v22M56 22v10M68 25v4" />
        </svg>
      );
  }
}

export function FlagshipCTA({ onEnterLive }: { onEnterLive: (seed?: string) => void }) {
  return (
    <div className="fl-cta">
      {GHOSTS.map((g, i) => (
        <span
          key={g.id}
          className="fl-cta-ghost"
          aria-hidden="true"
          style={{
            left: g.x,
            top: g.y,
            ['--gx' as string]: `${g.gx}px`,
            ['--gy' as string]: `${g.gy}px`,
            ['--go' as string]: String(g.o),
            ['--g-i' as string]: String(i),
          }}
        >
          <GhostShape id={g.id} />
        </span>
      ))}
      <Orb size={84} className="fl-cta-orb" />
      <h2 className="fl-cta-title">
        Talk to it. Type to it.
        <br />
        <em className="fl-grad">See what it means.</em>
      </h2>
      <button type="button" className="fl-cta-btn" onClick={() => onEnterLive()}>
        Open Mavéa
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <div className="fl-cta-note">
        No account. The demo is key-free — Live runs on your keys. Provider terms and charges apply;
        AI output can be wrong.
      </div>
    </div>
  );
}
