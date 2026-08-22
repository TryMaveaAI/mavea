// briefing/BriefingPlayer.tsx — drives The Briefing: a captioned flight along the argument's spine.
// Each beat frames the camera (via onBeat) and shows a verbatim caption, and speaks its plain twin.
// Narration is ON by default for a briefing the reader asked for — being told about the document is
// the point of asking — and OFF for the first-run tour, which narrates over the top itself. Either
// way it is one toggle. Honors prefers-reduced-motion by not auto-advancing (you step it). No model
// call.
//
// WHAT PACES IT. Silent, a beat holds for `dwellMs` — an estimate of how long its caption takes to
// read, which is the only signal there is. With AUDIO ON that estimate is the wrong clock and used
// to be the only one: ~17 characters a second, capped at 7s, while the next beat opened by
// cancelling the current line. Any beat longer than the cap — or any voice slower than 1× — was
// guillotined mid-word, which is what made the document briefing sound like it kept interrupting
// itself. Voiced, a beat now ends when its narration ends, the same rule the reveal walk follows
// (walkSync). Every wait is bounded: a voice that never starts falls back to the silent pacing, and
// one that never finishes is capped, so the flight can stall on nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { bounded } from '../../../lib/bounded';
import { delay, waitLineEnd, MIN_STOP_MS } from '../../walkSync';
import type { SpokenLine } from '../../../voice/tts';
import type { BeatKind, BriefingBeat } from './types';
import './briefing.css';

/** How long to wait for the voice module to hand back a line handle before pacing this beat as if
 *  it were silent. The module is lazily imported, so the first beat pays a chunk fetch. */
const HANDLE_CAP_MS = 4_000;

export interface BriefingPlayerProps {
  beats: BriefingBeat[];
  /** Frame the camera on + glow this beat's cards. */
  onBeat: (beat: BriefingBeat) => void;
  onExit: () => void;
  /** Speak a line (only called when audio is on). Resolves to the line's lifecycle handle, which
   *  is what paces a voiced flight; null when nothing will be heard. */
  speak: (text: string) => Promise<SpokenLine | null>;
  cancelSpeak: () => void;
  /** Whether narration starts on. A briefing the reader ASKED for is a narrated flight — being
   *  told about the document is the point, and starting it mute meant most people never heard it.
   *  The first-run tour passes false: it narrates over the top itself, and two voices at once is
   *  worse than either. Toggleable either way. */
  audioDefault?: boolean;
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

/** The reader's own answer to "should this talk?", remembered across briefings.
 *
 *  `audioDefault` is a good answer to a question nobody has been asked yet — a briefing you asked
 *  for should speak, the tour's own narration should not be talked over. It is a bad answer once
 *  someone HAS answered it: muting a briefing and having the next one start talking again is the
 *  app forgetting an instruction it was just given, every single time.
 *
 *  So three states, not two. Absent means untouched, and the caller's default stands; 'on'/'off' is
 *  a choice and outranks it — but only where speaking was allowed at all, because `audioDefault:
 *  false` is the tour saying "do not talk over me", which is a constraint and not a preference.
 *  Not a cache — nothing here is re-derivable — so it registers no shedder and is written like the
 *  theme (see lib/localBudget on why that distinction matters).
 */
const AUDIO_CHOICE_KEY = 'mavea-brief-audio';

function rememberedAudio(): boolean | null {
  try {
    const raw = localStorage.getItem(AUDIO_CHOICE_KEY);
    return raw === 'on' ? true : raw === 'off' ? false : null;
  } catch {
    return null; // private mode / storage disabled — the default simply stands
  }
}

function rememberAudio(on: boolean): void {
  try {
    localStorage.setItem(AUDIO_CHOICE_KEY, on ? 'on' : 'off');
  } catch {
    /* the choice still holds for this briefing; it just will not outlive it */
  }
}

export function BriefingPlayer({
  beats,
  onBeat,
  onExit,
  speak,
  cancelSpeak,
  audioDefault = true,
}: BriefingPlayerProps): ReactElement {
  const reduced = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  // Lazy initialiser: read the remembered choice once, not on every render.
  //
  // `audioDefault: false` is a CONSTRAINT, not a preference — the first-run tour narrates over the
  // top itself, and two voices at once is exactly what that flag exists to prevent. A remembered
  // "on" must not reach it. Where speaking is allowed, the reader's own answer wins.
  const [audioOn, setAudioOn] = useState(() =>
    audioDefault ? (rememberedAudio() ?? true) : false,
  );

  // Callbacks read through a ref so the per-beat effect keys only on the beat + audio toggle.
  const cbs = useRef({ onBeat, speak, cancelSpeak });
  cbs.current = { onBeat, speak, cancelSpeak };

  const beat = beats[idx];
  const last = idx >= beats.length - 1;

  // This beat's line, once it is speaking. Held in a ref rather than state: the advance effect
  // below awaits it, and re-rendering the whole player when a promise lands buys nothing.
  const lineRef = useRef<Promise<SpokenLine | null> | null>(null);

  // Each beat: frame the camera, and (only if audio is on) speak its plain twin. The cancel here
  // is for a JUMP (prev/next/replay/mute) — advancing naturally leaves nothing to cancel, because
  // the line has already finished by then.
  useEffect(() => {
    if (!beat) return;
    cbs.current.onBeat(beat);
    if (!audioOn) {
      lineRef.current = null;
      return;
    }
    cbs.current.cancelSpeak();
    lineRef.current = cbs.current.speak(beat.spoken).catch(() => null);
  }, [beat, audioOn]);

  // Auto-advance while playing (never under reduced-motion — then you step it yourself).
  useEffect(() => {
    if (!playing || reduced || !beat || last) return;
    let cancelled = false;
    const go = (): void => {
      if (!cancelled) setIdx((i) => Math.min(beats.length - 1, i + 1));
    };
    if (!audioOn) {
      const t = setTimeout(go, beat.dwellMs);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    void (async () => {
      const line = await bounded(lineRef.current ?? Promise.resolve(null), HANDLE_CAP_MS);
      if (cancelled) return;
      // A real line ends the beat when it stops speaking, floored so a one-clause beat still
      // reads. No line (voice down, or the module never loaded) paces as if silent.
      if (line) await waitLineEnd(line, beat.dwellMs, MIN_STOP_MS);
      else await delay(beat.dwellMs);
      go();
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, playing, reduced, last, beats.length, audioOn]);

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
      rememberAudio(!a);
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
          // The glyph was the button's only name, so a screen reader announced "speaker, pressed".
          // The label says what pressing it DOES; the emoji is decoration beside it.
          aria-label={audioOn ? 'Mute narration' : 'Play with audio'}
          title={audioOn ? 'Mute narration' : 'Play with audio'}
        >
          <span aria-hidden="true">{audioOn ? '🔊' : '🔇'}</span>
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
