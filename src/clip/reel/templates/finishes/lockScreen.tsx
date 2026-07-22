// A concept finish staged as an iOS lock screen: an oversized clock-like time (built from the tag, or
// a dash when there's none) sits high on the wash, and a frosted "glass" notification slides up below
// it — a small "Mavéa · now" header, the concept's title as the notification title and the subtitle as
// its body. No reel Card: the notification IS a bespoke glass pane, tinted only by palette vars so it
// recolors with the reel; the white frost rgba reads on every dark wash.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS } from '../fitText';

export function LockScreenSlide({ slots }: SlideProps<'concept'>) {
  const { title, subtitle, tag } = slots;
  // Notification copy is real content, not chrome: title and body pick their tier by length so a
  // bridged quote wraps like a long banner inside the glass pane instead of spilling past it.
  const head = fitText(title, TITLE_TIERS);
  const body = subtitle ? fitText(subtitle, BODY_TIERS) : undefined;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 7)',
      }}
    >
      <style>{`
        @keyframes lockscreen-notify {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 5)) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* The big clock face — the tag becomes the "time", with a dash standing in when it's absent. */}
      <div
        style={{
          textAlign: 'center',
          // forwards, not both: zero delay, so this costs nothing visible and avoids the clock face
          // staying blank if the tab was backgrounded when it mounted (a stalled `backwards` fill
          // holds opacity 0).
          animation: 'reel-fade-up 0.6s cubic-bezier(0.2,0.7,0.3,1) forwards',
        }}
      >
        <div
          style={{
            // The big "wake" word reads as the lock-screen time/date line. Use just the first word of
            // the tag so it stays a clean single token (not a truncated "Lin…") and let FitScale size it.
            font: '200 calc(var(--ru) * 13)/0.92 var(--reel-sans)',
            letterSpacing: '-0.03em',
            color: 'var(--reel-ink)',
            maxWidth: 'calc(var(--rw) * 90)',
          }}
        >
          {(tag || '').split(/\s+/)[0] || '—'}
        </div>
      </div>

      {/* The frosted notification: a glass pane that slides up the way a real banner does on wake. */}
      <div
        style={{
          width: 'calc(var(--rw) * 82)',
          padding: 'calc(var(--ru) * 3) calc(var(--rw) * 4.4)',
          borderRadius: 'calc(var(--ru) * 4.5)',
          background: 'rgba(255, 255, 255, 0.16)',
          border: '1px solid rgba(255, 255, 255, 0.28)',
          boxShadow:
            '0 calc(var(--ru) * 5) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          animation: 'lockscreen-notify 0.55s cubic-bezier(0.2,0.7,0.3,1) 0.25s both',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'calc(var(--rw) * 1.4)',
            font: '600 calc(var(--ru) * 2.1)/1 var(--reel-mono)',
            letterSpacing: '0.04em',
            color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 'calc(var(--ru) * 3.2)',
              height: 'calc(var(--ru) * 3.2)',
              borderRadius: 'calc(var(--ru) * 0.9)',
              background: 'linear-gradient(135deg, var(--reel-orb-1), var(--reel-accent-2))',
            }}
          />
          <span style={{ color: 'var(--reel-ink)' }}>Mavéa</span>
          <span>·</span>
          <span>now</span>
        </div>
        <h2
          data-fit-tier={head.tier}
          style={{
            margin: 'calc(var(--ru) * 1.6) 0 0',
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--reel-ink)',
            ...head.style,
          }}
        >
          {title}
        </h2>
        {subtitle && body && (
          <p
            data-fit-tier={body.tier}
            style={{
              margin: 'calc(var(--ru) * 1) 0 0',
              fontWeight: 500,
              fontFamily: 'var(--reel-sans)',
              color: 'color-mix(in oklab, var(--reel-ink) 74%, transparent)',
              ...body.style,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
