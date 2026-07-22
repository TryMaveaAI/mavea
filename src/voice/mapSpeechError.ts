// The one place a raw SpeechRecognition error code becomes a VoiceError the orchestrator can
// turn into a user-facing notice. Shared by every controller built on the Web Speech API
// (WebSpeechVoice's own mic, and VadVoice's parallel/fallback recognizer) so "denied
// permission" or "no mic hardware" reads identically everywhere instead of drifting per
// controller.
import type { VoiceError } from './types';

export function mapSpeechRecognitionError(code: SpeechRecognitionErrorCode): VoiceError {
  switch (code) {
    case 'no-speech':
      return 'no-speech';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'aborted':
      return 'aborted';
    case 'audio-capture':
      return 'audio';
    default:
      return 'unsupported';
  }
}
