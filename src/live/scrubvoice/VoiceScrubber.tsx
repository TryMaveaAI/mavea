// "Scrub the voice, the canvas time-travels." The settled turn's real spoken track as a
// waveform strip: drag anywhere and the canvas un-builds to exactly what was on screen at
// that moment; release and the voice plays forward from there while the blocks rebuild in
// sync. A play/pause button drives the same replay without a drag, and a rate chip speeds it
// up or slows it down (0.75×–2×) with the pitch held natural. The waveform is drawn from the
// actual PCM the user heard — nothing synthesized.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { sharedAudioContext, voiceEnergyTap } from '../../voice/voiceEnergy';
import { useLiveConfig } from '../useLiveConfig';
import { clampSpeed, formatRate, nextRate } from './voiceSpeed';
import type { TurnAudio } from './recorder';
import { pcmToWavBlobUrl } from './wav';
import './scrubvoice.css';

const BAR_COUNT = 160;

/** Peak-downsample the track into waveform bars (computed once per audio). */
function peaksOf(audio: TurnAudio): number[] {
  const win = Math.max(1, Math.floor(audio.pcm.length / BAR_COUNT));
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    let peak = 0;
    const start = i * win;
    const end = Math.min(audio.pcm.length, start + win);
    for (let j = start; j < end; j++) {
      const v = Math.abs(audio.pcm[j]);
      if (v > peak) peak = v;
    }
    out.push(peak);
  }
  return out;
}

export type VoiceScrubberUnavailableReason = 'recording' | 'muted' | 'offline' | 'past' | 'missing';

interface Props {
  audio: TurnAudio | null;
  /** Where the playhead/scrub sits (seconds), or null when at rest (live canvas). */
  t: number | null;
  /** Position changed — while dragging AND while replay plays forward. `building` is true only
   *  when the user is actively dragging (or arrow-keying) to rewind: that's an explicit request to
   *  un-build the canvas to that moment. Plain playback passes false, so pressing play to listen
   *  moves only the playhead and never collapses the answer. */
  onSeek: (t: number | null, building?: boolean) => void;
  /** Why the stable voice strip is present without an active scrub track. */
  unavailable?: VoiceScrubberUnavailableReason;
}

const UNAVAILABLE_COPY: Record<VoiceScrubberUnavailableReason, { title: string; hint: string }> = {
  recording: {
    title: 'Preparing voice scrub',
    hint: 'It appears here as soon as Mavéa finishes speaking.',
  },
  muted: {
    title: 'Voice was muted',
    hint: 'Unmute before the next answer to capture a scrub track.',
  },
  offline: {
    title: 'Voice is off',
    hint: 'Start the local TTS service to hear and scrub future answers.',
  },
  past: {
    title: 'Voice scrub lives on the latest answer',
    hint: 'Return to live to replay the current spoken track.',
  },
  missing: {
    title: 'No voice track captured',
    hint: 'The answer is still here as captions, but there is no audio to scrub.',
  },
};

function VoiceScrubberUnavailable({
  reason,
}: {
  reason: VoiceScrubberUnavailableReason;
}): ReactElement {
  const copy = UNAVAILABLE_COPY[reason];
  return (
    <div
      className="voice-scrub voice-scrub--empty"
      role="status"
      aria-label="Voice scrub unavailable"
    >
      <span className="voice-scrub-empty-dot" aria-hidden="true"></span>
      <span className="voice-scrub-empty-copy">
        <span className="voice-scrub-empty-title">{copy.title}</span>
        <span className="voice-scrub-empty-hint">{copy.hint}</span>
      </span>
    </div>
  );
}

