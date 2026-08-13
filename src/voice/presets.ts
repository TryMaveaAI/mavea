// Five curated voice presets — calm, conversational, listenable for long sessions.
// Each preset maps a friendly label to a Kokoro TTS voice ID — the only voice engine Mavéa
// uses (vendor-controlled browser voices are intentionally unsupported).
//
// Storage keys are defined here so Demo (TweaksPanel) and Live (LiveSettings) share a single
// source of truth for the localStorage keys.

export interface VoicePreset {
  id: string;
  label: string;
  /** Kokoro TTS voice ID (American/British × Female/Male). */
  kokoro: string;
  /** Short character note, so a picker row reads "Emma — calm" not just a bare name. */
  tone: string;
}

/** Three female and two male voices — warm, neutral, calm; two American, two British, one alt.
 *  Michael replaced Echo (am_echo) as the American-male pick — a clearer, more natural voice. */
export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'heart', label: 'Heart', kokoro: 'af_heart', tone: 'warm' },
  { id: 'emma', label: 'Emma', kokoro: 'bf_emma', tone: 'calm' },
  { id: 'bella', label: 'Bella', kokoro: 'af_bella', tone: 'bright' },
  { id: 'michael', label: 'Michael', kokoro: 'am_michael', tone: 'clear' },
  { id: 'george', label: 'George', kokoro: 'bm_george', tone: 'steady' },
];

export const DEFAULT_MAVEA_VOICE_ID = 'heart';
// George: no settings UI lets a user change this anymore (the "user" voice only ever speaks
// the scripted Demo's simulated turns, App.tsx:351) — picked as the nicer-sounding of the two
// curated male presets now that it's a fixed choice rather than a user-picked one.
export const DEFAULT_USER_VOICE_ID = 'george';

/** localStorage key for Mavéa's chosen voice preset (read by Live's settings + tts). */
export const VOICE_MAVEA_STORAGE_KEY = 'mavea-voice-mavea';

export function findPreset(id: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((p) => p.id === id);
}
