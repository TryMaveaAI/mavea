// checkLiveReady lives here — a tiny, catalog-free leaf — rather than in generateLive.ts, because
// the setup wizard's Connect step calls it STATICALLY to show a readiness dot before any turn
// happens. Importing it from generateLive pulled that whole module (→ select → the ~600-entry
// catalog → liveSchema) into the eager Live-mount chunk, forcing the catalog to parse the instant
// Live opens. Split out, the readiness probe needs only the provider adapter + a fetch helper, so
// the catalog stays deferred until the first real turn. generateLive.ts re-exports it for any
// caller that still imports from there.
import type { ModelConfig } from '../types/mavea';
import { getAdapter } from './providers';
import { fetchWithTimeout } from './providers/http';

const TTS_PROBE_MS = 2_500;

/** Readiness for the connected model + (optionally) the local TTS service. Never throws. */
export async function checkLiveReady(
  cfg: ModelConfig,
  opts: { tts?: boolean } = {},
): Promise<{ llm: boolean; tts: boolean; model: boolean; statusCode?: number }> {
  const probeP = getAdapter(cfg.provider)
    .probe(cfg)
    .catch((): { ok: boolean; model: boolean; statusCode?: number } => ({
      ok: false,
      model: false,
    }));
  const ttsP =
    opts.tts === false
      ? Promise.resolve(false)
      : (async () => {
          try {
            const res = await fetchWithTimeout('/tts/health', { method: 'GET' }, TTS_PROBE_MS);
            return res.ok;
          } catch {
            return false;
          }
        })();
  const [{ ok, model, statusCode }, tts] = await Promise.all([probeP, ttsP]);
  return { llm: ok, tts, model, statusCode };
}
