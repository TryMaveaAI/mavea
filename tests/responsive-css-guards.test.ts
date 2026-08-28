// Regression guards for overflow bugs that only show up under real layout — jsdom has no layout
// engine (vitest runs with `css: false`, so no stylesheet is even parsed), so these are pinned by
// scanning the source text, the same idiom canvas-svg-label-patterns.test.ts uses for a layout bug
// that's likewise invisible to a jsdom render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('Conversation Room — a compact lesson stays inside the viewport', () => {
  const css = read('src/canvas/room/room.css');

  it('stands down the nearby ring when the typed note and foreground become full-width', () => {
    // At <=820px the foreground and note return to flow. Leaving every nearby actor as another
    // 100%-wide row made the note-gutter positioning push them beyond the right edge; navigation
    // already exposes every teaching point without turning the room into a clipped card list.
    const compactActors =
      /\.room-stage\[data-note-gutter\] \.room-actor,[^{]+\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(compactActors).toMatch(/display:\s*none/);
    expect(css).toMatch(/\.room-stage:is\(:fullscreen, \.is-fullscreen\)/);
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/height:\s*100dvh/);
  });
});

describe('tour transport — 21 chapter dots must not blow out the panel on a phone', () => {
  const css = read('src/tour/tour.css');

  it('keeps Back/Play/Next/Skip a fixed size — only the dot rail is allowed to shrink', () => {
    // Without flex-shrink:0 the default flex-shrink:1 lets an overflowing row squash every
    // control (ovalizing the round buttons) instead of just scrolling the one element that
    // has more content than fits: the dots.
    const btnRule = /\.tourx-btn\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    const skipRule = /\.tourx-skip\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(btnRule).toMatch(/flex-shrink:\s*0/);
    expect(skipRule).toMatch(/flex-shrink:\s*0/);
  });

  it('makes the dot rail the one scrollable element instead of wrapping or overflowing', () => {
    const dotsRule = /\.tourx-dots\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(dotsRule).toMatch(/overflow-x:\s*auto/);
    expect(dotsRule).toMatch(/min-width:\s*0/);
  });

  it('gives each 7px dot a real touch-sized tap target via a transparent halo', () => {
    const haloRule = /\.tourx-dot::before\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(haloRule).toMatch(/inset:\s*-9px/);
  });

  it('centres the coach on the post-rail workspace axis at every desktop rail width', () => {
    const panelRule = /\.tourx-panel\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(panelRule).toMatch(/left:\s*calc\(50% \+ var\(--rail-w, 0px\) \/ 2\)/);
    expect(panelRule).toMatch(/width:\s*min\(560px, calc\(100vw - var\(--rail-w, 0px\) - 32px\)\)/);
  });
});

describe('gallery family chips — a sticky filter bar must never out-grow the viewport', () => {
  const css = read('src/gallery/gallery.css');

  it('scrolls the chip row instead of wrapping it across many lines', () => {
    // .vlib-bar is `position: sticky`; letting a dozen-plus chips wrap unbounded can make the
    // sticky bar taller than a phone's whole viewport, hiding every tile beneath it. A single
    // scrollable row keeps the bar's height fixed at any width.
    const chipsRule = /\.vlib-chips\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipsRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(chipsRule).toMatch(/overflow-x:\s*auto/);
  });

  it('keeps each chip from shrinking inside the scroll row', () => {
    const chipRule = /\.vlib-chip\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipRule).toMatch(/flex-shrink:\s*0/);
  });

  it('leaves the scrollbar visible, so the overflow is reachable with a mouse', () => {
    // `overflow-x: auto` is a capability, not an affordance. The row used to hide its scrollbar on
    // both engines, so on a desktop with a mouse nothing showed that families continued past the
    // right edge and nothing but a guessed shift+wheel could reach them — the row read as simply
    // truncated. Asserting the overflow property alone passed the whole time this was true.
    const chipsRule = /\.vlib-chips\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipsRule).not.toMatch(/scrollbar-width:\s*none/);
    const webkit = /\.vlib-chips::-webkit-scrollbar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(webkit).not.toMatch(/display:\s*none/);
    expect(webkit).toMatch(/height:\s*\d/);
  });
});

