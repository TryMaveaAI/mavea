import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setLiveConfigV2,
  getLiveConfigV2,
  toCaps,
  resetLiveConfig,
  exportConfig,
  importConfig,
  importConfigWithSummary,
  whenSecretPersistenceSettled,
  hasModelConfigured,
} from '../src/live/useLiveConfig';

// The store keeps an in-memory source of truth + a localStorage mirror. Reset both before
// each test so cases don't bleed. (jsdom provides localStorage.)
beforeEach(() => {
  localStorage.clear();
  // Force a clean in-memory state by writing the defaults back.
  resetLiveConfig();
});

describe('useLiveConfig — search mode + quality, with cost-aware caps', () => {
  it('defaults to no search and balanced quality (a trustworthy first answer)', () => {
    const caps = toCaps(getLiveConfigV2());
    expect(caps.searchMode).toBe('off');
    expect(caps.quality).toBe('balanced');
    // webSearch (legacy flag) tracks searchMode for any old caller.
    expect(caps.webSearch).toBe(false);
  });

  it('maps searchMode onto caps and keeps the legacy webSearch flag in sync', () => {
    setLiveConfigV2({ searchMode: 'realtime' });
    let caps = toCaps(getLiveConfigV2());
    expect(caps.searchMode).toBe('realtime');
    expect(caps.webSearch).toBe(true);

    setLiveConfigV2({ searchMode: 'off' });
    caps = toCaps(getLiveConfigV2());
    expect(caps.webSearch).toBe(false);
  });

  it('carries the quality dial through to caps', () => {
    setLiveConfigV2({ quality: 'thorough' });
    expect(toCaps(getLiveConfigV2()).quality).toBe('thorough');
  });

  it('ships on-the-fly visual creation ON by default (it only fires on a weak catalog fit)', () => {
    expect(toCaps(getLiveConfigV2()).generativeBlocks).toBe(true);
  });

  it('ships the resumable local library ON, while durable personal memory stays opt-in', () => {
    const cfg = getLiveConfigV2();
    expect(cfg.libraryEnabled).toBe(true);
    expect(cfg.memoryEnabled).toBe(false);
  });

  it('carries the generative-blocks toggle through to caps when enabled', () => {
    setLiveConfigV2({ generativeBlocks: true });
    expect(toCaps(getLiveConfigV2()).generativeBlocks).toBe(true);
  });

  it('persists searchMode + quality across a save (mirrors to storage)', () => {
    setLiveConfigV2({ searchMode: 'realtime', quality: 'balanced' });
    const saved = JSON.parse(localStorage.getItem('mavea-live-v2')!) as {
      searchMode: string;
      quality: string;
    };
    expect(saved.searchMode).toBe('realtime');
    expect(saved.quality).toBe('balanced');
  });

  it('drops a legacy "free" (retired Wikipedia tier) choice to "off" on import, never silently onto realtime', () => {
    // A user who had explicitly picked the now-retired Free/Wikipedia tier must not be silently
    // switched onto a mode that may now cost more or do nothing for their provider.
    expect(importConfig(JSON.stringify({ searchMode: 'free' })).searchMode).toBe('off');
  });

  it('migrates a pre-searchMode config (only the legacy webSearch boolean) onto realtime/off', () => {
    expect(importConfig(JSON.stringify({ webSearch: true })).searchMode).toBe('realtime');
    expect(importConfig(JSON.stringify({ webSearch: false })).searchMode).toBe('off');
  });

  it('applies the same migration reading straight from localStorage on a fresh load', async () => {
    // Bypass the in-memory cache other tests in this file build up: a fresh module instance
    // reads fromStorage() on its first call, exercising the exact path a real page load takes.
    vi.resetModules();
    localStorage.setItem('mavea-live-v2', JSON.stringify({ searchMode: 'free' }));
    const fresh = await import('../src/live/useLiveConfig');
    expect(fresh.getLiveConfigV2().searchMode).toBe('off');
  });
});

describe('useLiveConfig — explanation level', () => {
  it('defaults to standard and carries through to caps', () => {
    expect(getLiveConfigV2().explainLevel).toBe('standard');
    expect(toCaps(getLiveConfigV2()).explainLevel).toBe('standard');
  });

  it('carries the simple level through to caps when set', () => {
    setLiveConfigV2({ explainLevel: 'simple' });
    expect(toCaps(getLiveConfigV2()).explainLevel).toBe('simple');
  });

  it('coerces an unknown or missing level back to standard on import', () => {
    expect(importConfig(JSON.stringify({ explainLevel: 'gibberish' })).explainLevel).toBe(
      'standard',
    );
    // A config from before this field existed imports cleanly as standard.
    expect(importConfig(JSON.stringify({ provider: 'anthropic' })).explainLevel).toBe('standard');
    // A valid 'simple' survives a round-trip.
    expect(importConfig(JSON.stringify({ explainLevel: 'simple' })).explainLevel).toBe('simple');
  });
});

describe('useLiveConfig — text size', () => {
  it('defaults to normal', () => {
    expect(getLiveConfigV2().fontScale).toBe('normal');
  });

  it('persists a smaller/larger choice across a save', () => {
    setLiveConfigV2({ fontScale: 'larger' });
    expect(getLiveConfigV2().fontScale).toBe('larger');
    const raw = JSON.parse(localStorage.getItem('mavea-live-v2') ?? '{}');
    expect(raw.fontScale).toBe('larger');
  });

  it('coerces an unknown or missing size back to normal on import, and a valid one survives', () => {
    expect(importConfig(JSON.stringify({ fontScale: 'gibberish' })).fontScale).toBe('normal');
    // A config from before this field existed imports cleanly as normal.
    expect(importConfig(JSON.stringify({ provider: 'anthropic' })).fontScale).toBe('normal');
    expect(importConfig(JSON.stringify({ fontScale: 'smaller' })).fontScale).toBe('smaller');
    expect(importConfig(JSON.stringify({ fontScale: 'larger' })).fontScale).toBe('larger');
  });
});

