// The dock's speaking status: a compact pill ("Speaking · tap to interrupt") that appears
// whenever Mavéa is talking, plus — only when captions are on — a ribbon of the line being
// voiced, phrases lighting up as the voice reaches them (the figures inside them take the
// highlight mark too, so shown and said stay visibly in step). Rides IN the bottom dock as an
// ordinary row, never floats over the canvas — everything downstream (the scrubber, the
// canvas' own padding) already offsets by the dock's measured height, so this can't overlap a
// card at any viewport width.
//
// Honesty note: Kokoro exposes no word timestamps, so the ribbon's progression is the same
// words-per-minute estimate the spotlight tour paces itself with, clamped by the real
// isSpeaking() signal — phrase-level, never claiming word-level precision.
//
// Voice only: a caption is an opt-in subtitle (the video-player CC pattern), so this earns its
// place only when there's a voice to sync to. When muted the caller hides it entirely — a muted
// turn reveals its content directly, with no walk left to caption.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { renderHeroLine } from '../voice/emphasize';
import './turnstate.css';

const WORD_MS = 385; // mirrors the tour's spoken-duration estimate (~155 wpm)
const MIN_MS = 1200;
const MAX_MS = 14000;
const TICK_MS = 150;
// A tour's silence between stops (the 200ms isSpeaking() poll, plus the gap while the next line
// queues) must not read as "Mavéa stopped talking" and collapse the dock row — linger past a
// speaking gap this long before actually hiding.
const LINGER_MS = 600;

interface Phrase {
  text: string;
  endFrac: number;
}

function phrasesOf(line: string): Phrase[] {
  const parts = line.split(/(?<=[,;:.!?—])\s+/).filter((p) => p.trim());
  if (parts.length === 0) return [];
  const weights = parts.map((p) => Math.max(1, p.split(/\s+/).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return parts.map((text, i) => {
    acc += weights[i];
    return { text, endFrac: acc / total };
  });
}

export function SpeakingDock({
  line,
  speaking,
  captions,
  onInterrupt,
  idle = null,
}: {
  line: string | null;
  speaking: boolean;
  /** Show the caption ribbon (the CC toggle). The pill shows regardless — it's a control, not
   *  a subtitle. */
  captions: boolean;
  onInterrupt: () => void;
  /** Rendered in place of the pill when there's nothing to speak about — the linger above still
   *  applies, so this only appears once the fade-out has actually finished. Omit for the old
   *  behavior (render nothing): Demo has no idle content for this slot. */
  idle?: ReactElement | null;
}): ReactElement | null {
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    if (!speaking || !line) return;
    const words = line.split(/\s+/).length;
    const total = Math.min(MAX_MS, Math.max(MIN_MS, words * WORD_MS));
    const started = performance.now();
    setFrac(0);
    let timer = 0;
    const tick = (): void => {
      const f = Math.min(1, (performance.now() - started) / total);
      setFrac(f);
      if (f < 1) timer = window.setTimeout(tick, TICK_MS);
    };
    timer = window.setTimeout(tick, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [line, speaking]);

  // Lingers past a brief speaking gap (a tour's stop-to-stop pause, or a missed poll tick) so
  // the dock row can't bounce open and shut between lines.
  const [visible, setVisible] = useState(speaking);
  useEffect(() => {
    if (speaking) {
      setVisible(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [speaking]);

  const phrases = useMemo(() => (line ? phrasesOf(line) : []), [line]);
  if (!visible || !line || phrases.length === 0) return idle;
  const activeIdx = phrases.findIndex((p) => p.endFrac > frac);
  const litThrough = activeIdx === -1 ? phrases.length - 1 : activeIdx;
  return (
    <div className="speak-strip">
      <button type="button" className="speak-pill" onClick={onInterrupt}>
        <span className="speak-orb" aria-hidden="true"></span>
        Speaking · tap to interrupt
      </button>
      {captions && (
        <p className="speak-ribbon" aria-hidden="true">
          {phrases.map((p, i) => (
            <span key={i} className={'speak-phrase' + (i <= litThrough ? ' said' : '')}>
              {renderHeroLine(p.text)}{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
