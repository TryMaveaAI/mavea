// Maps a Live turn's status (plus a live-mic override) to the face's data-state vocabulary.
// Pure so the choreography is unit-testable apart from the surface's timers and streaming.
import type { PresenceState, Emotion, Gaze } from '../types/mavea';
import type { LiveStatus } from './useLiveTurn';

export interface PresenceLook {
  state: PresenceState;
  emotion: Emotion;
  gaze: Gaze;
}

/**
 * The face an open mic always wins — listening reads over whatever the turn is doing. When Mavéa
 * steps into the conversation on its own (`interjecting`), it speaks even though the turn machine
 * is idle, so that look takes precedence over the resting state but yields to an open mic.
 */
export function livePresence(
  status: LiveStatus,
  listening: boolean,
  interjecting = false,
  // The answer's emotion (warm / concerned / neutral, read honestly from its content in
  // presence/expression.ts). Applied only once there's an answer to colour — while listening or
  // still thinking there's nothing read yet, so the face stays neutral. Defaults to neutral so
  // existing callers are unchanged.
  emotion: Emotion = 'neutral',
  // When output is muted there is no voice, so the face must NOT lip-sync to silence. It drops the
  // talking `speaking`/interjecting looks for the calm, attentive `showing` state — reading ALONG
  // with the user rather than mouthing words no one can hear. Defaults false (existing callers
  // unchanged). Listening (an open mic) and thinking are unaffected — those aren't Mavéa talking.
  muted = false,
  // The mic has closed but the utterance is still being transcribed — no turn has been submitted
  // yet, so the turn machine is idle and the face would otherwise drop straight back to resting
  // while the person waits, reading as "it stopped paying attention". Defaults false (existing
  // callers unchanged).
  transcribing = false,
): PresenceLook {
  if (listening) return { state: 'listening', emotion: 'neutral', gaze: 'center' };
  // Stepping in uninvited is a small plot twist — the wide-eyed face says "oh — this
  // couldn't wait" before the words do. Muted: attend, don't mouth it.
  if (interjecting)
    return muted
      ? { state: 'showing', emotion: 'surprised', gaze: 'center' }
      : { state: 'speaking', emotion: 'surprised', gaze: 'center' };
  // Blooming rings, no open mic: the documented meaning of `loading` is exactly this beat —
  // Mavéa has the words and is working on them. It sits BELOW interjecting because an
  // interjection is audible, and a face that isn't mouthing words during speech reads as broken.
  if (transcribing) return { state: 'loading', emotion: 'neutral', gaze: 'center' };
  switch (status) {
    case 'thinking':
      // The radiating ring (not the think-ring shimmer) so loading reads as a living, alert
      // face — eyes forward, glow up — rather than a spinner.
      return { state: 'loading', emotion: 'neutral', gaze: 'center' };
    case 'speaking':
      // Muted → read along (attentive, no lip-sync); unmuted → the talking face.
      return muted
        ? { state: 'showing', emotion, gaze: 'center' }
        : { state: 'speaking', emotion, gaze: 'center' };
    case 'showing':
      return { state: 'showing', emotion, gaze: 'right' };
    default:
      return { state: 'idle', emotion, gaze: 'center' };
  }
}
