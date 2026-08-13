import { useEffect, useState } from 'react';
import { kokoroAvailable, kokoroKnownAvailable } from '../voice/kokoro';

export const VOICE_OFF_HINT =
  'Voice is off — answers will show as captions only. To hear Mavéa, start the local TTS ' +
  'service (docker compose up -d).';

/** Why the preview button makes no sound while the voice switch is off — said before the click,
 *  so it explains rather than nags. */
export const VOICE_MUTED_HINT = 'Mavéa is muted — an audition stays silent until you unmute.';

export function useKokoroAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(() => kokoroKnownAvailable());
  useEffect(() => {
    let alive = true;
    void kokoroAvailable().then((available) => {
      if (alive) setOk(available);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}