function PlayableVoiceScrubber({
  audio,
  t,
  onSeek,
}: {
  audio: TurnAudio;
  t: number | null;
  onSeek: (t: number | null, building?: boolean) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const peaks = useRef<number[] | null>(null);
  const dragging = useRef(false);
  // The track's WAV object URL, built lazily on first play and revoked when the track changes.
  // Playing through an <audio> element (not a buffer source) is what gives us preservesPitch.
  const wavUrl = useRef<string | null>(null);
  // The in-flight replay: its <audio> element, energy-tap release, and rAF loop.
  const playing = useRef<{ stop: () => void; el: HTMLAudioElement } | null>(null);
  // Mirrors `playing.current` for the play/pause button (a ref alone won't re-render the icon).
  const [isPlaying, setIsPlaying] = useState(false);
  // The playhead during plain playback, kept LOCAL so the 60fps walk re-renders only this strip.
  // Routing every frame through onSeek used to re-render the whole Live surface per frame — the
  // parent genuinely needs the position only at the boundaries (play start, pause, drag, end),
  // so those commit through onSeek and the frames in between stay here. Rendered position is
  // `localT ?? t`: parent-driven while dragging/at rest, local while the voice plays forward.
  const [localT, setLocalT] = useState<number | null>(null);
  const pos = localT ?? t;
  // Voice speed is the ONE persisted control (shared with the dock chip). The recording was
  // rendered at `audio.speed`, so the replay <audio> element runs at speed÷recorded — usually 1×
  // (play it as spoken), but a later speed change re-times it, pitch preserved, instead of
  // stacking on the rate already baked into the PCM. `playRateRef` mirrors it so a playing element
  // adopts a change without a restart and a fresh play picks up the current rate.
  const [cfg, setCfg] = useLiveConfig();
  const speed = clampSpeed(cfg.voiceSpeed);
  const playRate = speed / (audio.speed || 1);
  const playRateRef = useRef(playRate);
  playRateRef.current = playRate;

  const stopPlayback = useCallback((): void => {
    playing.current?.stop();
    playing.current = null;
    setIsPlaying(false);
  }, []);

  // Replay from `from`: a blob-backed <audio> element with pitch preserved (so the rate chip
  // doesn't chipmunk the voice), the face-energy tap (the mouth tracks the replayed waveform
  // too), and a rAF loop that walks the playhead. Playback keeps the full canvas — only the
  // playhead moves; it never un-builds (that's reserved for an active drag).
  const playFrom = useCallback(
    (from: number): void => {
      stopPlayback();
      // Gate on WebAudio: it powers the face-energy tap, and its absence (jsdom, locked-down
      // browsers) is our "no replay" signal — matches the prior buffer-source behavior.
      if (!sharedAudioContext()) return;
      // Settle the canvas to its full self the instant playback starts — never wait on the first
      // rAF tick to clear an un-built drag preview. A delayed or throttled frame (e.g. a
      // backgrounded tab) would otherwise leave the answer collapsed while the voice plays.
      onSeek(from);
      setLocalT(from);
      if (!wavUrl.current) wavUrl.current = pcmToWavBlobUrl(audio.pcm, audio.sampleRate);
      const el = new Audio(wavUrl.current);
      el.preservesPitch = true;
      // Safari still ships the prefixed name; set it too so the voice stays natural there.
      (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      el.playbackRate = playRateRef.current;
      // Seek to the start offset. Setting currentTime before metadata loads is honored by modern
      // browsers, but re-apply once on loadedmetadata so a drag-release into the middle never
      // snaps back to 0 where a browser deferred the early seek.
      el.currentTime = from;
      if (from > 0) {
        el.addEventListener(
          'loadedmetadata',
          () => {
            if (Math.abs(el.currentTime - from) > 0.05) el.currentTime = from;
          },
          { once: true },
        );
      }
      const release = voiceEnergyTap(el);
      void el.play().catch(() => {
        /* autoplay blocked or unsupported (jsdom) — the strip simply stays at rest */
      });
      let raf = 0;
      const step = (): void => {
        if (el.ended || el.currentTime >= audio.duration) {
          stop();
          playing.current = null;
          setIsPlaying(false);
          setLocalT(null);
          onSeek(null); // played out — settle back to the live canvas
          return;
        }
        setLocalT(el.currentTime); // el.currentTime is real audio seconds at any playbackRate
        raf = requestAnimationFrame(step);
      };
      const stop = (): void => {
        cancelAnimationFrame(raf);
        try {
          el.pause();
          el.removeAttribute('src');
        } catch {
          /* already stopped */
        }
        release();
      };
      playing.current = { stop, el };
      setIsPlaying(true);
      raf = requestAnimationFrame(step);
    },
    [audio, onSeek, stopPlayback],
  );

  // Play resumes from the playhead (or the start when at rest); pause holds it where it is —
  // committed to the parent, since the frames while playing lived only in localT.
  const togglePlay = useCallback((): void => {
    if (playing.current) {
      const cur = playing.current.el.currentTime;
      stopPlayback();
      setLocalT(null);
      onSeek(cur);
    } else {
      playFrom(pos ?? 0);
    }
  }, [pos, playFrom, stopPlayback, onSeek]);

  // Step to the next speed (persisted, shared with the dock). A change — from here OR the dock
  // chip mid-replay — reaches a playing element instantly through the effect below.
  const cycleRate = useCallback((): void => {
    setCfg({ voiceSpeed: nextRate(speed) });
  }, [setCfg, speed]);
  useEffect(() => {
    if (playing.current) playing.current.el.playbackRate = playRate;
  }, [playRate]);

  // A different turn's audio (or unmount) silences any replay and frees the old WAV URL.
  useEffect(() => {
    return () => {
      stopPlayback();
      if (wavUrl.current) {
        URL.revokeObjectURL(wavUrl.current);
        wavUrl.current = null;
      }
    };
  }, [audio, stopPlayback]);

  // Draw the waveform + playhead. Cheap: bars once into a path per render, device-pixel aware.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!peaks.current) peaks.current = peaksOf(audio);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const styles = getComputedStyle(canvas);
    const played = styles.getPropertyValue('--scrub-played').trim() || '#8a93f8';
    const rest = styles.getPropertyValue('--scrub-rest').trim() || '#5c647833';
    const frac = pos === null ? 1 : Math.max(0, Math.min(1, pos / audio.duration));
    const bw = w / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      const amp = Math.max(0.06, peaks.current[i]);
      const bh = amp * (h - 4);
      g.fillStyle = i / BAR_COUNT <= frac ? played : rest;
      g.fillRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh);
    }
  }, [audio, pos]);

  // Reset cached peaks — and any local playhead — when the track changes.
  useEffect(() => {
    peaks.current = null;
    setLocalT(null);
  }, [audio]);

  const timeAt = (clientX: number): number => {
    const rect = stripRef.current!.getBoundingClientRect();
    if (!rect.width) return 0; // unmeasured strip (e.g. jsdom) — pin to the start
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * audio.duration;
  };

  return (
    <div className="voice-scrub">
      <button
        type="button"
        className="voice-scrub-play"
        // keep the press off the slider so it never scrubs
        onPointerDown={(e) => e.stopPropagation()}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play the spoken answer'}
        title={isPlaying ? 'Pause' : 'Play from here'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true">
            <rect x="2.5" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
            <rect x="7.1" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true">
            <path d="M3.2 2.2 L10 6 L3.2 9.8 Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="voice-scrub-rate"
        // keep the press off the slider so it never scrubs
        onPointerDown={(e) => e.stopPropagation()}
        onClick={cycleRate}
        aria-label={`Speed, currently ${formatRate(speed)}. Tap to change.`}
        title="Voice speed"
      >
        {formatRate(speed)}
      </button>
      <div
        ref={stripRef}
        className="voice-scrub-body"
        role="slider"
        aria-label="Scrub the spoken answer"
        aria-valuemin={0}
        aria-valuemax={Math.round(audio.duration)}
        aria-valuenow={Math.round(pos ?? audio.duration)}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true;
          stopPlayback();
          setLocalT(null); // the drag position is parent-driven from here
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* capture is a nicety — scrubbing works without it */
          }
          // A drag is an explicit rewind: un-build the canvas to this moment (building=true).
          onSeek(timeAt(e.clientX), true);
        }}
        onPointerMove={(e) => {
          if (dragging.current) onSeek(timeAt(e.clientX), true);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          playFrom(timeAt(e.clientX));
        }}
        onKeyDown={(e) => {
          const cur = pos ?? audio.duration;
          if (e.key === 'ArrowLeft') {
            stopPlayback();
            setLocalT(null);
            onSeek(Math.max(0, cur - 2), true); // keyboard rewind un-builds, like a drag
          }
          if (e.key === 'ArrowRight') {
            stopPlayback();
            setLocalT(null);
            onSeek(Math.min(audio.duration, cur + 2), true);
          }
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePlay();
          }
          if (e.key === 'Escape') {
            stopPlayback();
            setLocalT(null);
            onSeek(null);
          }
        }}
      >
        <canvas ref={canvasRef} className="voice-scrub-wave" aria-hidden="true" />
        <span className="voice-scrub-hint">
          {isPlaying
            ? 'playing — tap pause or drag to scrub'
            : pos === null
              ? 'play, or drag to rewind the voice'
              : 'the canvas is rebuilt to this moment'}
        </span>
      </div>
    </div>
  );
}

export function VoiceScrubber({ audio, t, onSeek, unavailable = 'missing' }: Props): ReactElement {
  if (!audio) return <VoiceScrubberUnavailable reason={unavailable} />;
  return <PlayableVoiceScrubber audio={audio} t={t} onSeek={onSeek} />;
}