describe('flagship mobile nav — the compact Explore items must actually win the cascade', () => {
  const css = read('src/flagship/flagship.css');

  it('uses a compound selector so display:none beats .fl-explore-item’s own display:flex', () => {
    // A single-class `.fl-explore-item--compact { display: none }` has the SAME specificity as
    // `.fl-explore-item { display: flex }` — whichever rule is later in the file wins, which
    // silently broke this on desktop once before. The compound selector always wins regardless
    // of source order.
    expect(css).toMatch(/\.fl-explore-item\.fl-explore-item--compact\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.fl-explore-item\.fl-explore-item--compact\s*\{\s*display:\s*flex/);
  });
});

describe('landing captions — reading text stays on the 9px legibility floor', () => {
  const css = read('src/flagship/flagship.css');

  // Below ~9px rendered, the UI audit reports text as illegible (an 8.5px caption tripped it
  // once already). These three are real reading text on the landing: the rail eyebrow, the demo
  // card's badge, and the map attribution. The decorative glyphs inside the aria-hidden feature
  // vignettes (.fs-* i) are not reading text and are deliberately left alone.
  it.each(['.fl-rail-title', '.fl-demo-badge', '.fl-map-attr'])('%s is 9px or larger', (sel) => {
    const body = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const size = /font-size:\s*([\d.]+)px/.exec(body)?.[1];
    expect(size, `${sel} declares no font-size`).toBeDefined();
    expect(Number(size)).toBeGreaterThanOrEqual(9);
  });
});

describe('tierlist — a tier graded in WORDS must not be shredded mid-syllable', () => {
  const css = read('src/canvas/blocks/everyday/styles.css');
  const railRule = /\.tier-rail\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  const rowsRule = /\.tier-rows\s*\{[^}]*\}/.exec(css)?.[0] ?? '';

  it('never pins the rail to a fixed width — the fixture grades S/A/B/C, real answers grade in words', () => {
    // The shipped bug: `flex: 0 0 56px` is generous for one letter and impossible for "Significant",
    // so every word wrapped mid-syllable ("Critic|al"). 56px survives only as a FLOOR.
    expect(railRule).not.toMatch(/flex:\s*0\s+0\s+\d/);
    expect(railRule).toMatch(/min-width:\s*56px/);
  });

  it('breaks a word only as a last resort — `anywhere` also destroys the min-content the track reads', () => {
    // `overflow-wrap: anywhere` reports min-content as ONE CHARACTER, so the track that is supposed
    // to size itself to the longest word sizes itself to nothing instead, and the word shreds.
    expect(railRule).toMatch(/overflow-wrap:\s*break-word/);
    expect(railRule).not.toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('floors the shared track at min-content so a whole word always fits on its own line', () => {
    expect(rowsRule).toMatch(/grid-template-columns:\s*minmax\(min-content,\s*max-content\)/);
  });

  it('caps the rail in ch, never a percentage — a % max-width collapses the very track it sizes', () => {
    // Measured: `max-width: 45%` on the grid item resolves against its own track, drove the track
    // back to its 56px floor and shredded every word again. `ch` scales with the type instead.
    expect(railRule).toMatch(/max-width:\s*\d+ch/);
    expect(railRule).not.toMatch(/max-width:\s*\d+%/);
  });

  it('never reclaims the `.tl-` names the core Timeline already owns globally', () => {
    // src/canvas/Timeline.tsx renders `.tl-row` / `.tl-rail`, styled globally in styles/canvas.css,
    // and both sheets are live together the moment a tierlist mounts. While TierList used the same
    // names the two silently overwrote each other: Timeline's `gap: 14px` opened a stray gutter
    // between a tier and its chips, and its `:not(:last-child) .tl-rail::after` drew a connector
    // line inside the tier cell. Distinct prefixes are the only thing keeping them apart.
    expect(css).not.toMatch(/^\.tl-(row|rail|rows|items|chip|empty|caption)\b/m);
    const timeline = read('src/canvas/Timeline.tsx');
    expect(timeline).toMatch(/className="tl-row"/);
    expect(read('src/canvas/blocks/everyday/TierList.tsx')).not.toMatch(/className="tl-/);
  });

  it('keeps a non-subgrid fallback so old engines get whole words, even if rails go ragged', () => {
    expect(css).toMatch(/@supports not \(grid-template-columns: subgrid\)/);
  });
});

// The walkthrough panel is `position: fixed`, so it sits OUTSIDE `.canvas-scroll` and its only
// ancestors are the overflow:hidden app shell. A wheel over it therefore finds no scrollable
// ancestor and the answer refuses to move — and the panel is parked over the content, which is
// exactly where a reader rests the cursor. Reported as "I can't scroll the tour", reproduced in the
// browser (scrollTop stayed 0 while the canvas overflowed by 1636px), and fixed by forwarding the
// delta. jsdom has no scrolling, so the wiring is pinned by source scan.
describe('walkthrough panel never blocks scrolling the answer behind it', () => {
  const src = read('src/tour/TourOverlay.tsx');

  it('forwards the wheel to the canvas scroller', () => {
    expect(src).toMatch(/onWheel=\{forwardWheel\}/);
    expect(src).toMatch(/querySelector<HTMLElement>\('\.canvas-scroll'\)/);
    expect(src).toMatch(/scrollTop \+= /);
  });

  it('normalises line and page wheel modes so a mouse wheel is not a one-pixel nudge', () => {
    expect(src).toMatch(/deltaMode === 1/);
    expect(src).toMatch(/deltaMode === 2/);
  });

  it('does NOT fix it by making the panel pointer-transparent', () => {
    // That would restore scrolling by letting CLICKS fall through onto the cards behind the panel.
    const rule = /\.tourx-panel\s*\{[^}]*\}/.exec(read('src/tour/tour.css'))?.[0] ?? '';
    expect(rule).toMatch(/pointer-events:\s*auto/);
  });
});

// The tour's end card is a two-column grid capped at the viewport, with each column set to scroll.
// On a short window the 30-item explore list was cut off mid-row and could not be reached at all.
// Two separate things are required and BOTH were missing/insufficient:
//   1. `min-height: 0` on each column — a grid item defaults to `min-height: auto` and refuses to
//      shrink below its content, so `overflow-y: auto` never engages.
//   2. a CONSTRAINED row — `min-height: 0` alone is not enough. Measured in the browser: with the
//      columns fixed but the row still auto-sized, the extras column stayed 1204px tall inside a
//      644px card and `overflow: hidden` merely clipped it. The row cap is what makes it scroll.
describe('tour end card — the explore list must be reachable on a short window', () => {
  const css = read('src/tour/tour.css');
  const rule = (sel: string): string => new RegExp(`\\${sel}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';

  it("caps the card's row so its columns cannot grow past it", () => {
    expect(rule('.tour-end-card')).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  });

  it('lets each column shrink below its content so overflow-y can engage', () => {
    for (const sel of ['.tour-end-extras', '.tour-end-intro']) {
      expect(rule(sel), `${sel} needs min-height: 0`).toMatch(/min-height:\s*0/);
      expect(rule(sel), `${sel} needs to scroll`).toMatch(/overflow-y:\s*auto/);
    }
  });
});

// The zoom sheet has to magnify the BLOCK, not just its type.
//
// `zoom: z` on a box whose rendered width is pinned by its parent gives that box a CSS-pixel width
// of (parent ÷ z) — so a chart or diagram sized to 100% of it lays out narrower by exactly the
// factor zoom then multiplies back, and renders at the same size at every level. Fixed lengths
// (icons, font sizes) still scale, which is why magnifying appeared to work on some blocks and to
// grow only the text on others: the ones that fill their container never moved. Measured in a real
// browser at 175%: the widest SVG went 630px → 630px before, and 630px → 1103px after.
describe('the zoom sheet magnifies the whole block, not only its text', () => {
  const css = read('src/styles/wow-polish.css');

  it('states the body width in the body’s own box, so `zoom` has a length to multiply', () => {
    const body = /\.zoom-sheet-body\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(body).toMatch(/width:\s*calc\(var\(--zoom-sheet-w\)/);
  });

  it('drives that width and the sheet’s from one custom property, so they cannot drift', () => {
    const sheet = /\.zoom-sheet\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(sheet).toMatch(/--zoom-sheet-w:/);
    expect(sheet).toMatch(/width:\s*var\(--zoom-sheet-w\)/);
    // The pan the magnified block now needs.
    expect(sheet).toMatch(/overflow:\s*auto/);
  });

  it('keeps the controls pinned while a magnified block is panned sideways', () => {
    // Sticky on the top axis alone rode away with the horizontal scroll once the content could
    // actually be wider than the sheet.
    const bar = /\.zoom-sheet-toolbar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(bar).toMatch(/position:\s*sticky/);
    expect(bar).toMatch(/top:\s*0/);
    expect(bar).toMatch(/left:\s*0/);
    expect(bar).toMatch(/width:\s*var\(--zoom-sheet-w\)/);
  });
});

// A figure on a cause card must truncate, not spill out of both sides of itself.
//
// The rule already declared `text-overflow: ellipsis`, and it was silently ignored: the shared
// `.wo-num, .wo-expand` block above makes the box an inline-flex that CENTRES its own text, and
// `text-overflow` acts on block containers. So a long value overflowed equally in both directions
// and the reader saw the middle of it clipped at both ends — "…) percent th…" — with nothing
// indicating there was more. Measured after the fix: display block, ellipsis applied, the box stays
// inside its parent.
describe('a cause card truncates a long figure instead of clipping it at both ends', () => {
  const css = read('src/live/world/world.css');

  it('gives .wo-num a block box, so its own text-overflow can apply', () => {
    const rule = /\n\.wo-num\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/display:\s*inline-block/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it('keeps the 24px pointer target the shared rule established', () => {
    const rule = /\n\.wo-num\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    // line-height stands in for the flex centring the block box gives up.
    expect(rule).toMatch(/line-height:\s*24px/);
    expect(/\.wo-num,\s*\n\.wo-expand\s*\{[^}]*min-height:\s*24px/.test(css)).toBe(true);
  });
});
