// A retro VHS / synthwave "concept" finish: the term sits over a purple→pink→orange sunset, a fat
// sun orb bobbing on the horizon, the title split across two big lines with a magenta/cyan offset
// (the chromatic fringe of a worn VHS tape), and a perspective grid floor scrolling toward the
// vanishing point. The sunset, neon sun and grid magenta are an intrinsic 80s identity — a real
// synthwave frame isn't tinted by the reel's palette — so those few colors live in a scoped <style>;
// only the soft drop leans on the board's wash. sun-bob floats the orb; grid-move scrolls the floor.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, BODY_TIERS } from '../fitText';

// Split the title near its middle word boundary so it stacks as two balanced lines (the classic
// stacked-headline look); a single short word just falls on the first line.
function stack(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return [title, ''];
  const mid = Math.round(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

export function SunsetTapeSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  const [top, bottom] = stack(title);
  // The lockup keys its tier off the full title so both stacked lines share one size — a long quote
  // re-sets smaller instead of blowing the two-line composition past the tape frame.
  const head = fitText(title, HERO_TIERS);
  const sub = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--rw) * 80)',
        padding: 'calc(var(--ru) * 6) calc(var(--rw) * 5) 0',
        borderRadius: 'calc(var(--ru) * 2)',
        overflow: 'hidden',
        background: 'var(--tape-sky)',
        boxShadow:
          '0 calc(var(--ru) * 7) calc(var(--ru) * 16) calc(var(--ru) * -6) rgba(20, 16, 44, 0.55)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the frame staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        .reel[data-palette] {
          --tape-sky: linear-gradient(180deg, #2b1055 0%, #6a1f8f 34%, #d63c87 64%, #ff8a3d 100%);
          --tape-sun-1: #ffe16b;
          --tape-sun-2: #ff5d8f;
          --tape-magenta: #ff36c8;
          --tape-cyan: #3df0ff;
          --tape-ink: #fff4ff;
        }
        @keyframes sun-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(calc(var(--ru) * -2.2)); } }
        @keyframes grid-move { from { background-position: 0 0; } to { background-position: 0 calc(var(--ru) * 8); } }
      `}</style>

      {/* The sun: a neon gradient disc bobbing on the horizon, its lower banding cut by the grid glow. */}
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 'calc(var(--ru) * 3)' }}>
        <div
          style={{
            width: 'calc(var(--ru) * 24)',
            height: 'calc(var(--ru) * 24)',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, var(--tape-sun-1) 0%, var(--tape-sun-2) 100%)',
            boxShadow: '0 0 calc(var(--ru) * 7) calc(var(--ru) * 1) rgba(255, 93, 143, 0.6)',
            animation: 'sun-bob 5.5s ease-in-out infinite',
          }}
        />
      </div>

      {tag && (
        <span
          style={{
            display: 'block',
            textAlign: 'center',
            font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'var(--tape-cyan)',
          }}
        >
          {tag}
        </span>
      )}

      <h2
        data-fit-tier={head.tier}
        style={{
          margin: tag ? 'calc(var(--ru) * 2.2) 0 0' : 0,
          textAlign: 'center',
          fontWeight: 800,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.02em',
          color: 'var(--tape-ink)',
          // The worn-tape chromatic fringe: a magenta ghost left, a cyan ghost right.
          textShadow:
            'calc(var(--rw) * 0.6) 0 0 var(--tape-magenta), calc(var(--rw) * -0.6) 0 0 var(--tape-cyan)',
          ...head.style,
        }}
      >
        {top}
        {bottom && (
          <>
            <br />
            {bottom}
          </>
        )}
      </h2>

      {subtitle && sub && (
        <p
          data-fit-tier={sub.tier}
          style={{
            margin: 'calc(var(--ru) * 2.6) 0 0',
            textAlign: 'center',
            fontWeight: 500,
            fontFamily: 'var(--reel-mono)',
            color: 'color-mix(in oklab, var(--tape-ink) 78%, transparent)',
            ...sub.style,
          }}
        >
          {subtitle}
        </p>
      )}

      {/* The perspective grid floor: tilted neon lines scrolling toward the horizon under the type. */}
      <div
        aria-hidden="true"
        style={{
          height: 'calc(var(--ru) * 22)',
          marginTop: 'calc(var(--ru) * 3)',
          transform: 'perspective(calc(var(--ru) * 28)) rotateX(64deg)',
          transformOrigin: 'bottom center',
          background:
            'repeating-linear-gradient(0deg, var(--tape-magenta) 0 calc(var(--ru) * 0.4), transparent calc(var(--ru) * 0.4) calc(var(--ru) * 8)), repeating-linear-gradient(90deg, var(--tape-magenta) 0 calc(var(--ru) * 0.4), transparent calc(var(--ru) * 0.4) calc(var(--ru) * 8))',
          maskImage: 'linear-gradient(to top, #000 30%, transparent 100%)',
          animation: 'grid-move 1.6s linear infinite',
        }}
      />
    </div>
  );
}
