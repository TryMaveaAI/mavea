import { select as selectComponents } from './helpers/select';
import { describe, it, expect } from 'vitest';
import { shouldSynthesize, synthesisMenu, svgBlockMenu, SYNTH_FIT_FLOOR } from '../src/live/select';

// The synthesis trigger ("missing-UI detector") decides when no registered component fits a
// rich ask well enough, so the model should compose a bespoke layout from primitives instead
// of falling back to plain blocks. These pin the pure decision + the best-fit signal it reads.
describe('synthesis trigger (missing-UI detector)', () => {
  it('offers synthesis only for a weak-fit rich ask on a capable model', () => {
    const base = { complexity: 'rich', tier: 'frontier', bestFit: 0, generativeOn: false } as const;
    expect(shouldSynthesize(base)).toBe(true);
    // a trivial ask stays lean — no bespoke layout
    expect(shouldSynthesize({ ...base, complexity: 'lean' })).toBe(false);
    // a small local model can't reliably compose a nested layout
    expect(shouldSynthesize({ ...base, tier: 'small' })).toBe(false);
    // when the generative family is already fully on, composite is offered anyway
    expect(shouldSynthesize({ ...base, generativeOn: true })).toBe(false);
    // a registered component already fits well → no need to synthesize
    expect(shouldSynthesize({ ...base, bestFit: SYNTH_FIT_FLOOR + 1 })).toBe(false);
  });

  it('teaches the composite shape through the synthesis menu', () => {
    const menu = synthesisMenu();
    expect(menu).toContain('composite');
    expect(menu).toMatch(/regions/);
    expect(menu).toMatch(/span/);
  });

  it('reads a strong best-fit for a clear-shape ask and a weak one for an anchorless ask', () => {
    const clear = selectComponents({
      userText: 'compare the iphone vs the pixel on camera and battery',
      tier: 'frontier',
    });
    // A genuinely anchorless ask: no data shape AND no clear intent (a reflection/decision/learning
    // ask now anchors on intent, which is better than a generic synthesized layout — so synthesis is
    // the fallback only for the truly novel/cross-cutting question nothing maps to).
    const vague = selectComponents({
      userText: 'what would a city built by cats be like',
      tier: 'frontier',
    });
    expect(clear.bestFit).toBeGreaterThan(vague.bestFit);
    // the anchorless ask is exactly where the trigger should fire
    expect(vague.bestFit).toBeLessThan(SYNTH_FIT_FLOOR);
    expect(
      shouldSynthesize({
        complexity: 'rich',
        tier: 'frontier',
        bestFit: vague.bestFit,
        generativeOn: false,
      }),
    ).toBe(true);
  });
});

// The svgblock escape hatch is the LAST resort — a model-drawn SVG for a visual no component
// can express. The teaching fragment must spell out the exact rules that match the sanitizer's
// whitelist (canvas/blocks/media/sanitizeSvg.ts), so a model that follows it produces output
// that survives sanitization intact. Tier-agnostic: it's appended whenever svgblock is offered.
describe('svgblock escape-hatch prompt', () => {
  it('teaches the svgblock shape and the safe-SVG rules', () => {
    const menu = svgBlockMenu();
    expect(menu).toContain('svgblock');
    expect(menu).toMatch(/viewBox/);
    // colors must be steered to design tokens (light/dark-aware, on-brand)
    expect(menu).toContain('var(--presence)');
    // the forbidden set the sanitizer enforces must be named so the model doesn't waste output
    expect(menu).toMatch(/script/);
    expect(menu).toMatch(/foreignObject/i);
    expect(menu).toMatch(/external/i);
    // framed as a genuine last resort, not a default
    expect(menu).toMatch(/last resort/i);
  });
});
