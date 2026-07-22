// VoiceOffHint.tsx — an honest one-liner under the voice pickers. The pickers offer
// Kokoro voices ("Heart", "Emma", …), and Kokoro is the ONLY voice: when the local TTS
// service isn't running, nothing speaks and answers are captions-only. This hint makes
// that visible — degrade loudly-but-politely — without blocking anything. It reads the
// cached session probe (one /tts/health request per session, see voice/kokoro.ts) and
// renders nothing while unknown or when Kokoro is up.
import type { ReactElement } from 'react';
import { useKokoroAvailable, VOICE_OFF_HINT } from './voiceAvailability';

/** Renders the voice-off hint only when the Kokoro probe has settled as unavailable. */
export function VoiceOffHint(): ReactElement | null {
  const ok = useKokoroAvailable();
  if (ok !== false) return null;
  return (
    <p className="voice-off-hint" role="status">
      {VOICE_OFF_HINT}
    </p>
  );
}
