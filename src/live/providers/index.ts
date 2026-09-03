// index.ts — the provider registry. Maps a ProviderId to its adapter. The UI metadata (labels,
// default + suggested models, whether a key is needed) lives in the adapter-free './info' leaf so
// light consumers can read it without pulling every adapter (and the catalog they reach); it is
// re-exported here for convenience. Defaults favor the cheapest model that is both accurate AND
// fast (the real-time bar): Claude Haiku, Gemini Flash-Lite, and a GPT mini.
import type { ProviderId } from '../../types/mavea';
import type { ProviderAdapter } from './types';
import { anthropicAdapter } from './anthropic';
import { openaiAdapter } from './openai';
import { geminiAdapter } from './gemini';
import { openrouterAdapter } from './openrouter';
import { grokAdapter } from './grok';
import { assertProviderGenerationAllowed, providerGenerationAllowed } from './spendPolicy';
import { recordUsage } from '../usage/ledger';

function guarded(id: ProviderId, adapter: ProviderAdapter): ProviderAdapter {
  const facade: ProviderAdapter = {
    ...adapter,
    async probe(cfg) {
      if (!providerGenerationAllowed(cfg)) return { ok: false, model: false };
      return ADAPTERS[id].probe(cfg);
    },
    async generate(req, cfg, onDelta) {
      assertProviderGenerationAllowed(cfg);
      const result = await ADAPTERS[id].generate(req, cfg, onDelta);
      recordUsage(req.usageLabel ?? 'model-call', result.usage);
      return result;
    },
  };
  if (adapter.warm) {
    facade.warm = async (cfg) => {
      if (!providerGenerationAllowed(cfg)) return;
      await ADAPTERS[id].warm?.(cfg);
    };
  }
  return facade;
}

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  openai: openaiAdapter,
  openrouter: openrouterAdapter,
  grok: grokAdapter,
};

const GUARDED_ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: guarded('anthropic', anthropicAdapter),
  gemini: guarded('gemini', geminiAdapter),
  openai: guarded('openai', openaiAdapter),
  openrouter: guarded('openrouter', openrouterAdapter),
  grok: guarded('grok', grokAdapter),
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  return GUARDED_ADAPTERS[id];
}

// Provider UI metadata lives in the adapter-free './info' leaf; re-exported here so existing
// `from '../providers'` consumers keep working. Light/eager consumers should import it from
// './info' directly to avoid pulling the adapters.
export { PROVIDERS, VISIBLE_PROVIDERS, providerInfo, type ProviderInfo } from './info';

export type { ProviderAdapter } from './types';
