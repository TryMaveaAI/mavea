// Regression guards for overflow bugs that only show up under real layout — jsdom has no layout
// engine (vitest runs with `css: false`, so no stylesheet is even parsed), so these are pinned by
// scanning the source text, the same idiom canvas-svg-label-patterns.test.ts uses for a layout bug
// that's likewise invisible to a jsdom render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('The Study — a compact lesson stays inside the viewport', () => {
  const css = read('src/canvas/study/study.css');
  const scene = read('src/canvas/study/slots.ts');

  it('stands down the desk when the container cannot hold a legible 3-D composition', () => {
    // Under the compact stage attribute the front card and note return to flow and the blurred
    // back arc disappears entirely — its objects keep their NAMES on the beat chips; a 3-D scene
    // squeezed into a phone column is an unreadable miniature, not a study.
    const compact = /\.study-stage\[data-compact\][\s\S]*$/.exec(css)?.[0] ?? '';
    expect(compact).toBeTruthy();
    expect(compact).toMatch(/\.study-card\.is-back[^{]*\{[^}]*\}|\.study-card\.is-back,/);
    expect(compact).toMatch(/display:\s*none/);
    expect(css).toMatch(/\.study-stage:is\(:fullscreen, \.is-fullscreen\)/);
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/height:\s*100dvh/);
  });

  it('collapses the floor band on a shallow stage instead of cropping into the cards', () => {
    // useStudyScale flags data-shallow when the clamped scale would crop deeper than the desk's
    // decorative band; the floor grid is the sacrifice, the arc is not.
    const shallow = /\.study-stage\[data-shallow\] \.study-floor\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(shallow).toMatch(/display:\s*none/);
  });

  it('derives the scale floor from the legibility floor rather than choosing it', () => {
    // 9px rendered ÷ 11px authored: if either number moves, the floor must be recomputed. The
    // constant lives beside the slots so the CSS and the arithmetic cannot drift apart.
    expect(scene).toMatch(/STUDY_FIT_FLOOR = 9 \/ 11/);
    expect(css).toMatch(/9\/11 of authored size|STUDY_FIT_FLOOR/);
  });

  it('derives the stage-height floor the same way — below it the frame slices cards', () => {
    // 534 = (740 − SHALLOW_CROP) × STUDY_FIT_FLOOR + 2px border. A 390px floor let 1366×768
    // crop 266 design px into the composition — the front card's top edge left the stage.
    expect(css).toMatch(/height:\s*clamp\(534px/);
  });

  it('sizes the stage from measured chrome and lets a short column scroll the intact desk', () => {
    // The height used to be `100dvh − 380px`, a guess at the top bar + dock that only cleared
    // real chrome above ~1006px of viewport — so every laptop got the floored desk inside a
    // column shorter than the stage. The dock publishes its own height into --dock-h.
    expect(css).toMatch(/--study-column-h:\s*calc\(100dvh - 92px - var\(--dock-h, 76px\)\)/);
    expect(css).toMatch(
      /height:\s*clamp\(534px, var\(--study-stage-height, var\(--study-column-h\)\), 820px\)/,
    );
    const stage = /\.study-stage\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(stage).not.toMatch(/max-height:\s*var\(--study-column-h\)/);
    // …and the two surfaces that ARE allowed past it say so explicitly.
    const compact = /\.study-stage\[data-compact\]\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(compact).toMatch(/max-height:\s*none/);
    const fullscreen =
      /\.study-stage:is\(:fullscreen, \.is-fullscreen\)\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(fullscreen).toMatch(/max-height:\s*none/);
  });

  it('rules the note paper on the same rhythm the handwriting is set in', () => {
    // The rule spacing and the line box were written as two separate numbers — 28px against a
    // 21/1.35 box — so they drifted a third of a pixel per line and the hand slid off its rule.
    const note = /\.study-note-copy\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(note).toMatch(/--note-rule:/);
    expect(note).toMatch(/line-height:\s*var\(--note-rule\)/);
    // The gradient states its stops in terms of the same variable, never a literal.
    const gradient = /background-image:[^;]+;/.exec(note)?.[0] ?? '';
    expect(gradient).toMatch(/var\(--note-rule\)/);
    expect(gradient).not.toMatch(/\d+px\s+\d+px/);
  });

  it('lets full screen off the reading column, not just off the height cap', () => {
    // The stage caps its width at --canvas-col-max, a clamp whose floor is 1280px — wider than
    // most windows. Full screen asked for 100vw and was held to that clamp, so it filled the
    // middle of the screen with the app still showing around it.
    const fullscreen =
      /\.study-stage:is\(:fullscreen, \.is-fullscreen\)\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(fullscreen).toMatch(/max-width:\s*none/);
    expect(fullscreen).toMatch(/width:\s*100vw/);
  });

  it('keeps the compact breakpoint off the width a 1280px window resolves to', () => {
    // 1280 − 236 rail − 52 − 12 = 980.0 exactly, so a breakpoint of 980 decided the whole layout
    // on a sub-pixel: the most common laptop width was a coin toss between desk and column.
    expect(scene).toMatch(/COMPACT_W = 940/);
  });

  it('does not replace a wide Study with the flat fallback merely because the window is short', () => {
    const scale = read('src/canvas/study/useStudyScale.ts');
    expect(scale).toMatch(/const compact = !full && w <= COMPACT_W/);
    expect(scale).not.toMatch(/const compact =[^;]*\|\|[^;]*h/);
  });

  it('returns the compact front card to flow POSITIONED and with the desk slot cleared', () => {
    // Both halves or the pen misses. The card must stay a positioning context, because
    // `.ink-layer` is `position: absolute; inset: 0` — a static card hands the layer to the stage
    // instead, and every mark then draws at the stage's height against a viewBox cut to the
    // card's. But `relative` alone obeys the `left`/`top` the desk states as its 3-D slot, which
    // pushed the full-width column card a whole slot down and off the right edge, ink and all.
    const front =
      /\.study-stage\[data-compact\] \.study-card\.is-front\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(front).toMatch(/position:\s*relative/);
    expect(front).toMatch(/inset:\s*auto/);
    // The offsets it has to neutralise — if the desk ever stops speaking its slot in `left`/`top`,
    // this guard should be re-read rather than quietly kept.
    expect(css).toMatch(/\.study-card\s*\{[^}]*left:\s*var\(--sx\);\s*top:\s*var\(--sy\);/);
    expect(read('src/live/annotate/annotate.css')).toMatch(
      /\.ink-layer\s*\{[^}]*position:\s*absolute;\s*inset:\s*0;/,
    );
  });

  it('keeps the beat bar on one row, with the chip strip as the only thing that scrolls', () => {
    const beats = /\n\.study-beats\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(beats).toMatch(/flex-wrap:\s*nowrap/);
    // A control may share its rule with a sibling (the guide and the mute dress alike), so the
    // selector is matched anywhere in a rule's selector list, not only at the start of a line.
    for (const sel of ['.study-guide', '.study-mute', '.study-beat-next']) {
      const rule = new RegExp(`\\n(?:[^{}\\n]*,\\n)*\\${sel}(?:,\\n[^{}\\n]*)* \\{[^}]*flex: none`);
      expect(rule.test(css), `${sel} must not shrink`).toBe(true);
    }
    const row = /\n\.study-beats-row\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(row).toMatch(/overflow-x:\s*auto/);
    expect(row).toMatch(/min-width:\s*0/);
  });

  it('fades a chip-strip edge only on the side that actually has more', () => {
    // A permanent gradient sits over the first and last chips, which can never be scrolled away
    // from the ends — so the fades are driven by the row's own scroll position.
    expect(css).toMatch(/\.study-beats-row\[data-more-start\]/);
    expect(css).toMatch(/\.study-beats-row\[data-more-end\]/);
    const stage = read('src/canvas/study/StudyStage.tsx');
    expect(stage).toMatch(/toggleAttribute\('data-more-start', row\.scrollLeft > 1\)/);
    // Measured against the ROW: the beat bar is the chip's offset parent, so offsetLeft alone
    // carried the Guide button's width into the target and scrolled the first label off-screen.
    expect(stage).toMatch(
      /chip\.getBoundingClientRect\(\)\.left - row\.getBoundingClientRect\(\)\.left/,
    );
  });

  it('swaps the chip strip for a stepper on a container too narrow to read chips', () => {
    const stepper = css.slice(css.indexOf('@container study (max-width: 700px)'));
    expect(stepper).toMatch(/\.study-beats-row,\s*\n\s*\.study-beat-next\s*\{[^}]*display:\s*none/);
    expect(stepper).toMatch(/\.study-stepper\s*\{[^}]*display:\s*flex/);
  });

  it('quiets card transitions during a live window resize', () => {
    // The shallow flag and slot maths retune per RO tick; 0.9s eased moves compounding per
    // frame read as the layout falling apart while dragging the window edge.
    expect(css).toMatch(/:root\[data-resizing\][^{]*\.study-card[\s\S]{0,80}transition:\s*none/);
  });

  it('reflows the voice bubble into the compact column instead of floating it', () => {
    const compact = /\.study-stage\[data-compact\][\s\S]*$/.exec(css)?.[0] ?? '';
    expect(compact).toMatch(/\.study-voice\s*\{[^}]*position:\s*static/);
  });

  it('clamps the voice bubble left of the front card at every scale', () => {
    // The card's left edge is 50cqw − 428.8px·scale (the translateZ projection); a fixed-width
    // bubble sat on the card's header on every laptop.
    expect(css).toMatch(/\.study-voice\s*\{[\s\S]{0,700}var\(--study-scale/);
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

describe('gallery controls — phone layouts keep the density switch and theme control together', () => {
  const css = read('src/gallery/gallery.css');
  const phone = css.slice(css.indexOf('@media (max-width: 640px)'));

  it('lets the segmented control share the row instead of forcing the theme button below it', () => {
    expect(phone).toMatch(/\.vlib-variants\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0/s);
    expect(phone).not.toMatch(/\.vlib-variants\s*\{[^}]*width:\s*100%/s);
  });

  it('keeps every toolbar action at the 44px touch-target floor', () => {
    expect(css).toMatch(/\.vlib-back\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.vlib-search\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.vlib-variant\s*\{[^}]*min-height:\s*44px/s);
    expect(phone).toMatch(/\.vlib-theme\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  });
});

describe('phone utility controls — every icon-only action remains thumb-sized', () => {
  it('keeps setup search, provider chevron, legal details, and treemap crumbs at 44px', () => {
    expect(read('src/styles/setup-wizard.css')).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*\.setup-nav \.topbar-search-btn\s*\{[^}]*height:\s*44px[^}]*width:\s*44px/,
    );
    expect(read('src/live/setup/drop-select.css')).toMatch(
      /\.drop-select-chevron\s*\{[^}]*width:\s*44px/s,
    );
    expect(read('src/legal/feature-use-notice.css')).toMatch(
      /\.feature-use-notice a\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s,
    );
    expect(read('src/canvas/blocks/charts1/styles.css')).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*\.c1-crumb\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
    );
  });
});

describe('mobile session sheet — collapsed chrome never overlaps the answer', () => {
  const css = read('src/styles/mobile.css');
  const voice = read('src/live/voice/voice.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 768px)'));

  it('hides the desktop Past conversations footer until the transcript sheet opens', () => {
    // voice.css loads after the shared stylesheet and declares `.live-voice .rail-foot` as flex.
    // The compound shell selector must therefore outrank it, not merely occur earlier.
    expect(mobile).toMatch(
      /\.mavea-app\.with-rail \.side-rail \.rail-foot\s*\{[^}]*display:\s*none/s,
    );
    expect(mobile).toMatch(
      /\.mavea-app\.with-rail \.side-rail\.chat-open \.rail-foot\s*\{[^}]*display:\s*flex/s,
    );
  });

  it('wins the route-loaded desktop rail cascade and becomes one real bottom row', () => {
    const shell = /\.mavea-app\.with-rail \.side-rail\s*\{[^}]*\}/.exec(mobile)?.[0] ?? '';
    expect(shell).toMatch(/top:\s*auto/);
    expect(shell).toMatch(/width:\s*100%/);
    expect(shell).toMatch(/height:\s*var\(--mobile-rail-h\)/);
    expect(voice).toMatch(
      /\.mavea-app\.live-voice\.with-rail \.side-rail\s*\{[^}]*bottom:\s*calc\(var\(--dock-h\) \+ var\(--demo-h, 0px\)\)/s,
    );
  });

  it('reserves the collapsed sheet toggle as its own measured shell band', () => {
    expect(mobile).toMatch(/\.mavea-app\.with-rail\s*\{[^}]*--mobile-rail-h:\s*44px/s);
    expect(mobile).toMatch(/\.mavea-app\.with-rail\s*\{[^}]*--canvas-dock-gap:\s*4px/s);
    expect(voice).toMatch(
      /padding-bottom:\s*calc\([\s\S]{0,180}var\(--mobile-rail-h, 0px\)[\s\S]{0,40}\)/,
    );
  });
});

describe('mobile fixed chrome — disclosure and demo controls preserve the reading viewport', () => {
  it('keeps the full voice disclosure available without laying every line into the dock', () => {
    const css = read('src/legal/feature-use-notice.css');
    const phone = css.slice(css.indexOf('@media (max-width: 768px) {'));
    expect(phone).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
    expect(phone).toMatch(/-webkit-line-clamp:\s*2/);
    expect(phone).toMatch(/\.feature-use-notice-actions\s*\{[^}]*grid-column:\s*auto/s);
  });

  it('uses one touch-sized demo row with a step counter instead of a second dot row', () => {
    const css = read('src/demo/demo.css');
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/grid-template-rows:\s*44px/);
    expect(phone).toMatch(/\.demox-dots\s*\{[^}]*display:\s*none/s);
    expect(phone).toMatch(/\.demox-progress\s*\{[^}]*display:\s*flex/s);
    expect(phone).toMatch(
      /\.demox-note\s*\{[^}]*var\(--demo-h, 74px\)[^}]*var\(--mobile-rail-h, 44px\)/s,
    );
    expect(css).toMatch(/\.mavea-app:has\(\.demox-panel\) \.live-dock\s*\{[^}]*display:\s*none/);
  });

  it('keeps a phone voice-status orb without overflowing its duplicate word label', () => {
    const css = read('src/live/livedock.css');
    const phone = css.slice(css.indexOf('@media (max-width: 560px)'));
    expect(phone).toMatch(/\.live-voice \.vc-status-label\s*\{[^}]*display:\s*none/s);
  });

  it('reveals first-use disclosure and drawing coach sequentially in a fixed dock', () => {
    const css = read('src/live/voice/voice.css');
    expect(css).toMatch(
      /\.live-voice \.dock-main:has\(\.feature-use-notice\) \.ink-coach\s*\{[^}]*display:\s*none/,
    );
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

describe('landing hero — short laptop windows keep the primary input in the opening composition', () => {
  const css = read('src/flagship/flagship.css');

  it('uses height-aware laptop tiers instead of scaling the hero from width alone', () => {
    expect(css).toMatch(/@media \(min-width:\s*761px\) and \(max-height:\s*900px\)/);
    expect(css).toMatch(/@media \(min-width:\s*761px\) and \(max-height:\s*650px\)/);
    expect(css).toMatch(/font-size:\s*clamp\(50px,\s*min\(6vw,\s*9dvh\),\s*72px\)/);
  });

  it('also bounds ultrawide hero scaling by viewport height', () => {
    const wide = css.slice(css.indexOf('@media (min-width: 1920px)'));
    expect(wide).toMatch(/height:\s*clamp\(170px,\s*16dvh,\s*230px\)/);
    expect(wide).toMatch(/font-size:\s*clamp\(92px,\s*min\(5vw,\s*10dvh\),\s*116px\)/);
  });
});

describe('shared topbar — dark mode never inherits the browser default ink', () => {
  it('sets its own theme-aware foreground for the wordmark and inherited controls', () => {
    const css = read('src/styles/top-bar.css');
    const topbar = /\.topbar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(topbar).toMatch(/color:\s*var\(--text-primary\)/);
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

describe('the demo replay\u2019s chrome sits beside the app, never on top of it', () => {
  const css = read('src/demo/demo.css');
  const rule = (sel: string): string => new RegExp(`\\${sel}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';

  it('anchors the transport and its caption to the dock\u2019s measured height', () => {
    // The dock is 220\u2013360px tall depending on composer, caption and voice controls, so a
    // fixed 96px offset put the transport pill INSIDE it, over the spoken line and the toggles.
    expect(rule('.demox-panel')).toMatch(/bottom:\s*calc\(var\(--dock-h, 76px\) \+ 16px\)/);
    expect(rule('.demox-note')).toMatch(/bottom:\s*calc\(var\(--dock-h, 76px\) \+ 78px\)/);
  });

  it('anchors the persona banner past the session rail', () => {
    expect(rule('.demox-banner')).toMatch(/left:\s*calc\(var\(--rail-w, 0px\) \+ 18px\)/);
  });
});

describe('feature overlays scroll their own content instead of cropping it', () => {
  it('Ripple gives the impact map a real box and lets the section grow into a scroll', () => {
    // Measured at 1366\u00d7620: the verdict band handed the map its 214px flex remainder and clipped
    // a 412px world inside it \u2014 nodes cut off the top and bottom with nothing saying so.
    const ripple = read('src/live/ripple/ripple.css');
    const verdict = read('src/live/ripple/sections/shipverdict.css');
    expect(/\.ripple-panel\s*\{[^}]*height:\s*100%/.test(ripple)).toBe(true);
    expect(/\.ripple-impact\s*\{[^}]*min-height:\s*min\(420px, 62dvh\)/.test(ripple)).toBe(true);
    expect(/\.ripple-stage\s*\{[^}]*min-height:\s*min\(340px, 50dvh\)/.test(ripple)).toBe(true);
    expect(/\.ripple-verdict\s*\{[^}]*min-height:\s*100%/.test(verdict)).toBe(true);
    expect(/\.ripple-verdict-map\s*\{[^}]*min-height:\s*min\(420px, 62dvh\)/.test(verdict)).toBe(
      true,
    );
    // The header stays put while the rail and the main column scroll independently.
    expect(/\.ripple-head\s*\{[^}]*flex:\s*none/.test(ripple)).toBe(true);
    expect(/\.ripple-rail\s*\{[^}]*overflow-y:\s*auto/.test(ripple)).toBe(true);
    expect(/\.ripple-main\s*\{[^}]*overflow:\s*auto/.test(ripple)).toBe(true);
  });

  it('Focus caps its rails against the canvas column, not the window', () => {
    // `100vh - 140px` measured a box roughly three times the one the sticky rail actually has
    // (the real container was 253px tall), so neither list ever scrolled.
    const css = read('src/canvas/focus/focus.css');
    expect(css).toMatch(/--focus-col-h:\s*calc\(100dvh - 92px - var\(--dock-h, 76px\)\)/);
    expect(css).not.toMatch(/max-height:\s*calc\(100vh/);
    expect(/\.filmstrip-rail\s*\{[^}]*max-height:\s*calc\(var\(--focus-col-h\)/.test(css)).toBe(
      true,
    );
    expect(/\.focus-notes-list\s*\{[^}]*max-height:\s*calc\(var\(--focus-col-h\)/.test(css)).toBe(
      true,
    );
  });

  it('Deep zoom scrolls a level too tall for the window rather than stranding its last lines', () => {
    const css = read('src/live/deepzoom/deepzoom.css');
    expect(/\.dz-levels\s*\{[^}]*overflow:\s*hidden auto/.test(css)).toBe(true);
    // `align-self: center` would push the opening lines above the scrollport, out of reach.
    expect(css).not.toMatch(/align-self:\s*center;\n\s*transform-origin/);
    expect(/\.dz-level\s*\{[^}]*align-self:\s*safe center/.test(css)).toBe(true);
  });
});
