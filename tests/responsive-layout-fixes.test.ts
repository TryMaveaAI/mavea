// Source-scan guards for a batch of small responsive-layout fixes. Each of these
// regressed silently before (no visual diff on a desktop browser, no notched
// device, no touch input) — so the invariant lives here instead of a pixel test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('mobile safe-area', () => {
  it('the viewport meta opts into the notch safe area', () => {
    // Without viewport-fit=cover, env(safe-area-inset-*) always resolves to 0 on
    // iOS even on a notched device, silently disabling every safe-area rule below.
    const html = read('index.html');
    const meta = html.match(/<meta name="viewport" content="([^"]+)"/);
    expect(meta).not.toBeNull();
    expect(meta![1]).toContain('viewport-fit=cover');
  });

  it('the mobile composer dock pads for the home-indicator bar', () => {
    const css = read('src/styles/mobile.css');
    const dockRule = css.match(/\.rail-dock\s*\{[^}]*\}/);
    expect(dockRule).not.toBeNull();
    expect(dockRule![0]).toContain('env(safe-area-inset-bottom');
  });
});

describe('transcript bubble text wrapping', () => {
  it('a long unbroken token wraps inside the bubble instead of overflowing it', () => {
    const css = read('src/styles/live-transcript.css');
    const bubbleRule = css.match(/\.bubble\s*\{[^}]*\}/);
    expect(bubbleRule).not.toBeNull();
    expect(bubbleRule![0]).toContain('overflow-wrap');
    expect(bubbleRule![0]).toContain('word-break');
  });
});

describe('gallery viewport height', () => {
  it('the gallery root uses dvh, not a bare vh, so mobile chrome cannot clip it', () => {
    const css = read('src/gallery/gallery.css');
    expect(css).not.toMatch(/height:\s*100vh/);
    expect(css).toContain('100dvh');
  });
});

describe('touch fallback for hover-revealed block actions', () => {
  it('the block-actions cluster stays visible on coarse-pointer devices', () => {
    const css = read('src/styles/wow-polish.css');
    const touchRule = css.match(
      /@media \(hover: none\) \{\s*:is\([^)]*\) > \.block-actions[^}]*\}\s*\}/,
    );
    expect(touchRule).not.toBeNull();
    // Must cover the same three affordance classes as the desktop hover/focus-within reveal.
    expect(touchRule![0]).toContain('.askable');
    expect(touchRule![0]).toContain('.addable');
    expect(touchRule![0]).toContain('.flashcardable');
    expect(touchRule![0]).toContain('opacity: 1');
  });
});

describe('Watch Me Think theme labels stay crisp at any camera zoom', () => {
  it('--ms-counter lives on .ms-world itself, not only on a sibling card', () => {
    // A busy map zooms the camera out to stay legible (auto-fit), which would shrink any text
    // inside .ms-world toward nothing without a counter-scale. .ms-cluster-label is a SIBLING of
    // .ms-card, not a descendant — a --ms-counter defined only on .ms-card is invisible to it, so
    // the shared value must live on their common ancestor, .ms-world.
    const css = read('src/canvas/blocks/diagrams/mindshape-world.css');
    const worldRule = css.match(/\.ms-world\s*\{[^}]*\}/);
    expect(worldRule).not.toBeNull();
    expect(worldRule![0]).toContain('--ms-counter');
  });

  it('theme labels get the same counter-scale as the cards they name', () => {
    const css = read('src/canvas/blocks/diagrams/mindshape-world.css');
    const labelRule = css.match(/\.ms-world \.ms-cluster-label\s*\{[^}]*\}/);
    expect(labelRule).not.toBeNull();
    expect(labelRule![0]).toContain('scale(var(--ms-counter))');
  });
});

