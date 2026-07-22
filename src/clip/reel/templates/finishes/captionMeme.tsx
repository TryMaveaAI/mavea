// A "quote" finish laid out like a POV meme: a white meme-text bar up top (dark text, the classic
// Impact-meme reading), a floaty palette-tinted orb suspended on the reel's wash in the middle, then a
// bold bottom caption — the punchline (highlight, falling back to attribution). The white paper + ink
// of a meme box is an intrinsic, non-palette identity (a meme bar reads the same on every reel), so
// those two colors live in a scoped <style>; the orb and punchline recolor with the palette. The bob
// keeps the orb gently alive — it reuses the shared reel-floaty, which is exactly translateY drift.
import type { SlideProps } from '../types';
import { fitText, HERO_TIERS, QUOTE_TIERS } from '../fitText';

export function CaptionMemeSlide({ slots }: SlideProps<'quote'>) {
  const { quote, highlight, attribution } = slots;
  // The bottom line is the punchline: prefer the highlight, fall back to who said it.
  const punch = highlight ?? attribution;
  // Both captions re-set by length: the setup wraps smaller inside its bar, and the punchline —
  // always short — lands bigger the shorter it is, exactly how a meme times its beat.
  const setup = fitText(quote, QUOTE_TIERS);
  const punchFit = punch ? fitText(punch, HERO_TIERS) : undefined;

  return (
    <div
      className="reel-fade"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 4)',
        width: 'calc(var(--rw) * 84)',
        textAlign: 'center',
      }}
    >
      <style>{`.reel[data-palette] { --meme-paper: #f7f7f5; --meme-ink: #15140f; }`}</style>

      {/* The top meme-text bar: white paper, near-black ink, a thin hard edge — reads as a caption box. */}
      <div
        data-fit-tier={setup.tier}
        style={{
          alignSelf: 'stretch',
          background: 'var(--meme-paper)',
          border: '1px solid color-mix(in oklab, var(--meme-ink) 14%, transparent)',
          borderRadius: 'calc(var(--ru) * 1.6)',
          padding: 'calc(var(--ru) * 3) calc(var(--rw) * 4)',
          boxShadow:
            '0 calc(var(--ru) * 5) calc(var(--ru) * 12) calc(var(--ru) * -6) rgba(20, 16, 44, 0.5)',
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.01em',
          color: 'var(--meme-ink)',
          ...setup.style,
        }}
      >
        {quote}
      </div>

      {/* The orb floats on the wash between the two captions — its own bob keeps the beat alive. */}
      <div
        style={{
          width: 'calc(var(--ru) * 26)',
          height: 'calc(var(--ru) * 26)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95) 0%, var(--reel-orb-1) 46%, var(--reel-orb-2) 92%)',
          boxShadow:
            '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -3) var(--reel-glow)',
          animation:
            'reel-floaty 5.5s ease-in-out infinite, reel-pop 0.6s cubic-bezier(0.2,0.7,0.3,1) both',
        }}
      />

      {/* The punchline: a bold bottom caption in the palette accent, the way a meme lands its joke. */}
      {punch && punchFit && (
        <div
          data-fit-tier={punchFit.tier}
          style={{
            fontWeight: 800,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: 'var(--reel-accent)',
            ...punchFit.style,
          }}
        >
          {punch}
        </div>
      )}
    </div>
  );
}
