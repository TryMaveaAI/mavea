// Source-text guards for phone/tablet chrome fixes that jsdom cannot lay out (vitest runs with
// `css: false`), in the same idiom as responsive-css-guards.test.ts.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { BREAKPOINT_HEIGHTS } from '../scripts/breakpoints.mjs';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');
const rule = (css: string, selector: string): string => {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
};

describe('card eyebrows never break inside a word', () => {
  it('wraps the title at spaces, keeping a whole word as its minimum', () => {
    const eyebrow = rule(read('src/styles/visualizations-extra.css'), '.card-eyebrow');
    expect(eyebrow).toMatch(/overflow-wrap:\s*break-word/);
    expect(eyebrow).toMatch(/word-break:\s*normal/);
    expect(eyebrow).toMatch(/hyphens:\s*manual/);
    expect(eyebrow).not.toMatch(/overflow-wrap:\s*anywhere/);
    for (const [family, selector] of [
      ['charts1', '.c1 .card-eyebrow'],
      ['charts2', '.c2 .card-eyebrow'],
      ['stats', '.stats-card .card-eyebrow'],
    ]) {
      const css = read(`src/canvas/blocks/${family}/styles.css`);
      expect(rule(css, selector)).toMatch(/overflow-wrap:\s*break-word/);
    }
  });

  it('drops the action-cluster corridor once the safe band has moved the eyebrow below it', () => {
    const css = read('src/styles/wow-polish.css');
    // The band is as deep as the cluster: a thumb-sized row under a coarse pointer.
    expect(css).toMatch(/padding-top:\s*var\(--chrome-band\)/);
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*\.card\s*\{\s*--chrome-band:\s*calc\(var\(--tap-min\) \+ 18px\)/,
    );
    expect(css).toMatch(
      /\.card:has\(~ \.block-actions\) > \.card-eyebrow:first-child,\s*\.fit-box:has\(~ \.block-actions\) \.card > \.card-eyebrow:first-child\s*\{\s*padding-right:\s*0;/,
    );
  });
});

describe('a phone on its side takes the compact shell', () => {
  it('names the short height on the breakpoint ladder', () => {
    expect(BREAKPOINT_HEIGHTS).toContain(500);
  });

  it('collapses the rail and the feature menus at a short height, not only a narrow width', () => {
    const mobile = read('src/styles/mobile.css');
    expect(mobile).toMatch(/@media \(width <= 768px\) or \(height <= 500px\) \{\s*\/\* every/);
    expect(mobile).toMatch(/@media \(width <= 430px\) or \(height <= 500px\) \{\s*\.topbar/);
    const voice = read('src/live/voice/voice.css');
    expect(voice).toMatch(/@media \(width <= 768px\) or \(height <= 500px\) \{\s*\.rail-collapse/);
    expect(voice).toMatch(
      /@media \(width <= 768px\) or \(height <= 500px\) \{\s*\/\* the base sheet rules collapse/,
    );
  });
});

describe('the replay chrome makes room', () => {
  it('ends the Lens stage above the replay transport', () => {
    const scrim = rule(read('src/styles/wow-polish.css'), '.zoom-scrim');
    expect(scrim).toMatch(/padding-bottom:\s*calc\(28px \+ var\(--demo-h, 0px\)\)/);
  });

  it('packs the banner on a phone and rides it in the bar on a phone on its side', () => {
    const demo = read('src/demo/demo.css');
    expect(demo).toMatch(/@media \(width <= 640px\) or \(height <= 500px\) \{\s*\.demox-banner \{/);
    // Nothing is dropped: the persona line (where the replay says the persona is fictional) stays.
    expect(demo).not.toMatch(/\.demox-role\s*\{\s*display:\s*none/);
    expect(demo).toMatch(
      /@media \(height <= 500px\) and \(width > 640px\) \{\s*\.demox-banner \{\s*top: 12px;/,
    );
  });

  it('lets a terminal command drop under a long prompt instead of a narrow column', () => {
    const code = read('src/canvas/blocks/code/styles.css');
    expect(rule(code, '.term-cmd')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(code, '.term-cmd-text')).toMatch(/flex:\s*1 1 \d+ch/);
  });
});
