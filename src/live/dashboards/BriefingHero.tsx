// BriefingHero — today's morning briefing, spoken only on an explicit tap (never on mount: work
// surfaces stay silent by default). The narrative and its metric chips are rendered separately —
// the chips are built client-side from stored dashboard state (see briefing.ts), never parsed out
// of the model's prose, so a chip can't inherit a hallucination the narrative might contain.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Briefing } from './briefing';
import { speakBriefing } from './briefing';
import { cancelSpeech, isSpeaking } from '../../voice/tts';
import { MetricChip } from './MetricChip';
import './dash-home.css';

function formatCompiledAt(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function BriefingHero({ briefing }: { briefing: Briefing }): ReactElement {
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // Kokoro exposes no per-utterance completion event — poll its queue state instead of guessing
  // a duration from word count, so the button flips back the moment the line actually finishes.
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      if (!isSpeaking()) setPlaying(false);
    }, 300);
    return () => window.clearInterval(t);
  }, [playing]);

  // A tap-to-play left playing across a navigation away from this card would keep narrating with
  // no visible stop control left on screen — cancel it on unmount rather than orphan the audio.
  useEffect(
    () => () => {
      if (playingRef.current) cancelSpeech();
    },
    [],
  );

  const toggle = (): void => {
    if (playing) {
      cancelSpeech();
      setPlaying(false);
      return;
    }
    speakBriefing(briefing.text, briefing.spoken);
    setPlaying(true);
  };

  return (
    <section className="card briefing-hero">
      <div className="briefing-hero-head">
        <span className="card-eyebrow briefing-hero-eyebrow">
          MORNING BRIEFING · {formatCompiledAt(briefing.at)} · COMPILED WHILE CHECKING YOUR
          DASHBOARDS
        </span>
        <button
          type="button"
          className="briefing-hero-listen"
          onClick={toggle}
          aria-pressed={playing}
        >
          {playing ? '◼ STOP' : '▸ LISTEN'}
        </button>
      </div>
      <p className="briefing-hero-text">{briefing.text}</p>
      {briefing.chips.length > 0 && (
        <div className="briefing-hero-chips">
          {briefing.chips.map((chip) => (
            <MetricChip
              key={chip.dashboardId}
              label={chip.label}
              value={chip.value}
              dashboardId={chip.dashboardId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