describe('useLiveConfig — import never inherits key persistence', () => {
  it('forces rememberKey off on import even if the file asks to remember', () => {
    // A crafted config with rememberKey:true + leaked keys must NOT silently persist them to
    // localStorage; the user re-opts-in via settings. (Security: untrusted-file at-rest leak.)
    const imported = importConfig(
      JSON.stringify({ rememberKey: true, keys: { openai: 'sk-leak' } }),
    );
    expect(imported.rememberKey).toBe(false);
  });

  it('never imports provider/search/GitHub credentials or overwrites current session keys', () => {
    setLiveConfigV2({
      rememberKey: true,
      keys: { openai: 'sk-current' },
      searchKeys: { brave: 'brave-current' },
    });
    const result = importConfigWithSummary(
      JSON.stringify({
        keys: { openai: 'sk-crafted' },
        searchKeys: { brave: 'brave-crafted' },
        githubToken: 'ghp-crafted',
      }),
    );
    expect(result.config.keys.openai).toBe('sk-current');
    expect(result.config.searchKeys.brave).toBe('brave-current');
    expect(result.credentialsIgnored).toEqual([
      'provider-api-keys',
      'search-api-keys',
      'github-token',
    ]);
    expect(localStorage.getItem('mavea-ripple-gh-token')).toBeNull();
  });
});

describe('useLiveConfig — settings exports never become credential bundles', () => {
  it('strips provider/search keys and remembered-key state even when device remembering is on', () => {
    setLiveConfigV2({
      rememberKey: true,
      keys: { openai: 'sk-export-must-not-contain' },
      searchKeys: { brave: 'brave-export-must-not-contain' },
    });
    const json = exportConfig();
    const exported = JSON.parse(json) as {
      keys: Record<string, string>;
      searchKeys: Record<string, string>;
      rememberKey: boolean;
    };
    expect(exported.keys).toEqual({});
    expect(exported.searchKeys).toEqual({});
    expect(exported.rememberKey).toBe(false);
    expect(json).not.toContain('sk-export-must-not-contain');
    expect(json).not.toContain('brave-export-must-not-contain');
  });

  it('does not warn about the intentionally empty credential placeholders in a normal export', () => {
    const imported = importConfigWithSummary(exportConfig());
    expect(imported.credentialsIgnored).toEqual([]);
  });
});

describe('hasModelConfigured — the sync "would this turn even try" check', () => {
  it('a hosted provider with no key is not configured', () => {
    setLiveConfigV2({ provider: 'gemini', keys: {} });
    expect(hasModelConfigured(getLiveConfigV2())).toBe(false);
  });

  it('a hosted provider with a key is configured', () => {
    setLiveConfigV2({ provider: 'anthropic', keys: { anthropic: 'sk-ant-test' } });
    expect(hasModelConfigured(getLiveConfigV2())).toBe(true);
  });

  it('a stored provider that no longer exists coerces to the default instead of crashing', async () => {
    // The migration path for configs saved while a since-removed provider (the old local
    // Ollama) was selectable: coerceProvider falls back to the default hosted provider.
    // Fresh module instance so the read comes from localStorage, as on a real page load.
    vi.resetModules();
    localStorage.setItem('mavea-live-v2', JSON.stringify({ provider: 'ollama' }));
    const fresh = await import('../src/live/useLiveConfig');
    const cfg = fresh.getLiveConfigV2();
    expect(cfg.provider).toBe('gemini');
    expect(fresh.hasModelConfigured(cfg)).toBe(false); // default provider still needs its key
  });

  it('a gateway with no model id picked is not configured, even with a key', () => {
    setLiveConfigV2({ provider: 'openrouter', keys: { openrouter: 'sk-or-test' }, models: {} });
    expect(hasModelConfigured(getLiveConfigV2())).toBe(false);
  });
});

describe('useLiveConfig — secrets never sit in the main blob as plaintext', () => {
  it('keeps API keys out of the main localStorage config even when remembered', () => {
    // The security invariant: keys ride a separate ENCRYPTED blob (or session-only memory), so the
    // main config blob must never contain a raw key — even with rememberKey on. (In jsdom there's no
    // Web Crypto, so the encrypted blob isn't written either; the key lives only in memory.)
    setLiveConfigV2({ rememberKey: true, keys: { openai: 'sk-PLAINTEXT-should-not-persist' } });
    const mainBlob = localStorage.getItem('mavea-live-v2') ?? '';
    expect(mainBlob).not.toContain('sk-PLAINTEXT-should-not-persist');
    // …but it's still available in-session for the current turn.
    expect(getLiveConfigV2().keys.openai).toBe('sk-PLAINTEXT-should-not-persist');
  });

  it('reports session-only when encrypted persistence is unavailable', async () => {
    setLiveConfigV2({ rememberKey: true, keys: { openai: 'sk-session-only' } });
    expect(await whenSecretPersistenceSettled()).toBe('session-only');
    expect(getLiveConfigV2().keys.openai).toBe('sk-session-only');
  });
});
