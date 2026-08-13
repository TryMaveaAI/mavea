// VoiceOffHint.tsx — an honest one-liner under the voice pickers. The pickers offer
// Kokoro voices ("Heart", "Emma", …), and Kokoro is the ONLY voice: when the local TTS
// service isn't running, nothing speaks and answers are captions-only. This hint makes
// that visible — degrade loudly-but-politely — without blocking anything. It reads the
// cached session probe (one /tts/health request per session, see voice/kokoro.ts) and
// renders nothing while unknown or when Kokoro is up.
//
// Mute is the second reason a picker can sit there making no sound: previewing a voice while
// Mavéa is muted would be the one noise a silenced session makes, so the audition is skipped
// (voice/preview.ts) and stated here instead of leaving a dead button. The service being down
// wins — a muted picker can at least speak again by unmuting.
import { useSyncExternalStore, type ReactElement } from 'react';
import { isOutputMuted, subscribeOutputMuted } from '../voice/streamTts';
import { useKokoroAvailable, VOICE_OFF_HINT, VOICE_MUTED_HINT } from './voiceAvailability';

/** Renders the reason the pickers are silent — Kokoro unreachable, or muted — else nothing. */
export function VoiceOffHint(): ReactElement | null {
  const ok = useKokoroAvailable();
  const muted = useSyncExternalStore(subscribeOutputMuted, isOutputMuted);
  const hint = ok === false ? VOICE_OFF_HINT : muted ? VOICE_MUTED_HINT : null;
  if (!hint) return null;
  return (
    <p className="voice-off-hint" role="status">
      {hint}
    </p>
  );
}
