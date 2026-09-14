// Regression guards for overflow bugs that only show up under real layout — jsdom has no layout
// engine (vitest runs with `css: false`, so no stylesheet is even parsed), so these are pinned by
// scanning the source text, the same idiom canvas-svg-label-patterns.test.ts uses for a layout bug
// that's likewise invisible to a jsdom render.
import { fontSizeFloorPx } from './helpers/fluidType';
import {
  CARD_W,
  COMPACT_W,
  FRONT_SLOT,
  STUDY_FIT_FLOOR,
  WIDE_CARD_W,
  WIDE_FRONT_SLOT,
} from '../src/canvas/study/slots';
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

  it('lets the beat bar take the width its beats need before the strip scrolls', () => {
    // A chip is an object's whole name, and the strip fades a chip it cannot show whole. With a
    // fixed cap the third of three chips sat cut mid-word under the fade on a 1680px window that
    // had room for a dozen — the bar may grow to the stage, and only the stage bounds it. The
    // HUD scale is a transform, so the layout width divides it out or full screen spills.
    const bar = /\.study-beats\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(bar).toBeTruthy();
    expect(bar).toMatch(/max-width:\s*calc\(\d+% \/ var\(--study-hud, 1\)\)/);
    expect(bar).not.toMatch(/max-width:[^;]*\d+px/);
  });

  it('collapses the floor band on a shallow stage instead of cropping into the cards', () => {
    // useStudyScale flags data-shallow when the clamped scale would crop deeper than the desk's
    // decorative band; the floor grid is the sacrifice, the arc is not.
    const shallow = /\.study-stage\[data-shallow\] \.study-floor\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(shallow).toMatch(/display:\s*none/);
  });

  it('derives the scale floor from the legibility floor rather than choosing it', () => {
    // 9px rendered ÷ the ramp's 10px floor: if either number moves, the floor must be recomputed.
    // The constant lives beside the slots so the CSS and the arithmetic cannot drift apart.
    expect(scene).toMatch(/RAMP_FLOOR_PX = 10/);
    expect(scene).toMatch(/STUDY_FIT_FLOOR = 9 \/ RAMP_FLOOR_PX/);
    expect(css).toMatch(/9\/11 of authored size|STUDY_FIT_FLOOR/);
  });

  it('derives the stage-height floor the same way — below it the frame slices cards', () => {
    // 587 = (740 − SHALLOW_CROP) × STUDY_FIT_FLOOR + 2px border. A 390px floor let 1366×768
    // crop 266 design px into the composition — the front card's top edge left the stage.
    expect(css).toMatch(/height:\s*clamp\(587px/);
  });

  it('sizes the stage from measured chrome and lets a short column scroll the intact desk', () => {
    // The height used to be `100dvh − 380px`, a guess at the top bar + dock that only cleared
    // real chrome above ~1006px of viewport — so every laptop got the floored desk inside a
    // column shorter than the stage. The dock publishes its own height into --dock-h.
    expect(css).toMatch(/--study-column-h:\s*calc\(100dvh - 92px - var\(--dock-h, 76px\)\)/);
    expect(css).toMatch(
      /height:\s*clamp\(587px, var\(--study-stage-height, var\(--study-column-h\)\), 820px\)/,
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

  it('lets the phone bar wrap, with the stepper as the row that gives', () => {
    // On the phone column the bar is a block in the flow, not a strip over the desk, so a second
    // row costs height rather than stranding a control. The walk button, the mute and the notes
    // toggle are fixed-size; a half-width basis is what wraps the stepper under them instead of
    // letting it collapse to nothing while the toggle runs past the stage edge at 320px.
    const phone = css.slice(css.indexOf('@container study (max-width: 700px)'));
    expect(phone).toMatch(/\.study-beats\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(phone).toMatch(/\.study-stepper\s*\{[^}]*flex:\s*1 1 50%[^}]*order:\s*1/);
    expect(phone).toMatch(/\.study-beats-divider\s*\{[^}]*display:\s*none/);
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

  it('shows where the row continues, so the overflow is reachable with a mouse', () => {
    // `overflow-x: auto` is a capability, not an affordance. The row once hid its scrollbar with
    // nothing in its place, so on a desktop with a mouse nothing showed that families continued
    // past the right edge and nothing but a guessed shift+wheel could reach them — the row read as
    // simply truncated. The native bar is hidden again now, and the rail around the row is what
    // stands in for it: the edge with more fades out and carries an arrow button. Hiding the bar is
    // only allowed while both of those exist.
    const chipsRule = /\.vlib-chips\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(chipsRule).toMatch(/scrollbar-width:\s*none/);
    expect(css).toMatch(/\.vlib-rail\[data-edge='end'\] \.vlib-chips\s*\{[^}]*mask-image/s);
    expect(css).toMatch(/\.vlib-rail\[data-edge='start'\] \.vlib-chips\s*\{[^}]*mask-image/s);
    expect(css).toMatch(/\.vlib-rail-nudge\s*\{[^}]*position:\s*absolute/s);
    const rail = read('src/gallery/FamilyRail.tsx');
    expect(rail).toMatch(/className="vlib-rail-nudge is-start"/);
    expect(rail).toMatch(/className="vlib-rail-nudge is-end"/);
    expect(rail).toMatch(/aria-label="Show earlier families"/);
    expect(rail).toMatch(/aria-label="Show more families"/);
  });
});

describe('gallery toolbar — the controls stay on one row above a phone', () => {
  const css = read('src/gallery/gallery.css');
  const phone = css.slice(css.indexOf('@media (width <= 640px)'));

  it('never lets the desktop controls wrap onto a second line', () => {
    // At ~1400px the search, the density switch and the theme toggle used to wrap because three
    // dev-only audit buttons shared their row; the audits have a row of their own now, and the
    // controls row must not opt back into wrapping outside the phone rule.
    const controls = /\.vlib-controls\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(controls).not.toMatch(/flex-wrap:\s*wrap/);
    expect(phone).toMatch(/\.vlib-controls\s*\{[^}]*flex-wrap:\s*wrap/s);
  });

  it('keeps the dev audit buttons out of the controls row', () => {
    const app = read('src/gallery/GalleryApp.tsx');
    const controls = app.slice(
      app.indexOf('className="vlib-controls"'),
      app.indexOf('vlib-audits'),
    );
    expect(controls).not.toContain('vlib-audit ');
    expect(css).toMatch(/\.vlib-audits\s*\{[^}]*display:\s*flex/s);
  });
});

describe('gallery controls — phone layouts keep the density switch and theme control together', () => {
  const css = read('src/gallery/gallery.css');
  const phone = css.slice(css.indexOf('@media (width <= 640px)'));

  it('lets the segmented control share the row instead of forcing the theme button below it', () => {
    expect(phone).toMatch(/\.vlib-variants\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0/s);
    expect(phone).not.toMatch(/\.vlib-variants\s*\{[^}]*width:\s*100%/s);
  });

  it('keeps every toolbar control at the 44px touch-target floor, and at ONE height', () => {
    // One row of chrome must read as one line: the density switch used to stand 54px beside a
    // 44px search and a 38px theme toggle. The switch's segments are shorter than the floor on
    // purpose and get their finger floor from the coarse-pointer hit rescue in mobile.css.
    expect(css).toMatch(/\.vlib-back\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.vlib-search\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.vlib-variants\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.vlib-theme\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  });

  it('keeps the segments either touching or the tap gate\u2019s 6px apart, never a sliver between', () => {
    // The redesign tightened the gap to 4px and the tap gate flagged the switch at 834px: a gap
    // under 6px is a dead zone too small to be a gap and too wide to be a shared edge. The row
    // cannot wrap above a phone, so the width is the search box's to give up, not the row's.
    const gap = css.match(/\.vlib-variants\s*\{[^}]*?gap:\s*(\d+)px/s);
    expect(gap).not.toBeNull();
    const px = Number(gap?.[1]);
    expect(px === 0 || px >= 6).toBe(true);
  });
});

describe('phone utility controls — every icon-only action remains thumb-sized', () => {
  it('keeps setup search, provider chevron, legal details, and treemap crumbs at 44px', () => {
    expect(read('src/styles/setup-wizard.css')).toMatch(
      /@media \(width <= 430px\)[\s\S]*\.setup-nav \.topbar-search-btn\s*\{[^}]*height:\s*44px[^}]*width:\s*44px/,
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
  const mobile = css.slice(css.indexOf('@media (width <= 768px)'));

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
    expect(mobile).toMatch(
      /\.mavea-app\.with-rail\s*\{[^}]*--mobile-rail-h:\s*calc\(var\(--tap-min\) \+ 1px\)/s,
    );
    expect(mobile).toMatch(/\.mavea-app\.with-rail\s*\{[^}]*--canvas-dock-gap:\s*4px/s);
    expect(voice).toMatch(
      /padding-bottom:\s*calc\([\s\S]{0,180}var\(--mobile-rail-h, 0px\)[\s\S]{0,40}\)/,
    );
  });
});

describe('mobile fixed chrome — disclosure and demo controls preserve the reading viewport', () => {
  it('keeps the full voice disclosure available without laying every line into the dock', () => {
    const css = read('src/legal/feature-use-notice.css');
    const phone = css.slice(css.indexOf('@media (width <= 768px) {'));
    expect(phone).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
    expect(phone).toMatch(/-webkit-line-clamp:\s*2/);
    expect(phone).toMatch(/\.feature-use-notice-actions\s*\{[^}]*grid-column:\s*auto/s);
  });

  it('uses one touch-sized demo row with a step counter instead of a second dot row', () => {
    const css = read('src/demo/demo.css');
    const phone = css.slice(css.indexOf('@media (width <= 640px)'));
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
    const phone = css.slice(css.indexOf('@media (width <= 560px)'));
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
    const size = /font-size:\s*([^;]+)/.exec(body)?.[1];
    expect(size, `${sel} declares no font-size`).toBeDefined();
    expect(fontSizeFloorPx(size ?? '')).toBeGreaterThanOrEqual(9);
  });
});

describe('landing hero — short laptop windows keep the primary input in the opening composition', () => {
  const css = read('src/flagship/flagship.css');

  it('uses height-aware laptop tiers instead of scaling the hero from width alone', () => {
    expect(css).toMatch(/@media \(width > 768px\) and \(height <= 900px\)/);
    expect(css).toMatch(/@media \(width > 768px\) and \(height <= 650px\)/);
    expect(css).toMatch(/font-size:\s*clamp\(50px,\s*min\(6vw,\s*9dvh\),\s*72px\)/);
  });

  it('also bounds ultrawide hero scaling by viewport height', () => {
    const wide = css.slice(css.indexOf('@media (width > 1920px)'));
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
    // The normalisation lives in useScriptedLock's `wheelPixels` — a locked run has to forward the
    // wheel for the whole inert surface, not just the panel, and one scroller wants one rule.
    expect(src).toMatch(/wheelPixels\(e, sc\)/);
    const lock = read('src/tour/useScriptedLock.ts');
    expect(lock).toMatch(/deltaMode === 1/);
    expect(lock).toMatch(/deltaMode === 2/);
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

  it('drives every width on the stage from one custom property, so they cannot drift', () => {
    // Declared on the SCRIM rather than the sheet: the filmstrip under the sheet has to line up
    // with it, and a sibling cannot read a variable declared on the box beside it.
    const scrim = /\.zoom-scrim\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(scrim).toMatch(/--zoom-sheet-w:/);
    const sheet = /\.zoom-sheet\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(sheet).toMatch(/width:\s*var\(--zoom-sheet-w\)/);
    // The strip is the third consumer, and the one that would be visibly wrong if it drifted.
    const strip = /\.lens-strip\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(strip).toMatch(/width:\s*var\(--zoom-sheet-w\)/);
    // The pan the magnified block needs lives in its own box, not on the sheet: the sheet is a
    // clipped column so the toolbar above and the notes below never scroll with the card.
    const scroll = /\.zoom-sheet-scroll\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(scroll).toMatch(/overflow:\s*auto/);
    expect(sheet).toMatch(/overflow:\s*hidden/);
  });

  it('keeps the controls out of the scroller altogether', () => {
    // They used to be pinned INSIDE it with position: sticky, sized to the sheet — and once the
    // zoomed card overflowed, the toolbar's right end and its close button went with the
    // overflow. Outside the scroll box there is nothing to pin against.
    const bar = /\.zoom-sheet-toolbar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(bar).not.toMatch(/position:\s*sticky/);
    expect(bar).toMatch(/flex:\s*none/);
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
    expect(rule('.demox-panel')).toMatch(/bottom:\s*calc\(var\(--dock-h, 76px\) \+ 12px\)/);
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

  it('Ripple puts the verdict\u2019s one-thing sentence under its tag when the band is a phone\u2019s', () => {
    // Measured at 320\u00d7568: the tag took 150px of a 212px row and the sentence beside it could
    // not shrink below its path token, so it ran 39px past the band and the band's own overflow
    // cut it. The row wraps now and the sentence asks for a column a sentence can be read in;
    // with less than that beside the tag it takes the next line whole.
    const verdict = read('src/live/ripple/sections/shipverdict.css');
    expect(/\.ripple-verdict-one\s*\{[^}]*flex-wrap:\s*wrap/.test(verdict)).toBe(true);
    expect(
      /\.ripple-verdict-one-text\s*\{[^}]*flex:\s*1 1 \d+ch[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s.test(
        verdict,
      ),
    ).toBe(true);
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

  it('Focus keeps the answer page on ONE alignment axis, rail included', () => {
    // The stage was the only primary answer surface missing from the shared axis, and its reading
    // column is narrower than the measure because the filmstrip takes the right 268px + 28px gap.
    // So the scrubber above the hero and the footer below it ran ~296px past the card — read as
    // the card being misaligned, and with a note trail on the left it was inset on both sides.
    const voice = read('src/live/voice/voice.css');
    const tokens = read('src/styles/tokens-base.css');
    const focus = read('src/canvas/focus/focus.css');
    const live = read('src/live/LiveApp.tsx');

    // The rail measure is shared, because a SIBLING cannot read a variable set on the stage.
    expect(tokens).toMatch(/--focus-rail-w:\s*268px/);
    expect(tokens).toMatch(/--focus-rail-gap:\s*28px/);
    expect(focus).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) var\(--focus-rail-w, 268px\)/);

    // The stage joins the axis rather than sprawling past the measure on a wide display.
    expect(voice).toMatch(
      /\.mavea-app\.live-voice \.focus-stage[\s\S]{0,120}?max-width:\s*var\(--live-content-max\)/,
    );

    // …and in Focus the siblings step back by exactly the rail column, off the SAME base the
    // stage resolves against — `min(100%, measure)`, not the measure alone, or they sit 3px wide.
    expect(voice).toMatch(/\[data-view='focus'\]/);
    expect(voice).toMatch(
      /min\(100%, var\(--live-content-max\)\) - var\(--focus-rail-w\) - var\(--focus-rail-gap\)/,
    );
    // Aligned to the STAGE's left edge, not the wrapper's. The stage is on the shared axis, so it
    // centres itself once .topic-wrap is wider than the measure; a sibling pinned flush left then
    // sits left of the card by half that spare space — a gap down one side and none down the
    // other. Both rules therefore carry the stage's own centring term, and the notes rule adds the
    // trail's column on top. Measured at 1920 and 1661, with the trail and without: 0px each side.
    expect(voice).toMatch(/\(100% - min\(100%, var\(--live-content-max\)\)\) \/ 2/);
    expect(voice).not.toMatch(/margin-inline:\s*0 auto/);
    // Below 921px the rail stacks under the hero, so the correction must stop there.
    expect(voice).toMatch(/@media \(width >= 921px\)/);
    expect(focus).toMatch(/@media \(width <= 920px\)/);

    // The view has to reach the DOM for any of it to apply — a class set in JS rather than a CSS
    // `:has()`, the same reason FocusStage sets `has-notes` itself.
    expect(live).toMatch(/className="topic-wrap" data-view=\{viewMode\}/);

    // A live turn with a muted walk adds a THIRD column on the LEFT, so the reading column is
    // inset as well as narrowed. walkNotes only reaches TopicCanvas when the reader is on a live
    // turn, so no demo replay can render this shape — which is exactly how it went unhandled.
    expect(tokens).toMatch(/--focus-notes-w:\s*216px/);
    expect(voice).toMatch(/\[data-view='focus'\]:has\(\.focus-notes\)/);
    expect(voice).toMatch(
      /var\(--focus-notes-w\) - var\(--focus-rail-w\) - 2 \*\s*var\(--focus-rail-gap\)/,
    );
    // The notes rule carries the same centring term, plus the trail's own column on top.
    expect(voice).toMatch(/var\(--focus-notes-w\) \+\s*var\(--focus-rail-gap\)/);
    // …and it must stop where the trail itself does: below 1260px the column is display:none but
    // the aside is still in the DOM, so correcting for it put every sibling 244px right of the
    // hero. Measured at 1100px before this bound was added.
    expect(voice).toMatch(/@media \(width >= 1260px\)/);
    expect(focus).toMatch(/@media \(width <= 1259px\)/);
  });

  it('the Study note carries its own fit rather than being cropped by the frame', () => {
    // useStudyScale floors the desk scale at 9/10 so type stays legible, and that floor is a
    // HEIGHT bargain — it accepts cropping the decorative floor band. Horizontally the stage just
    // clips, so a short window cut the note's right edge off (measured: 18px lost at 1280x720).
    // Below a 1125px stage the scale is ALWAYS the floor — a higher one needs w > 1470*9/10 =
    // 1323px — so the correction is an exact relationship, not a breakpoint, and it is continuous:
    // 50cqw ÷ (0.9 × 1.048) = 53cqw of the desk's centre.
    const css = read('src/canvas/study/study.css');
    expect(
      /\.study-note-wrap\s*\{[^}]*left:\s*min\(1165px, calc\(569px \+ 53cqw\)\)/.test(css),
    ).toBe(true);
    // The stage is the named container the cqw resolves against.
    expect(css).toMatch(/container-name:\s*study/);
  });

  it('the Study’s scrawls give up width before they give up the frame', () => {
    // A left-margin scrawl is authored 168 design px left of the front card, which a 1280x720
    // window (a 986px stage) cuts clean off the frame's left edge — the pen was writing off the
    // paper. The rule is the note's derivation at the front slot's depth, and every number below
    // comes from the desk's own composition (slots.ts), so re-authoring a slot or a card width
    // moves the CSS or fails here — never neither.
    const css = read('src/canvas/study/study.css');
    const perspective = Number(/\.study-canvas\s*\{[^}]*perspective:\s*(\d+)px/.exec(css)?.[1]);
    expect(perspective).toBeGreaterThan(0);
    // The front slot stands nearer the eye than the desk's origin, so a design px paints larger.
    const projection = perspective / (perspective - FRONT_SLOT.z);
    // Half the stage in design px per unit of scale: the frame's left edge is 720 − reach·cqw/s.
    // The rule divides by the desk's scale rather than assuming the floor — above 1323px the
    // scale rises, a design px paints larger, and a floor-pinned reach claims room that is not
    // there.
    const reach = 50 / projection;
    const cqw = Number(
      /--study-frame-left:\s*calc\(720px - ([\d.]+)cqw \/ var\(--study-scale, 1\) - var\(--sx\) \+ 50%\)/.exec(
        css,
      )?.[1],
    );
    // Truncated rather than rounded: the rule may only ever place a mark INSIDE the true edge.
    expect(cqw).toBeLessThanOrEqual(reach);
    expect(reach - cqw).toBeLessThan(0.01);
    // Below 1323px the scale is the floor, which is where the relocation thresholds below live.
    const floorCqw = cqw / STUDY_FIT_FLOOR;

    // Both left-hand scrawls stop a gutter inside that edge, and the left one gives up width from
    // its outer side (its arrow anchors on the inner one) rather than crossing the frame.
    const GUTTER = 8;
    const ARROW_INSET = 18;
    const left = /\.study-mark\.slot-left\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(left).toContain(`left: max(-168px, calc(var(--study-frame-left) + ${GUTTER}px));`);
    expect(left).toContain(
      `width: min(150px, calc(-${GUTTER + ARROW_INSET}px - var(--study-frame-left)));`,
    );
    const bottom = /\.study-mark\.slot-bottom\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(bottom).toContain(`left: max(-150px, calc(var(--study-frame-left) + ${GUTTER}px));`);
    // …and its right edge holds where it was authored (-150 + 176 = 26px into the card, inside
    // the face's 28px padding): slid whole, the box lay across the block's last rows.
    const BOTTOM_REACH = 26;
    expect(bottom).toContain(
      `width: min(176px, calc(${BOTTOM_REACH - GUTTER}px - var(--study-frame-left)));`,
    );

    // Under 96px of box a 46-character remark is a five-line stack, so the scrawl moves over the
    // card's shoulder instead — per desk, because the wide card starts further left and its
    // column runs out sooner. The threshold is the stage width where the column left of the card
    // is exactly the gutter, the arrow's inset and that floor.
    const BOX_FLOOR = 96;
    const shoulderAt = (slot: { x: number }, cardW: number): number =>
      Math.ceil((720 - (slot.x - cardW / 2) + GUTTER + ARROW_INSET + BOX_FLOOR) / (floorCqw / 100));
    // The relocated scrawl keeps the frame clamp (the wide card's column runs out first, and a
    // bare -12px there writes past the frame's left edge) and takes the card's whole width — the
    // base rule's give-up width is the 64-96px box the move exists to escape.
    const shoulderBlock = (desk: string, at: number): string =>
      `@container study (width < ${at}px) {\n  ${desk} .study-mark.slot-left {\n` +
      `    left: max(-12px, calc(var(--study-frame-left) + ${GUTTER}px));\n` +
      '    top: auto;\n    bottom: calc(100% + 2px);\n    width: 100%;';
    expect(css).toContain(
      shoulderBlock('.study-card:not([data-wide])', shoulderAt(FRONT_SLOT, CARD_W)),
    );
    expect(css).toContain(
      shoulderBlock('.study-card[data-wide]', shoulderAt(WIDE_FRONT_SLOT, WIDE_CARD_W)),
    );
    // The bottom remark has no shoulder to move to, so under the same 96px it stands down — which
    // only the wide desk reaches above the compact cut.
    const bottomOutAt = (slot: { x: number }, cardW: number): number =>
      Math.ceil(
        (720 - (slot.x - cardW / 2) + BOX_FLOOR - (BOTTOM_REACH - GUTTER)) / (floorCqw / 100),
      );
    expect(bottomOutAt(FRONT_SLOT, CARD_W)).toBeLessThanOrEqual(COMPACT_W);
    expect(css).toContain(
      `@container study (width < ${bottomOutAt(WIDE_FRONT_SLOT, WIDE_CARD_W)}px) {\n` +
        '  .study-card[data-wide] .study-mark.slot-bottom {\n    display: none;',
    );
    // …which the stylesheet can only tell apart if the front card says which desk it is on.
    expect(read('src/canvas/study/StudyStage.tsx')).toMatch(
      /data-wide=\{front && wide \? '' : undefined\}/,
    );

    // The right-gutter scrawls sit between the card and Mavéa's note, and the note slides left
    // with the frame (the guard above): they stand down from the stage width where its left edge
    // comes within the gutter of the slot-right box.
    const note = /\.study-note-wrap\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    const noteRule = /left:\s*min\(1165px, calc\((\d+)px \+ (\d+)cqw\)\)/.exec(note);
    const noteW = Number(/width:\s*(\d+)px/.exec(note)?.[1]);
    expect(noteRule && noteW).toBeTruthy();
    // The note is centred on its coordinate, so its left edge is half a width back.
    expect(note).toMatch(/transform:\s*translate\(-50%, -50%\)/);
    const noteLeftAtZero = Number(noteRule?.[1]) - noteW / 2;
    const noteSlope = Number(noteRule?.[2]) / 100;
    const rightReach = Number(/\.study-mark\.slot-right\s*\{[^}]*right:\s*-(\d+)px/.exec(css)?.[1]);
    expect(rightReach).toBeGreaterThan(0);
    const slotRightEnd = FRONT_SLOT.x + CARD_W / 2 + rightReach;
    const standDownAt = Math.ceil((slotRightEnd + GUTTER - noteLeftAtZero) / noteSlope);
    expect(css).toContain(
      `@container study (width < ${standDownAt}px) {\n  .study-mark.slot-right,\n  .study-mark.slot-rightlow {\n    display: none;`,
    );
    // The connector shares that strip, so it is the one that stands down while a scrawl is drawn
    // there — and the stylesheet has to make that call, since only it can see the width.
    expect(css).toContain(
      `@container study (width >= ${standDownAt}px) {\n` +
        '  .study-card.is-front:has(.study-mark.slot-right, .study-mark.slot-rightlow) ~ .study-connect {\n' +
        '    display: none;',
    );
    expect(read('src/canvas/study/StudyStage.tsx')).not.toMatch(/usesRightGutter/);
  });
});

describe('demo gallery — a card’s parts line up with the cards beside it', () => {
  const css = read('src/flagship/flagship.css');

  it('lays each card out on the gallery’s own rows, pinned to the top of the shared header row', () => {
    // A header that wraps is a line or two taller than its neighbours, and with the card
    // stacking its own parts the blurb started lower on that one card. Subgrid rows make the
    // header row the tallest header across the row, and the top of the row is where every
    // header sits.
    const card = /\.fl-demo-card\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(card).toMatch(/grid-template-rows:\s*subgrid/);
    expect(card).toMatch(/grid-row:\s*span 3/);
    const top = /\.fl-demo-top\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(top).toMatch(/align-self:\s*start/);
    expect(css).toMatch(/@supports not \(grid-template-rows: subgrid\)/);
  });

  it('gives the persona line the whole card, not the title’s column beside the avatar', () => {
    // At four-across the title's column is narrower than the longest persona line, so one card
    // wrapped it to two lines while the three beside it kept one.
    const role = /\.fl-demo-role\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(role).toMatch(/grid-column:\s*1 \/ -1/);
    expect(css).not.toMatch(/\.fl-demo-who\b/);
  });
});

describe('two surfaces — the pair of buttons share one box', () => {
  it('keeps the Live button’s border, transparent, so it is not shorter than the ghost beside it', () => {
    const css = read('src/flagship/flagship.css');
    const live = /\.fl-ghost-btn\.live\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(live).toMatch(/border:\s*1px solid transparent/);
    expect(live).not.toMatch(/border:\s*none/);
  });
});

describe('coarse-pointer hit rescue — chrome is rescued, canvas content is left alone', () => {
  const css = read('src/styles/mobile.css');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  // The selector is pinned by running it, not by matching its text: jsdom has no layout engine but
  // it does match Selectors 4, so a scoping mistake shows up as the wrong element being hit.
  const rescue = (
    /(:where\(button[\s\S]*?\))\s*\{\s*position:\s*relative;/.exec(coarse)?.[1] ?? ''
  ).replace(/\s+/g, ' ');

  /** Every host a `Block` is drawn into, and the module that puts it in the DOM. */
  const HOSTS: Record<string, string> = {
    'card-grid': 'src/canvas/TopicCanvas.tsx',
    'focus-hero-card': 'src/canvas/focus/FocusStage.tsx',
    'cv-node-inner': 'src/canvas/focus/CanvasView.tsx',
    'study-card-face': 'src/canvas/study/StudyStage.tsx',
    'zoom-sheet-body': 'src/canvas/TopicCanvas.tsx',
    'vlib-render': 'src/gallery/GalleryApp.tsx',
    'wo-parts': 'src/live/world/WorldOverlay.tsx',
    'figure-embed__content': 'src/canvas/embed/FigureEmbed.tsx',
  };

  const rescued = (html: string): boolean => {
    document.body.innerHTML = html;
    return document.querySelectorAll(rescue).length === 1;
  };

  it('rescues the setup wizard’s buttons, which borrow the block sheet for their panel', () => {
    // A wizard turn hides the topbar and the dock, so these buttons are the only way through a
    // first conversation — excluding `.card` wholesale took the finger floor off every one.
    expect(rescue).toBeTruthy();
    expect(rescued('<div class="card reveal setup-card"><button>Continue</button></div>')).toBe(
      true,
    );
  });

  it('rescues the dashboards’ panel controls, which borrow it too', () => {
    expect(
      rescued('<section class="card dash-cadence-card"><button>Daily</button></section>'),
    ).toBe(true);
  });

  it('leaves a control inside a rendered block alone, in every host a block is drawn into', () => {
    for (const host of Object.keys(HOSTS)) {
      expect(
        rescued(`<div class="${host}"><div class="card reveal"><button>Ar</button></div></div>`),
        host,
      ).toBe(false);
    }
  });

  it('keeps the chrome beside a card rescued — its action cluster, a section’s controls', () => {
    // These sit in the grid cell or the Focus hero next to the card, not inside it, and on touch
    // they are shown at rest; excluding the whole host would take the finger floor off every one.
    expect(
      rescued(
        '<div class="card-grid"><div class="col-6"><div class="card reveal"></div><div class="block-actions"><button>Ask</button></div></div></div>',
      ),
    ).toBe(true);
    expect(
      rescued(
        '<div class="card-grid"><section class="depth-section"><button>Go deeper</button></section></div>',
      ),
    ).toBe(true);
    expect(
      rescued(
        '<div class="focus-hero-card"><div class="card reveal"></div><div class="block-actions"><button>Ask</button></div></div>',
      ),
    ).toBe(true);
  });

  it('names exactly those hosts, and each one is a class the code still renders', () => {
    // The shape is `:not(:where(<hosts>) .card *)`: a control is content only inside a block's
    // own card, and only where a block is drawn.
    const shape = /:not\(\s*:where\(\s*([^)]*?)\s*\)\s*\.card\s*\*\s*\)$/.exec(rescue);
    expect(shape, rescue).toBeTruthy();
    const listed = (shape?.[1] ?? '').split(',').map((s) => s.trim().replace(/^\./, ''));
    expect(listed.sort()).toEqual(Object.keys(HOSTS).sort());
    for (const [host, file] of Object.entries(HOSTS)) expect(read(file)).toContain(host);
  });
});
