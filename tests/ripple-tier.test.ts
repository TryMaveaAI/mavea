// ripple-tier.test.ts — sizing the analysis to the model WITHOUT ever swapping it. Guards that each
// model bucket gets the intended budget: a slow/cheap model (a local base URL / OpenRouter `:free`)
// drops to one course, a lean read, no code-context round-trips, and minimal thinking; a deep
// reasoning model keeps the full read; a fast frontier model gets the full read + 3-course ladder.
import { describe, it, expect } from 'vitest';
import { classifyTier, planFor } from '../src/live/ripple/ingest/tier';
import type { ModelConfig } from '../src/types/mavea';

const cfg = (provider: ModelConfig['provider'], model: string, baseUrl?: string): ModelConfig => ({
  provider,
  model,
  ...(baseUrl ? { baseUrl } : {}),
});

describe('classifyTier', () => {
  it('buckets local + free routes as slow-cheap', () => {
    expect(classifyTier(cfg('openrouter', 'meta-llama/llama-3.1-8b-instruct:free'))).toBe(
      'slow-cheap',
    );
    expect(classifyTier(cfg('openai', 'gpt-4o', 'http://localhost:1234/v1'))).toBe('slow-cheap');
    expect(classifyTier(cfg('openai', 'gpt-4o', 'http://host.docker.internal:11434/v1'))).toBe(
      'slow-cheap',
    );
  });

  it('buckets the big reasoning models as frontier-deep', () => {
    expect(classifyTier(cfg('anthropic', 'claude-opus-4-8'))).toBe('frontier-deep');
    expect(classifyTier(cfg('anthropic', 'claude-sonnet-4-6'))).toBe('frontier-deep');
    expect(classifyTier(cfg('openai', 'gpt-5'))).toBe('frontier-deep');
    expect(classifyTier(cfg('openai', 'o3'))).toBe('frontier-deep');
    expect(classifyTier(cfg('gemini', 'gemini-3-pro'))).toBe('frontier-deep');
  });

  it('buckets fast frontier models as frontier-fast', () => {
    expect(classifyTier(cfg('gemini', 'gemini-3.1-flash-lite'))).toBe('frontier-fast');
    expect(classifyTier(cfg('anthropic', 'claude-haiku-4-5-20251001'))).toBe('frontier-fast');
    expect(classifyTier(cfg('openai', 'gpt-5-mini'))).toBe('frontier-fast');
    expect(classifyTier(cfg('grok', 'grok-4'))).toBe('frontier-fast');
  });
});

describe('planFor', () => {
  it('slow-cheap: one course, lean read, no code context, minimal thinking', () => {
    const p = planFor(cfg('openrouter', 'llama3.2:3b', 'http://localhost:1234/v1'));
    expect(p.courseCount).toBeLessThan(5); // fewer weeks so its outline JSON doesn't truncate
    expect(p.fetchCodeContext).toBe(false);
    expect(p.thinkingLevel).toBe('minimal');
    expect(p.enrichMaxTokens).toBeLessThan(2600);
    expect(p.lessonMaxTokens).toBeLessThan(4200); // a leaner deep-lesson budget
  });

  it('frontier-fast: full read + a multi-week curriculum + code context', () => {
    const p = planFor(cfg('gemini', 'gemini-3.1-flash-lite'));
    expect(p.courseCount).toBe(5);
    expect(p.fetchCodeContext).toBe(true);
    expect(p.enrichMaxTokens).toBe(2600);
    expect(p.lessonMaxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('frontier-deep: full read, deeper thinking + a generous lesson budget', () => {
    const p = planFor(cfg('anthropic', 'claude-opus-4-8'));
    expect(p.courseCount).toBe(5);
    expect(p.thinkingLevel).toBe('low');
    expect(p.fetchCodeContext).toBe(true);
    expect(p.lessonMaxTokens).toBeGreaterThanOrEqual(5000);
  });
});
