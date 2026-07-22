// briefing/BriefingPlayer.tsx — drives The Briefing: a silent, captioned flight along the argument's
// spine. Each beat frames the camera (via onBeat) and shows a verbatim caption; the flight auto-times
// off each beat's length. SILENT BY DEFAULT — audio is an explicit 🔊 opt-in (then each beat speaks its
// plain twin). Honors prefers-reduced-motion by not auto-advancing (you step it). No model call.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { BeatKind, BriefingBeat } from './types';
import './briefing.css';

export interface BriefingPlayerProps {
  beats: BriefingBeat[];
  /** Frame the camera on + glow this beat's cards. */
  onBeat: (beat: BriefingBeat) => void;
  onExit: () => void;
  /** Speak a line (only called when the reader turns audio on). */
  speak: (text: string) => void;
  cancelSpeak: () => void;
}

const KIND_EYEBROW: Record<BeatKind, string> = {
  open: 'THE CASE',
  tension: 'TENSION',
  verdict: 'THE VERDICT',
  context: 'CONTEXT',
  close: 'IN CLOSING',
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = (): void => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function BriefingPlayer({
  beats,
  onBeat,
  onExit,
  speak,
  cancelSpeak,
}: BriefingPlayerProps): ReactElement {
  const reduced = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [audioOn, setAudioOn] = useState(false);

  // Callbacks read through a ref so the per-beat effect keys only on the beat + audio toggle.
  const cbs = useRef({ onBeat, speak, cancelSpeak });
  cbs.current = { onBeat, speak, cancelSpeak };

  const beat = beats[idx];
  const last = idx >= beats.length - 1;

  // Each beat: frame the camera, and (only if audio is on) speak its plain twin.
  useEffect(() => {
    if (!beat) return;
    cbs.current.onBeat(beat);
    if (audioOn) {
      cbs.current.cancelSpeak();
      cbs.current.speak(beat.spoken);
    }
  }, [beat, audioOn]);

  // Auto-advance while playing (never under reduced-motion — then you step it yourself).
  useEffect(() => {
    if (!playing || reduced || !beat || last) return;
    const t = setTimeout(() => setIdx((i) => Math.min(beats.length - 1, i + 1)), beat.dwellMs);
    return () => clearTimeout(t);
  }, [beat, playing, reduced, last, beats.length]);

  // Reaching the end stops playback (the button becomes "Replay").
  useEffect(() => {
    if (last) setPlaying(false);
  }, [last]);

  // Stop any narration when the briefing closes.
  useEffect(() => () => cbs.current.cancelSpeak(), []);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(beats.length - 1, i + 1)), [beats.length]);
  const togglePlay = useCallback(() => {
    if (last) {
      setIdx(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [last]);
  const toggleAudio = useCallback(() => {
    setAudioOn((a) => {
      if (a) cbs.current.cancelSpeak();
      return !a;
    });
  }, []);

  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  if (!beat) return <></>;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- containment only (see `stop` above), not a click affordance
    <div className="prism-brief" onPointerDown={stop} onWheel={stop} onClick={stop}>
      <div className="prism-brief-caption" role="status" aria-live="polite">
        <span className="prism-brief-eyebrow" data-kind={beat.kind}>
          {KIND_EYEBROW[beat.kind]}
        </span>
        <p className="prism-brief-line">{beat.caption}</p>
      </div>

      <div className="prism-brief-bar">
        <button
          type="button"
          className="prism-brief-btn"
          onClick={prev}
          disabled={idx === 0}
          aria-label="Previous beat"
        >
          ‹
        </button>
        <button
          type="button"
          className="prism-brief-btn prism-brief-play"
          onClick={togglePlay}
          aria-label={last ? 'Replay' : playing ? 'Pause' : 'Play'}
        >
          {last ? '↺' : playing ? '❙❙' : '▶'}
        </button>
        <button
          type="button"
          className="prism-brief-btn"
          onClick={next}
          disabled={last}
          aria-label="Next beat"
        >
          ›
        </button>
        <span className="prism-brief-progress" aria-hidden="true">
          {idx + 1} / {beats.length}
        </span>
        <span className="prism-brief-spacer" />
        <button
          type="button"
          className={'prism-brief-btn prism-brief-audio' + (audioOn ? ' is-on' : '')}
          onClick={toggleAudio}
          aria-pressed={audioOn}
          title={audioOn ? 'Mute narration' : 'Play with audio'}
        >
          {audioOn ? '🔊' : '🔇'}
        </button>
        <button
          type="button"
          className="prism-brief-exit"
          onClick={onExit}
          aria-label="Exit the briefing"
        >
          ✕ Exit
        </button>
      </div>
    </div>
  );
}
