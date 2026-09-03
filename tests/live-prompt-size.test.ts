import { describe, expect, it } from 'vitest';
import { liveSystemPrompt } from '../src/engine/liveSchema';
import { chooseComponents, heroMenuFor, menuFor } from '../src/live/select';

describe('Live prompt size budgets', () => {
  it('keeps every stable capability tuple below the reviewed ceiling', () => {
    for (const tier of ['small', 'mid', 'frontier'] as const) {
      for (const complexity of ['brief', 'lean', 'rich'] as const) {
        for (const generativeOn of [false, true]) {
          const prompt = liveSystemPrompt(tier, complexity, generativeOn);
          expect(prompt.length, `${tier}/${complexity}/generative=${generativeOn}`).toBeLessThan(
            42_000,
          );
        }
      }
    }
  });

  it('keeps the largest selected-component menu bounded', () => {
    const choice = chooseComponents({
      userText:
        'Give me a detailed visual overview of a complex project with trends, risks, decisions, and a timeline',
      tier: 'frontier',
      complexity: 'rich',
      rotation: 7,
    });

    expect(menuFor(choice).length).toBeLessThan(28_000);
  });

  it('prints runtime-enforced limits only on the leading heroes', () => {
    const choice = chooseComponents({
      userText: 'Compare a project roadmap, budget, risks, and performance trends in detail',
      tier: 'frontier',
      complexity: 'rich',
      rotation: 3,
    });
    const heroLines = heroMenuFor(choice)
      .split('\n')
      .filter((line) => line.startsWith('- '));
    const withLimits = heroLines.filter((line) => line.includes(' · limits:'));

    expect(withLimits.length).toBeGreaterThan(0);
    expect(withLimits.length).toBeLessThanOrEqual(6);
    expect(heroLines.slice(6).every((line) => !line.includes(' · limits:'))).toBe(true);
  });
});
