// preview.ts — play a short audition clip for a voice preset without touching the main TTS
// queue or changing the active voice selection.
//
// Tries the same low-latency streaming path the live conversation voice uses (streamTts.ts) —
// audio starts on the first PCM chunk, a few hundred ms in, instead of waiting for an entire
// clip to synthesize and download server-side first (the old blob-fetch path, which is why
// preview used to take a couple of seconds to make any sound). Falls back to that blob path
// only when streaming genuinely can't run (no WebAudio, a proxy that won't stream).
//
// A generation counter guards every async step: picking voice B before voice A's request
// resolved used to let BOTH eventually reach playback (A had nothing to abort while still in
// flight, and a newer clip never stopped an older one that hadn't been assigned yet), so two
// auditions could sound at once. Also hushes the live conversation queue first, so a preview
// can never play on top of an in-progress answer.

import type { VoicePreset } from './presets';
import { fetchWithTimeout } from '../live/providers/http';
import { cancelSpeech } from './tts';
import { streamSpeak, cancelActiveStream } from './streamTts';

const SAMPLE = "Hi, I'm ready. Ask me anything.";

let previewAudio: HTMLAudioElement | null = null;
let previewUrl: string | null = null;
let previewAbort: AbortController | null = null;
let generation = 0;

function isCurrent(myGen: number): boolean {
  return myGen === generation;
}

function releaseAudio(audio: HTMLAudioElement | null, url: string | null): void {
  if (audio) {
    try {
      audio.pause();
      audio.src = '';
    } catch {
      /* no-op */
    }
  }
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* no-op */
    }
  }
}

/** Hard-stop: abort any in-flight preview request (streaming or blob) and release whatever clip
 *  is currently playing. Safe to call any time, including when nothing is active. */
export function stopPreview(): void {
  cancelActiveStream();
  previewAbort?.abort();
  previewAbort = null;
  releaseAudio(previewAudio, previewUrl);
  previewAudio = null;
  previewUrl = null;
  generation++; // orphans any request already in flight — its `isCurrent` checks now fail
}

async function tryKokoroBlob(
  preset: VoicePreset,
  myGen: number,
  signal: AbortSignal,
): Promise<void> {
  try {
    const res = await fetchWithTimeout(
      '/tts/v1/audio/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: SAMPLE,
          voice: preset.kokoro,
          response_format: 'mp3',
          speed: 1.0,
        }),
      },
      10_000,
      signal,
    );
    if (!res.ok || !isCurrent(myGen)) return;
    const blob = await res.blob();
    if (!blob.size || !isCurrent(myGen)) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    // Own resources are always released via this closure, whether or not we're still the
    // current preview — an old clip's 'ended'/'error' firing after a newer one has already
    // taken over must clean up ONLY itself, never the newer preview's shared refs.
    const onDone = (): void => {
      if (isCurrent(myGen)) {
        previewAudio = null;
        previewUrl = null;
        previewAbort = null;
      }
      releaseAudio(audio, url);
    };
    previewUrl = url;
    previewAudio = audio;
    audio.onended = onDone;
    audio.onerror = onDone;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(onDone);
  } catch {
    /* network error, abort, or decode failure — the preview simply stays silent */
  }
}

async function playPreview(preset: VoicePreset, myGen: number): Promise<void> {
  const streamed = await streamSpeak(SAMPLE, preset.kokoro);
  if (!isCurrent(myGen)) {
    // A newer preview started while this one was streaming — stop whatever it produced instead
    // of letting it keep sounding alongside the newer clip.
    cancelActiveStream();
    return;
  }
  if (streamed) return; // played (or was cleanly cancelled) via the fast path
  // Streaming genuinely couldn't run — fall back to the whole-clip blob path.
  const ctrl = new AbortController();
  previewAbort = ctrl;
  await tryKokoroBlob(preset, myGen, ctrl.signal);
}

/** Play a short audition clip for `preset` (Kokoro only). Cancels any in-flight or playing
 *  preview first, and hushes the live conversation queue so a preview never sounds on top of
 *  an answer; a silent no-op when Kokoro isn't reachable. */
export function previewVoice(preset: VoicePreset): void {
  cancelSpeech();
  stopPreview();
  const myGen = generation; // stopPreview() just bumped it — this call now owns it
  void playPreview(preset, myGen);
}
