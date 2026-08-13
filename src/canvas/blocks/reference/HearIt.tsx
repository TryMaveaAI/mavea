import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { HearItProps, HearItItem } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { cancelKokoro, kokoroKnownAvailable, speakKokoroResult } from '../../../voice/kokoro';

type Props = HearItProps & { delay?: number };

// "Hear it": each row plays a short sound on tap — a spoken word (local Kokoro),
// or a single musical note / raw tone (a one-shot WebAudio oscillator). Voice-first
// surface for pronunciation drills, interval ear-training, and tuning references.
// Audio is created on demand and torn down the moment it finishes (the AudioContext
// is closed after every tone, the utterance cleared after every word) so nothing
// is left running between taps or after unmount.

type AudioCtor = typeof AudioContext;
const AUDIO_CTOR: AudioCtor | undefined =
  typeof window !== 'undefined'
    ? (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext)
    : undefined;

// Semitone offsets from C within an octave, covering both sharps and flats so a
// model can emit either spelling (e.g. "A#3" or "Bb3" resolve to the same pitch).
const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  FB: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
  CB: 11,
};

// Map a note name like "A4", "C#5", or "Bb3" to its frequency in Hz using equal
// temperament anchored at A4 = 440 Hz. Returns null for an unparseable string so
// the caller can fall back to the raw numeric value instead of guessing a pitch.
function noteToHz(name: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d{1,2})$/.exec(name.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2] === '#' ? '#' : m[2] === 'b' ? 'B' : '';
  const semitone = SEMITONES[letter + accidental];
  if (semitone === undefined) return null;
  const octave = Number(m[3]);
  // MIDI note number, then standard MIDI→Hz. C4 (middle C) is MIDI 60.
  const midi = semitone + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Resolve an item's stored value to a frequency: a bare number (or numeric string)
// is taken as Hz directly; otherwise it is treated as a note name.
function resolveHz(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  const asNum = Number(trimmed);
  if (trimmed !== '' && Number.isFinite(asNum)) return asNum;
  return noteToHz(trimmed);
}

const KIND_ICON: Record<HearItItem['kind'], 'chat' | 'speaker'> = {
  word: 'chat',
  note: 'speaker',
  tone: 'speaker',
};

export function HearIt({
  title,
  icon = 'speaker',
  iconColor = 'var(--presence)',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.speaker;
  const safeItems = items ?? [];

  // Index of the row currently sounding (for the pressed/animating state), or null.
  const [playing, setPlaying] = useState<number | null>(null);
  // Kokoro is the only voice: when it isn't running a word row animates and nothing is heard,
  // so the card says so once. Rows stay tappable — the service may come up later.
  const [voiceDown, setVoiceDown] = useState(false);

  // Live handles to whatever audio is in flight, so unmount can stop it cleanly.
  const ctxRef = useRef<AudioContext | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tear down any oscillator/context and any pending utterance. Safe to call
  // repeatedly; used both before starting a new sound and on unmount.
  const stopAll = useCallback(() => {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (ctxRef.current) {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      // close() rejects if already closed/closing — swallow that, it is benign.
      ctx.close().catch(() => {});
    }
    cancelKokoro();
  }, []);

  // Stop everything when the card leaves the screen — no dangling audio graph,
  // timer, or queued speech survives unmount.
  useEffect(() => stopAll, [stopAll]);

  const speak = useCallback((text: string, idx: number) => {
    setPlaying(idx);
    void speakKokoroResult(text, 'mavea').then((played) => {
      setPlaying((cur) => (cur === idx ? null : cur));
      // A cancelled line resolves false too (stopAll drains the previous one on every tap), so
      // only the settled health probe is proof the service is actually down.
      if (!played && kokoroKnownAvailable() === false) setVoiceDown(true);
    });
  }, []);

  const tone = useCallback((hz: number, idx: number) => {
    if (!AUDIO_CTOR) return;
    const ctx = new AUDIO_CTOR();
    ctxRef.current = ctx;
    const now = ctx.currentTime;
    const dur = 0.6;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, now);

    // Gentle attack/decay envelope so the note swells and fades rather than clicking.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);

    setPlaying(idx);
    // When the note finishes, drop the pressed state and close THIS context (only
    // if it is still the active one — a newer tap may have already replaced it).
    osc.onended = () => {
      setPlaying((cur) => (cur === idx ? null : cur));
      if (ctxRef.current === ctx) {
        ctxRef.current = null;
        ctx.close().catch(() => {});
      }
    };
    // Belt-and-braces: if onended never fires (some engines on tab-blur), close
    // shortly after the scheduled stop so the context is never orphaned.
    stopTimerRef.current = setTimeout(
      () => {
        if (ctxRef.current === ctx) {
          ctxRef.current = null;
          ctx.close().catch(() => {});
          setPlaying((cur) => (cur === idx ? null : cur));
        }
      },
      (dur + 0.15) * 1000,
    );
  }, []);

  const play = useCallback(
    (item: HearItItem, idx: number) => {
      stopAll();
      if (item.kind === 'word') {
        speak(String(item.value), idx);
        return;
      }
      const hz = resolveHz(item.value);
      if (hz === null || hz <= 0) return;
      tone(hz, idx);
    },
    [stopAll, speak, tone],
  );

  // Spoken rows use the local service; a note/tone needs WebAudio.
  const canPlay = (item: HearItItem): boolean =>
    item.kind === 'word' || (!!AUDIO_CTOR && resolveHz(item.value) !== null);

  // Only a note/tone row ever disables, so with WebAudio present the sole cause is a value that
  // resolves to no pitch — the data, not the browser.
  const reason = AUDIO_CTOR
    ? 'This note can’t be played'
    : 'Audio playback is unavailable in this browser';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ul className="hri-rows">
        {safeItems.map((item, i) => {
          const enabled = canPlay(item);
          const isPlaying = playing === i;
          const RowIcon = Icon[KIND_ICON[item.kind]] ?? Icon.speaker;
          return (
            <li key={i} className="hri-row" data-playing={isPlaying || undefined}>
              <button
                type="button"
                className="hri-play"
                onClick={() => play(item, i)}
                disabled={!enabled}
                title={enabled ? `Play ${item.label}` : reason}
                aria-label={enabled ? `Play ${item.label}` : `${item.label} — ${reason}`}
              >
                {isPlaying ? (
                  <span className="hri-wave" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <Icon.play className="ic hri-play-ic" style={{ width: 13, height: 13 }} />
                )}
              </button>

              <div className="hri-body">
                <div className="hri-label">{item.label}</div>
                {item.sub && <div className="hri-sub">{item.sub}</div>}
              </div>

              <span className="hri-kind">
                <RowIcon className="ic hri-kind-ic" style={{ width: 12, height: 12 }} />
                {item.kind}
              </span>
            </li>
          );
        })}
      </ul>

      {voiceDown && (
        <p className="insight-summary" role="status" style={{ marginTop: 12 }}>
          Voice is off — start the local voice service to hear this.
        </p>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