describe('Atlas neighborhood/night labels stay crisp at any camera zoom', () => {
  it('the world exposes the camera scale and derives a counter-scale from it', () => {
    // fitAll's scale shrinks as the galaxy grows (worldDims grows with the hood count), so once
    // there's more than a couple of neighborhoods the resting camera is almost never at 1:1 —
    // without a counter-scale, hood/night text is rasterized at that fractional CSS scale and
    // reads both small and soft.
    const view = read('src/live/atlas/AtlasView.tsx');
    expect(view).toMatch(/--atlas-cam-scale['"][^\]]*\]\s*:\s*camera\.scale/);

    const css = read('src/live/atlas/atlas.css');
    // Anchored to line start: .atlas-hood/.atlas-night also appear as the tail of compound
    // selectors elsewhere (e.g. ".atlas-viewport.is-panning .atlas-hood {"), which an unanchored
    // match would find first and silently check the wrong rule.
    const worldRule = css.match(/^\.atlas-world\s*\{[^}]*\}/m);
    expect(worldRule).not.toBeNull();
    expect(worldRule![0]).toContain('--atlas-counter');
    expect(worldRule![0]).toContain('--atlas-cam-scale');
  });

  it('hood labels and night cards both read the shared counter-scale', () => {
    const css = read('src/live/atlas/atlas.css');
    const hoodRule = css.match(/^\.atlas-hood\s*\{[^}]*\}/m);
    expect(hoodRule).not.toBeNull();
    expect(hoodRule![0]).toContain('scale(var(--atlas-counter');

    const nightRule = css.match(/^\.atlas-night\s*\{[^}]*\}/m);
    expect(nightRule).not.toBeNull();
    expect(nightRule![0]).toContain('scale(var(--atlas-counter');
  });
});

describe('Atlas header restructures on mobile instead of just shrinking', () => {
  it('the search box + tour button wrap onto their own full-width line', () => {
    const css = read('src/live/atlas/atlas.css');
    // Transparent (display: contents) on wide screens — the wrapper must not add an extra flex
    // item to .atlas-head's desktop row.
    const wrapperRule = css.match(/^\.atlas-head-search\s*\{[^}]*\}/m);
    expect(wrapperRule).not.toBeNull();
    expect(wrapperRule![0]).toContain('display: contents');

    const mobileBlock = css.match(
      /@media \(max-width: 768px\) \{[\s\S]*?\n\}\n\n\/\* ---- the stage/,
    );
    expect(mobileBlock).not.toBeNull();
    expect(mobileBlock![0]).toContain('.atlas-head-search');
    expect(mobileBlock![0]).toContain('flex: 1 1 100%');
  });

  it('the JSX groups the fly-search input and the tour button under one wrapper', () => {
    const view = read('src/live/atlas/AtlasView.tsx');
    const wrapperOpen = view.indexOf('className="atlas-head-search"');
    const flyOpen = view.indexOf('className="atlas-fly"');
    const tourOpen = view.indexOf('className="atlas-tour"');
    expect(wrapperOpen).toBeGreaterThan(-1);
    expect(flyOpen).toBeGreaterThan(wrapperOpen);
    expect(tourOpen).toBeGreaterThan(flyOpen);
  });
});

describe('Atlas "Mavéa noticed" panel never clips off a narrow viewport', () => {
  it('its width yields to the available space instead of a bare 300px', () => {
    const css = read('src/live/atlas/atlas.css');
    const rule = css.match(/^\.atlas-noticed\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toContain('width: 300px;');
    expect(rule![0]).toContain('width: min(300px,');
  });
});

describe('Watch Me Think action bar wraps instead of overflowing', () => {
  it('.ms-actions can hold up to five pills (post-settle + the reconnected "Add more") on a row', () => {
    // A settled map with a hero tension can show Answer/Plan/That's it/Add more/Not quite at
    // once; without flex-wrap that row overflows sideways past the canvas on any narrow card
    // instead of the bar growing a second line.
    const css = read('src/canvas/blocks/diagrams/mindshape.css');
    const rule = css.match(/^\.ms-actions\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain('flex-wrap: wrap');
  });
});

describe('canvas header wraps its action cluster instead of overflowing', () => {
  it('the Reading pills + Focus/Everything + View-as-canvas cluster can drop to its own line', () => {
    // Live can show all of: the "Expand sections" toggle, the Focus/Everything switch, "View as
    // canvas", and a headerSlot (the pen toggle) at once, next to the answer title. Neither flex
    // item shrank to fit that on a narrow card — .canvas-header needs flex-wrap so the actions
    // cluster wraps under the title instead of running past the card's edge.
    const css = read('src/styles/canvas.css');
    const headerRule = css.match(/^\.canvas-header\s*\{[^}]*\}/m);
    expect(headerRule).not.toBeNull();
    expect(headerRule![0]).toContain('flex-wrap: wrap');

    const actionsRule = css.match(/^\.canvas-header > \.canvas-header-actions\s*\{[^}]*\}/m);
    expect(actionsRule).not.toBeNull();
    expect(actionsRule![0]).toContain('flex-wrap: wrap');
  });
});

