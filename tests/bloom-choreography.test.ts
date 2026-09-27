import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The "answers bloom" reveal choreography: wired into the global stylesheet, scoped to the canvas
// grid, and never holding a hidden frame past its own window.

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('bloom stylesheet wiring', () => {
  it('is registered in the global stylesheet barrel', () => {
    expect(src('../src/styles/styles.css')).toContain("@import './bloom.css'");
  });

  it('gates its motion behind prefers-reduced-motion so a reduced-motion render is static', () => {
    expect(src('../src/styles/bloom.css')).toContain(
      '@media (prefers-reduced-motion: no-preference)',
    );
  });

  it('only applies inside the .bloom-on grid scope', () => {
    const css = src('../src/styles/bloom.css');
    expect(css).toContain('.card-grid.bloom-on');
    // No bloom animation may fire on a bare .card-grid.
    expect(css).not.toMatch(/\.card-grid(?!\.bloom-on)[^{]*\{[^}]*animation:\s*mb-/);
  });
});

// The bloom draws content IN from a hidden frame, so while an animation has not started its
// `backwards` fill is what the reader sees. `bloom-on` never comes off the grid, so any rule gated on it alone holds that hidden frame for the life of the grid —
// and an animation that never starts (a backgrounded tab, a throttled or paused document) hides
// its content permanently. That is how a chart came to paint its axes, gridlines and legend
// around a trend line retracted out of view. Every animating rule must therefore also require the
// TRANSIENT `.blooming` class, which the canvas drops once the choreography's window has passed.
describe('bloom rules never outlive their own animation', () => {
  const css = src('../src/styles/bloom.css').replace(/\/\*[\s\S]*?\*\//g, '');

  /** Each rule as [selector, body]. */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1].trim(), m[2]] as const)
    .filter(([sel]) => sel.includes('.card-grid.bloom-on'));

  it('finds the bloom rules to check', () => {
    expect(rules.length).toBeGreaterThan(5);
  });

  it('gates every rule that animates on the transient .blooming class', () => {
    const ungated = rules
      .filter(([, body]) => /animation:/.test(body))
      .filter(([sel]) => !sel.includes('.blooming'))
      .map(([sel]) => sel);
    expect(ungated, `ungated animating rules: ${ungated.join(' | ')}`).toEqual([]);
  });

  it('leaves the token-only rule ungated, so the timings still resolve', () => {
    const tokens = rules.find(([, body]) => body.includes('--mb-lead'));
    expect(tokens).toBeDefined();
    expect(tokens![0]).not.toContain('.blooming');
  });

  it('drops the class after a bounded window rather than keeping it on', () => {
    const canvas = src('../src/canvas/TopicCanvas.tsx');
    expect(canvas).toMatch(/BLOOM_WINDOW_MS\s*=\s*\d+/);
    expect(canvas).toContain('setBlooming(false)');
    expect(canvas).toContain("' blooming'");
  });
});
