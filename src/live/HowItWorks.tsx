// HowItWorks.tsx — an on-demand "see how it works" preview for the Live welcome.
//
// Instead of dangling a static example canvas under the setup card (which read like a real
// answer you didn't ask for), the welcome stays clean and this plays a short, clearly-
// labeled EXAMPLE walkthrough on tap: a sample canvas builds and a brief spotlight tour
// glides across it while Mavéa speaks one opener line — then you close it. It reuses the
// honest example sampler (buildLiveSeed — every card marked "Example"), the shared
// TopicCanvas, and the same spotlight-tour beats a real answer uses, so it demonstrates the
// real experience without faking a real answer. No model call.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { TopicCanvas } from '../canvas';
import { Icon } from '../icons/icons';
import { buildLiveSeed } from './liveSeed';
import { liveTourBeats } from './generateBeats';

const OPENER = "Here's how it works — ask anything, and a living canvas builds while I talk.";

/** A dismissable example walkthrough overlay. `speak` (optional) voices the opener line. */
export function HowItWorks({
  onClose,
  speak,
  onFullTour,
}: {
  onClose: () => void;
  speak?: (text: string) => void;
  /** Escalate from this lightweight preview to the real cinematic first-run tour. */
  onFullTour?: () => void;
}): ReactElement {
  const spec = useMemo(() => buildLiveSeed(), []);
  const [spot, setSpot] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Speak the opener once, then walk a short spotlight tour over the lead blocks and
  // release — the same choreography a real answer plays. Fully cancellable (no leaked timer).
  useEffect(() => {
    speak?.(OPENER);
    const beats = liveTourBeats(spec.blocks, { opener: OPENER, maxStops: 3 });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    const step = (): void => {
      if (cancelled || i >= beats.length) return;
      const beat = beats[i++];
      if (beat.set && 'spot' in beat.set) setSpot(beat.set.spot ?? null);
      timer = setTimeout(step, beat.ms ?? 0);
    };
    step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Runs once on mount; speak is stable enough and spec is memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Glide the spotlit block to vertical center (same feel as a real answer).
  useEffect(() => {
    if (!spot) return;
    const id = window.setTimeout(() => {
      const cont = scrollRef.current;
      if (!cont) return;
      const el = cont.querySelector('.spotlit');
      if (!el) return;
      const cRect = cont.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const delta = eRect.top - cRect.top - (cont.clientHeight - eRect.height) / 2;
      cont.scrollTo({ top: Math.max(0, cont.scrollTop + delta), behavior: 'smooth' });
    }, 90);
    return () => window.clearTimeout(id);
  }, [spot]);

  // Escape closes, like any modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // The dialog itself doubles as its own backdrop (no separate scrim element), so a click only
    // dismisses when it lands on the dialog's own empty padding — never on its content, which is
    // what the `e.target === e.currentTarget` guard below preserves. There is no ARIA role for
    // "a dialog that's also its own click-outside-to-dismiss region," so the two rules below are
    // narrowly suppressed for this element rather than mislabelled with an inaccurate role.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="How Live works — an example"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          // A themed surface bar so the header is readable in BOTH light and dark — floating
          // text directly on the dark scrim was invisible in light mode.
          background: 'var(--surface-elevated)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: '10px 14px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-primary)',
          }}
        >
          <Icon.spark style={{ width: 16, height: 16, color: 'var(--presence)' }} />
          Example — how Live answers
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          a sample canvas · ask a real question for real, live data
        </span>
        {onFullTour && (
          <button
            type="button"
            className="entry-action"
            style={{ marginLeft: 'auto', fontSize: 13 }}
            onClick={onFullTour}
          >
            Take the full tour →
          </button>
        )}
        <button
          className="entry-action"
          style={{ marginLeft: onFullTour ? undefined : 'auto', fontSize: 13 }}
          onClick={onClose}
        >
          Got it
        </button>
      </div>
      <div
        ref={scrollRef}
        className="canvas-scroll"
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--surface-default)',
          // A clear edge + lift so the panel reads as a modal, not a dark void blending into
          // the scrim (its sides were invisible in dark theme).
          border: '1px solid var(--line-strong)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div className="topic-wrap">
          <TopicCanvas data={spec} spot={spot} built={{}} onProve={() => {}} />
        </div>
      </div>
    </div>
  );
}
