// A concept finish styled as an instant photo: a tilted cream polaroid with a palette-tinted "photo"
// pane up top and a handwritten caption on the wide bottom border. The cream stock is an intrinsic,
// non-palette identity (real polaroid film is warm off-white), so it lives in a scoped <style>; the
// photo itself recolors with the reel. The bob keyframe bakes in the -4deg tilt — the shared
// reel-floaty resets to translateY(0) and would flatten the lean — so it's local and uniquely named.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS } from '../fitText';

export function PolaroidSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // The caption strip under the photo is narrow (frame + strip padding leave ~47rw of writing
  // room), so the handwriting sizes by length — a long caption settles smaller, the way real pen
  // work crams to fit the border.
  const cap = fitText(title, TITLE_TIERS, 47);
  const note = subtitle ? fitText(subtitle, BODY_TIERS, 47) : undefined;
  return (
    <div
      style={{
        // The whole photo leans -4deg and drifts gently, the way a snapshot pinned to a board sways.
        animation:
          'polaroid-bob 6s ease-in-out infinite, reel-pop 0.6s cubic-bezier(0.2,0.7,0.3,1) both',
        // A warm paper, a thin warm edge and a soft drop the photo casts onto the wash.
        background: 'var(--polaroid-cream)',
        padding: 'calc(var(--ru) * 3) calc(var(--ru) * 3) 0',
        borderRadius: 'calc(var(--ru) * 0.8)',
        boxShadow:
          '0 calc(var(--ru) * 7) calc(var(--ru) * 16) calc(var(--ru) * -5) rgba(20, 16, 44, 0.55)',
        width: 'calc(var(--rw) * 62)',
      }}
    >
      <style>{`
        .reel[data-palette] { --polaroid-cream: #f7f3e9; --polaroid-pen: #2b2620; }
        @keyframes polaroid-bob {
          0%, 100% { transform: rotate(-4deg) translateY(0); }
          50% { transform: rotate(-4deg) translateY(calc(var(--ru) * -1.8)); }
        }
      `}</style>

      {/* The exposed photo: a soft radial gradient through the orb tints, with a faint inner vignette. */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          borderRadius: 'calc(var(--ru) * 0.3)',
          overflow: 'hidden',
          background:
            'radial-gradient(120% 110% at 32% 24%, var(--reel-orb-1) 0%, var(--reel-orb-2) 78%)',
          boxShadow: 'inset 0 0 calc(var(--ru) * 6) rgba(0, 0, 0, 0.28)',
        }}
      >
        {tag && (
          <span
            style={{
              position: 'absolute',
              left: 'calc(var(--ru) * 2)',
              bottom: 'calc(var(--ru) * 2)',
              font: '600 calc(var(--ru) * 2)/1 var(--reel-mono)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.92)',
            }}
          >
            {tag}
          </span>
        )}
      </div>

      {/* The wide bottom border carries the handwritten caption. */}
      <div style={{ padding: 'calc(var(--ru) * 3) calc(var(--ru) * 1) calc(var(--ru) * 4)' }}>
        <div
          data-fit-tier={cap.tier}
          style={{
            fontStyle: 'italic',
            fontWeight: 700,
            fontFamily: 'var(--reel-serif)',
            letterSpacing: '-0.01em',
            color: 'var(--polaroid-pen)',
            ...cap.style,
          }}
        >
          {title}
        </div>
        {subtitle && note && (
          <div
            data-fit-tier={note.tier}
            style={{
              marginTop: 'calc(var(--ru) * 1.4)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontFamily: 'var(--reel-serif)',
              color: 'color-mix(in oklab, var(--polaroid-pen) 64%, transparent)',
              ...note.style,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