describe('Prism chrome overflow (footer, header, split, docks)', () => {
  const prismCss = read('src/live/prism/prism.css');

  it('the footer action bar wraps instead of forcing the honesty stat into a one-word column', () => {
    // .prism-foot-actions used to be flex:none with no wrap, so once enough analysis buttons were
    // live (~10 by default) it overflowed the panel and crushed .prism-foot-stat to a sliver.
    const actionsRule = prismCss.match(/\.prism-foot-actions\s*\{[^}]*\}/);
    expect(actionsRule).not.toBeNull();
    expect(actionsRule![0]).toContain('flex-wrap: wrap');
    const statRule = prismCss.match(/\.prism-foot-stat\s*\{[^}]*\}/);
    expect(statRule).not.toBeNull();
    expect(statRule![0]).toMatch(/min-width/);
  });

  it('the header sheds to icon-only chrome below tablet width instead of losing the filename', () => {
    // .prism-file-name had no floor, so once the header's right-hand controls (counter, phase,
    // read/replay, fullscreen, close) ran out of room it was crushed to literally zero width —
    // not just truncated, gone. The narrow breakpoint now sheds secondary text first.
    const nameRule = prismCss.match(/\.prism-file-name\s*\{[^}]*\}/);
    expect(nameRule).not.toBeNull();
    expect(nameRule![0]).toMatch(/min-width/);
    const narrowHead = prismCss.match(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/);
    expect(narrowHead).not.toBeNull();
    expect(narrowHead![0]).toContain('.prism-phase-label');
    expect(narrowHead![0]).toContain('.prism-replay-label');
  });

  it('the map+source-page split restructures to one pane on phone width instead of cramming both', () => {
    // Below tablet width a 44%/56% split leaves neither the map nor the source page usable — the
    // page now takes the full stage and the map (plus the now-meaningless drag divider) steps
    // aside; the page's own close button is the way back.
    const stackRule = prismCss.match(
      /@media \(max-width: 720px\) \{[\s\S]*?\.prism-split\[data-split='true'\] \.prism-stage[\s\S]*?\n\}/,
    );
    expect(stackRule).not.toBeNull();
    expect(stackRule![0]).toContain('display: none');
    expect(stackRule![0]).toContain('.prism-page-wrap');
    expect(stackRule![0]).toContain('width: 100%');
  });

  it('each floating analysis dock widens on mobile instead of shrinking a fixed vw share further', () => {
    // .prism-ask/.prism-xe/.prism-fa/.prism-lv sized themselves as min(Npx, Mvw) with no floor, so
    // on a phone the whole thread/objections-list/scoreboard/model shrank to an unreadable sliver.
    const docks: [string, string][] = [
      ['src/live/prism/ask/ask.css', '.prism-ask'],
      ['src/live/prism/crossexam/crossexam.css', '.prism-xe'],
      ['src/live/prism/autopsy/autopsy.css', '.prism-fa'],
      ['src/live/prism/levers/levers.css', '.prism-lv'],
    ];
    for (const [path, cls] of docks) {
      const css = read(path);
      const narrow = css.match(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/);
      expect(narrow, `${path} is missing its narrow-viewport override`).not.toBeNull();
      expect(narrow![0]).toContain(cls);
      expect(narrow![0]).toContain('width: auto');
    }
  });
});
