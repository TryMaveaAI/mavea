import { useEffect, useState } from 'react';
import { kokoroAvailable, kokoroKnownAvailable } from '../voice/kokoro';

export const VOICE_OFF_HINT =
  'Voice is off — answers will show as captions only. To hear Mavéa, start the local TTS ' +
  'service (docker compose up -d).';

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
