// Offline narration renderer — the reason the exported clip's audio actually works.
//
// Instead of tapping the live WebAudio graph while the reel plays (which lost the opening words to a
// start-up race, and went silent entirely under prefers-reduced-motion), we synthesize every slide's
// voiceover to PCM UP FRONT, lay the lines onto the reel's timeline, and hand back one mono buffer
// plus the co-timed per-slide durations. The buffer is deterministic and complete before recording
// starts, so muxing it produces narration that is always present and perfectly in sync.
import { mapConcurrent } from '../../lib/taskPool';
import { sharedSampleRate } from '../../voice/voiceEnergy';
import { decodePcm16 } from '../../voice/streamTts';
import { kokoroVoice } from '../../voice/kokoro';
import { pronounceForSpeech } from '../../voice/pronounce';
import type { ReelScript } from './reelScript';

const KOKORO_RATE = 24000; // Kokoro's native PCM rate (the source samples we synthesize)
const LEAD_S = 0.15; // silence before the first word (absorbs recorder start-up)
const GAP_S = 0.18; // a breath added to each slide so narration never gets cut off
const TAIL_S = 0.5; // silence after the last word so the encoder doesn't clip the ending
const MAX_LINE_CHARS = 240;
const FADE_S = 0.008; // per-line fade in/out — removes the click at segment seams
const TARGET_PEAK = 0.89; // normalize loudness to ≈ −1 dBFS so narration is reliably audible
const MAX_GAIN = 6; // never amplify near-silence into noise

export interface ReelAudio {
  /** One mono track (the shared context's rate) for the whole reel. A null buffer prevents export. */
  buffer: AudioBuffer | null;
  /** On-screen ms per slide, stretched so each slide outlasts its narration. */
  timings: number[];
  /** How many voiceover lines failed after retry; any positive value prevents export. */
  missing: number;
  /** First unavailable line, so Video Studio can identify what must be retried. */
  firstMissingLine?: string;
}

/** Synthesize one line to 24 kHz PCM, with a single retry — a transient TTS hiccup shouldn't drop a
 *  line's narration. Returns an empty array only when the line is empty or genuinely unavailable. */
export async function synthesizeVoiceLine(
  text: string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  // Reels post directly to the speech endpoint instead of using the live queue, so apply the same
  // spoken-twin/native-pronunciation floor here. This changes audio only; slide text stays untouched.
  const line = pronounceForSpeech(text).trim().slice(0, MAX_LINE_CHARS);
  if (!line) return new Float32Array(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/tts/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: line,
          voice: kokoroVoice('mavea'),
          response_format: 'pcm',
          speed: 1.0,
        }),
        signal,
      });
      if (res.ok) return decodePcm16(new Uint8Array(await res.arrayBuffer()), null).samples;
    } catch {
      if (signal?.aborted) return new Float32Array(0);
    }
  }
  return new Float32Array(0);
}

/**
 * Synthesize the whole reel's narration into ONE clean buffer plus the slide timings it implies.
 *
 * The mix is rendered offline at the playback context's sample rate (upsampling Kokoro's 24 kHz once,
 * cleanly), with a short fade on each line so there are no clicks at the seams and a single
 * normalization gain so the narration sits at a consistent, audible level. Deterministic and complete
 * before recording starts, so the muxed track is always present and in sync.
 */
export async function renderReelAudio(
  script: ReelScript,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ReelAudio> {
  const slides = script.slides;
  const floors = slides.map((s) => Math.max(800, Math.round(s.durationMs)));
  // The rate, not the context: this renders into an OfflineAudioContext, so it never plays a
  // sample through the shared one and must not stop it parking when idle.
  const rate = sharedSampleRate();
  const voiceovers = slides.map((slide) => slide.voiceover.trim());
  const firstAuthoredLine = voiceovers.find(Boolean);
  if (rate === null || typeof OfflineAudioContext === 'undefined') {
    return {
      buffer: null,
      timings: floors,
      missing: voiceovers.filter(Boolean).length,
      ...(firstAuthoredLine ? { firstMissingLine: firstAuthoredLine } : {}),
    };
  }

  // Two syntheses in flight, never the whole reel at once: the TTS container runs a small fixed
  // thread pool, so a stampede of simultaneous requests maxes the fans AND finishes slower than a
  // paced pair. Results keep slide order; progress counts each line as it lands.
  let done = 0;
  const segs = await mapConcurrent(slides, 2, async (s) => {
    const seg = await synthesizeVoiceLine(s.voiceover, signal);
    onProgress?.(++done, slides.length);
    return seg;
  });
  const voiced = voiceovers.filter(Boolean).length;
  const got = segs.filter((s) => s.length > 0).length;
  const missing = Math.max(0, voiced - got);
  const firstMissingLine = voiceovers.find((line, index) => line && segs[index].length === 0);
  if (got === 0) {
    return {
      buffer: null,
      timings: floors,
      missing,
      ...(firstMissingLine ? { firstMissingLine } : {}),
    };
  }

  const timings = slides.map((_, i) => {
    const spokenMs = (segs[i].length / KOKORO_RATE) * 1000;
    return Math.round(spokenMs > 0 ? Math.max(floors[i], spokenMs + GAP_S * 1000) : floors[i]);
  });

  // Normalize: scan the loudest sample across every line, then pick one gain that lifts the reel to the
  // target peak (clamped so a quiet reel isn't amplified into hiss).
  let peak = 0;
  for (const seg of segs)
    for (let j = 0; j < seg.length; j++) peak = Math.max(peak, Math.abs(seg[j]));
  const gain = peak > 0 ? Math.min(MAX_GAIN, TARGET_PEAK / peak) : 1;

  // `rate` (read above) is the shared context's — render at the rate we'll stream/encode at, so
  // there is no second resample later.
  const totalS = LEAD_S + TAIL_S + timings.reduce((a, ms) => a + ms / 1000, 0);
  const offline = new OfflineAudioContext(1, Math.ceil(totalS * rate), rate);
  const master = offline.createGain();
  master.gain.value = gain;
  master.connect(offline.destination);

  let at = LEAD_S;
  timings.forEach((ms, i) => {
    const seg = segs[i];
    if (seg.length) {
      // A 24 kHz source buffer; the OfflineAudioContext resamples it to `rate` as it renders.
      const src = offline.createBuffer(1, seg.length, KOKORO_RATE);
      src.getChannelData(0).set(seg);
      const node = offline.createBufferSource();
      node.buffer = src;
      const g = offline.createGain();
      const dur = seg.length / KOKORO_RATE;
      const fade = Math.min(FADE_S, dur / 2);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + fade);
      g.gain.setValueAtTime(1, at + dur - fade);
      g.gain.linearRampToValueAtTime(0, at + dur);
      node.connect(g).connect(master);
      node.start(at);
    }
    at += ms / 1000;
  });

  const buffer = await offline.startRendering();
  return { buffer, timings, missing, ...(firstMissingLine ? { firstMissingLine } : {}) };
}
