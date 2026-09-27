import { describe, expect, it } from 'vitest';
import { rippleCacheKey } from '../src/live/ripple/cache';
import type { ModelConfig } from '../src/types/mavea';

// A cached answer, note or world belongs to the model that wrote it. The same model id can name a
// different model on another provider or behind another gateway, so each of those is its own key.
describe('rippleCacheKey', () => {
  const base: ModelConfig = { provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKey: 'k' };

  it('is stable for the same content and the same model', () => {
    const otherKey: ModelConfig = { ...base, apiKey: 'other' };
    expect(rippleCacheKey('q', base)).toBe(rippleCacheKey('q', otherKey));
  });

  it('separates two models', () => {
    expect(rippleCacheKey('q', base)).not.toBe(rippleCacheKey('q', { ...base, model: 'x/y' }));
  });

  it('separates the same model id on two providers', () => {
    expect(rippleCacheKey('q', base)).not.toBe(
      rippleCacheKey('q', { ...base, provider: 'openai' }),
    );
  });

  it('separates the same model behind two endpoints', () => {
    const gateway = { ...base, baseUrl: 'https://gateway.example/v1' };
    expect(rippleCacheKey('q', base)).not.toBe(rippleCacheKey('q', gateway));
    expect(rippleCacheKey('q', gateway)).not.toBe(
      rippleCacheKey('q', { ...base, baseUrl: 'https://other.example/v1' }),
    );
  });

  it('never writes the endpoint address into the key', () => {
    const key = rippleCacheKey('q', { ...base, baseUrl: 'https://gateway.example/v1' });
    expect(key).not.toContain('gateway.example');
  });
});
