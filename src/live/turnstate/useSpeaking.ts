// Whether Mavéa's voice is audibly playing right now. Queue transitions drive this store, so Live
// does no polling and consumes zero timer wake-ups while speech is idle.
import { useSyncExternalStore } from 'react';
import { isSpeaking, subscribeSpeaking } from '../../voice/tts';

export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
}
