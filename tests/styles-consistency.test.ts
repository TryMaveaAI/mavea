// styles-consistency.test.ts — source-scan tripwires for the styles.css cleanup:
//   1. Pill radii go through the --r-full token, never the literal 999px (the one allowed
//      use is the token's own definition). Catches a regression that re-hardcodes the value.
//   2. The global overflow safety net (.card{overflow:hidden}) and the full-bleed SVG
//      width-cap rules must stay exactly as-is — they're load-bearing layout guards.
//   3. Touch targets: a hover:none media block grows the small composer/topbar controls to
//      the 44px minimum.
//   4. The rem baseline is established (html{font-size:100%}) for accessibility.
// These need no DOM — they're the cheapest durable guard against silent CSS drift.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

// The landing, Live chrome, and canvas now have separate manifests so a marketing visit does not
// download every block/rail rule. Follow their local @imports recursively and scan the effective
// design system rather than assuming all runtime CSS stays eager in styles.css.
const stylesDir = join(__dirname, '..', 'src/styles');
function collectCss(file: string, seen = new Set<string>()): string {
  const resolved = resolve(file);
  if (seen.has(resolved)) return '';
  seen.add(resolved);
  const source = readFileSync(resolved, 'utf8');
  const imports = [...source.matchAll(/@import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => collectCss(resolve(dirname(resolved), specifier), seen));
  return [source, ...imports].join('\n');
}
const seen = new Set<string>();
const css = ['styles.css', 'live-runtime.css', 'canvas-runtime.css']
  .map((entry) => collectCss(join(stylesDir, entry), seen))
  .join('\n');

describe('styles.css — radius tokenization', () => {
  it('uses --r-full for pill radii: the only literal 999px is the token definition', () => {
    const hits = css.match(/999px/g) ?? [];
    expect(hits.length).toBe(1);
    expect(css).toMatch(/--r-full:\s*999px;/);
  });

  it('has no stray 6/8/12px border-radius literals (use --r-sm / --r-md)', () => {
    expect(css).not.toMatch(/border-radius:[^;]*\b(6px|8px|12px)\b/);
  });
});

describe('styles.css — overflow + SVG cap safety net is preserved', () => {
  it('keeps the .card overflow:hidden backstop', () => {
    expect(css).toMatch(/\.card\s*\{[^}]*overflow:\s*hidden/);
  });

  it('keeps the zero-specificity :where() media cap fallback', () => {
    expect(css).toMatch(/:where\(\.card\)\s+:where\(img, svg, video, canvas\)/);
  });

  it('keeps the full-bleed SVG width cap selectors', () => {
    expect(css).toMatch(/\.card\s*>\s*svg\[width='100%'\]/);
  });
});

describe('styles.css — accessibility + touch', () => {
  it('establishes the rem baseline with html{font-size:100%}', () => {
    // The document reset lives with the type roles now — still an EAGER sheet, which is the whole
    // point: a first visit must get the baseline before any route's stylesheet has loaded.
    const typeRoles = readFileSync(join(stylesDir, 'type-roles.css'), 'utf8');
    expect(css + typeRoles).toMatch(/html\s*\{\s*font-size:\s*100%;\s*\}/);
  });

  it('grows controls to a 44px touch target under (hover: none)', () => {
    // The touch block names the composer mic/send + .ctrl and sets the 44px minimum.
    const block = css.match(/@media \(hover: none\) \{[^@]*\.ctrl[^@]*\}/s)?.[0] ?? '';
    expect(block).toMatch(/44px/);
    expect(css).toMatch(/\.pill-btn\s*\{\s*min-height:\s*44px/);
  });
});

describe('styles.css — responsive topbar + grid', () => {
  it('lets .ctrl-cluster shrink past its content (min-width:0)', () => {
    expect(css).toMatch(/\.ctrl-cluster\s*\{[^}]*min-width:\s*0/);
  });

  it('collapses the model chip to its icon on the smallest phones (<=430px)', () => {
    expect(css).toMatch(/@media \(max-width: 430px\)/);
  });

  it('drops the card grid to a single column at <=640px (not just <=500px)', () => {
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.col-11\s*,?\s*\{?[\s\S]*?grid-column:\s*span 12/,
    );
    expect(css).not.toMatch(/@media \(max-width: 500px\)/);
  });
});

describe('styles.css — brand dock: wordmark makes room for the docking jelly', () => {
  // The real presence face docks INTO the brand slot; the wordmark slides left when the slot is
  // empty (no orphaned gap) and right as the jelly lands. Two load-bearing invariants:
  it('keeps the jelly mark a fixed 21px box — measureHome reads its width for the dock target+scale', () => {
    // Collapsing this to 0 makes useScrollDock.measureHome bail (`if (!d.width) return`) and mis-scale
    // the docked face. The shape (and its width) now lives in the shared .jelly-mark class — .brand-dot
    // is paired with it at every call site and only layers docking opacity/transition on top.
    expect(css).toMatch(/\.jelly-mark\s*\{[^}]*width:\s*21px/s);
  });
  it('slides the wordmark by the --slot dock progress (flush left when undocked)', () => {
    expect(css).toMatch(/\.mavea-app\.face-homed\s+\.brand\s*\{[^}]*--slot:\s*1/s);
    expect(css).toMatch(/\.brand-name[\s\S]*?transform:\s*translateX\(calc\(\(var\(--slot/);
  });
});

describe('styles.css — mobile safe-area + touch-reveal fixes', () => {
  it('clears the home-indicator bar under the bottom composer dock', () => {
    // viewport-fit=cover (index.html) makes env(safe-area-inset-bottom) resolve to something
    // other than 0 on a notched phone; the dock must add it on top of its own padding.
    expect(css).toMatch(/\.rail-dock\s*\{[^}]*env\(safe-area-inset-bottom,\s*0px\)/);
  });

  it('wraps a long unbroken token (URL, identifier) inside a transcript bubble', () => {
    expect(css).toMatch(/\.bubble\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it('rests the block-actions cluster visible on touch for every gated card kind', () => {
    // Icon-only affordances that only reveal on :hover/:focus-within are undiscoverable on a
    // device with no hover — the same selector set must be shown at rest under (hover: none).
    const block = css.match(/@media \(hover: none\) \{[^@]*\.block-actions[^@]*\}/s)?.[0] ?? '';
    expect(block).toMatch(/\.askable/);
    expect(block).toMatch(/\.addable/);
    expect(block).toMatch(/\.flashcardable/);
    expect(block).toMatch(/opacity:\s*1/);
  });
});

describe('viewport + full-viewport-height surfaces', () => {
  const indexHtml = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const galleryCss = readFileSync(join(__dirname, '..', 'src/gallery/gallery.css'), 'utf8');

  it('opts index.html into safe-area insets via viewport-fit=cover', () => {
    expect(indexHtml).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
  });

  it('sizes the gallery stage with the dynamic viewport unit, not the static 100vh', () => {
    expect(galleryCss).toMatch(/\.vlib\s*\{[^}]*height:\s*100dvh/);
    expect(galleryCss).not.toMatch(/100vh/);
  });
});
