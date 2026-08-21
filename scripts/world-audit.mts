// world-audit.mts — headless sweep of the living-answer surface across the whole scenario corpus.
//
// The world gauntlet (tests/world-gauntlet*.test.tsx) proves every scenario BUILDS. It cannot prove
// any of them is legible: jsdom has no layout, so a card printed on top of another card, an axis
// label rendered at 4px, or a lever nobody can hit all pass it cleanly. This drives the dev harness
// at #/worldlab in a real Chromium, walks every OFFERED view of every scenario, and measures what
// actually landed on the glass.
//
// Everything here is a RENDERED measurement, never a world-space one. A card's type is scaled by
// the camera and by the world's counter-scale; a chart's <text> is authored in viewBox USER UNITS.
// So a font size is judged only after it has been through the element's own screen matrix
// (getScreenCTM for SVG, the accumulated CSS transform chain for HTML) — the repo's documented
// rule, and the difference between "13.5px" and the 4.7px a reader is actually squinting at.
//
// Requires a dev server already running (the lab route is dev-only):
//   pnpm dev                                              # or pnpm dev:web
//   node --import tsx scripts/world-audit.mts --port 5179
//   node --import tsx scripts/world-audit.mts --scenario chain-rainforest --theme light
//   node --import tsx scripts/world-audit.mts --scenario seed-2008,wide-election --views graph,chart
//   node --import tsx scripts/world-audit.mts --scenario seed-2008 --sizes all
//   node --import tsx scripts/world-audit.mts --sizes 1366x620,900x1200
//
// --sizes is the one worth reaching for when a layout changes: the default 1440×900 is the box the
// world is art-directed for, and it is the SHORT windows that break things — a stage squeezed
// between a header and a reserved band is where a composition stops fitting and the camera starts
// shrinking type. `all` sweeps the five shapes in SIZES below.
//
// Exits 1 with a printed report if anything is flagged. It is an on-demand instrument, not a push
// gate: the full corpus is a hundred worlds × three views and takes about half an hour of browser
// time, and some of what it finds is a design decision waiting to be made rather than a defect
// waiting to be fixed. Reach for --scenario while iterating; sweep everything before a release.
import { chromium, type Browser, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';
import { ALL_WORLD_SCENARIOS, allWorldScenario } from '../src/live/world/scenarios/index';
import type { Representation } from '../src/canvas/spatial/morph/types';
// useMorphStage's CLAMP.min, imported rather than copied so the audit and the camera can never
// disagree about where fitting stops. At the floor the world is explicitly pannable, so content
// past the stage edge is the design rather than a defect.
import { FIT_FLOOR } from '../src/canvas/spatial/morph/layouts/lanes';
import { REP_TEXT } from '../src/canvas/spatial/morph/vocabulary';

/** Laptop-shaped, and deliberately above 1024: the world is art-directed for this box, and the
 *  repo's known small-screen SVG-type limit excuses nothing at this width. */
const VIEWPORT = { width: 1440, height: 900 };
/** The sizes `--sizes all` sweeps. Chosen as the shapes that break DIFFERENT things rather than as
 *  a list of popular devices: a big desktop (does the world stay composed when there is room to
 *  spare), the art-directed laptop, a small laptop, a SHORT window (the shape that squeezes a
 *  stage between a header and a reserved band), and a tablet in portrait, which crosses the 960px
 *  breakpoint where the evidence rail stops being a sidebar and stacks under the stage. */
const SIZES: ReadonlyArray<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1366, height: 620 },
  { width: 900, height: 1200 },
];
/** Below this many RENDERED pixels text is not being read, it is being squinted at. */
const LEGIBLE_PX = 9;
/** The smaller side of a control's hit box, in px. Below it a pointer lands by luck. */
const MIN_TARGET = 24;

/** The view chips WorldOverlay offers, by the representation they switch to. Imported rather than
 *  mirrored: this used to be a hand-copied table, and a hand-copied table is one nobody updates —
 *  `morph/vocabulary` is plain TS with no CSS or React import precisely so this script can read it. */
const VIEW_LABEL: Record<Representation, string> = Object.fromEntries(
  Object.entries(REP_TEXT).map(([rep, text]) => [rep, text.chip]),
) as Record<Representation, string>;

interface Sized {
  text: string;
  where: string;
  size: string;
}
interface Overlap {
  a: string;
  b: string;
  area: number;
}
interface Clipped {
  text: string;
  where: string;
  lost: number;
}
interface Offstage {
  what: string;
  px: number;
}
interface SmallTarget {
  label: string;
  w: number;
  h: number;
}
interface Scrolled {
  where: string;
  px: number;
}
interface Placeholder {
  text: string;
  where: string;
}

/** One view of one scenario, as the page measured it. */
interface ViewAudit {
  cam: number;
  nodes: number;
  /** The smallest RENDERED type anywhere on the surface. Null means the walk found no text at all,
   *  which on a world that drew nodes is itself the alarm. */
  smallestPx: number | null;
  tiny: Sized[];
  overlaps: Overlap[];
  clipped: Clipped[];
  offstage: Offstage[];
  smallTargets: SmallTarget[];
  crowded: Overlap[];
  scrolled: Scrolled[];
  placeholders: Placeholder[];
}

interface Row extends ViewAudit {
  scenario: string;
  theme: string;
  view: string;
  /** The window this was measured in — a finding is only reproducible if it says at what size. */
  size: string;
  /** At the fit floor the world is pannable, so `offstage` is reported without failing. */
  pannable: boolean;
}

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

const list = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Runs IN the page. A plain string on purpose, not a function: tsx compiles this file with esbuild,
// which rewrites the functions it touches to carry a `__name` helper that does not exist inside the
// browser — a passed-in function dies on "__name is not defined" the moment it runs there.
const AUDIT_SCRIPT = `(() => {
  const panel = document.querySelector('.wo-panel');
  if (!panel) return null;
  const stage = panel.querySelector('.wo-stage');
  const stageRect = (stage || panel).getBoundingClientRect();
  const viewport = panel.querySelector('.mv-viewport');

  // getComputedStyle is the expensive call here and the same elements are asked about repeatedly.
  const styles = new Map();
  const cs = (el) => {
    let v = styles.get(el);
    if (!v) { v = getComputedStyle(el); styles.set(el, v); }
    return v;
  };

  const nameOf = (el) => {
    const raw = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
    const cls = raw.trim() ? '.' + raw.trim().split(/\\s+/).join('.') : '';
    const node = el.closest ? el.closest('.mv-node') : null;
    const id = node && node.dataset.id ? '[' + node.dataset.id + ']' : '';
    return (el.tagName.toLowerCase() + cls + id).slice(0, 56);
  };

  // Everything that decides whether a pixel is on screen, in one walk: display/visibility kill it
  // outright, and opacity MULTIPLIES down the tree. That last part is not a nicety here — every
  // node paints all three of its faces at once and hides the two it is not showing with opacity 0,
  // so reading the run's own element alone would report each label three times and call the copies
  // a perfect collision.
  const visibility = (el) => {
    let alpha = 1;
    for (let a = el; a && a !== panel.parentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      const o = parseFloat(s.opacity);
      if (!isNaN(o)) alpha *= o;
      if (alpha < 0.02) return 0;
    }
    return alpha;
  };

  // What one authored unit of this element becomes on the glass. SVG answers exactly, through its
  // own matrix; HTML has to be walked, because the camera's scale and the world's counter-scale sit
  // on two different ancestors and both of them resize the type underneath.
  const screenScale = (el) => {
    if (el.ownerSVGElement && el.getScreenCTM) {
      const m = el.getScreenCTM();
      if (m) {
        const det = Math.abs(m.a * m.d - m.b * m.c);
        if (det > 0) return Math.sqrt(det);
      }
    }
    let scale = 1;
    for (let a = el; a; a = a.parentElement) {
      const t = cs(a).transform;
      if (!t || t === 'none') continue;
      const nums = t.slice(t.indexOf('(') + 1, -1).split(',').map(Number);
      const m = t.indexOf('matrix3d') === 0
        ? [nums[0], nums[1], nums[4], nums[5]]
        : [nums[0], nums[1], nums[2], nums[3]];
      const det = Math.abs(m[0] * m[3] - m[1] * m[2]);
      if (det > 0) scale *= Math.sqrt(det);
    }
    return scale;
  };

  /** Is this element turned on screen? A rotated glyph's axis-aligned box is far bigger than the
   *  ink inside it, so it would false-flag against a perfectly clear upright neighbour. */
  const rotated = (el) => {
    for (let a = el; a && a !== panel; a = a.parentElement) {
      const tr = a.getAttribute && a.getAttribute('transform');
      if (tr && /\\brotate\\s*\\(/.test(tr)) return true;
      const t = cs(a).transform;
      const mm = t && t !== 'none' ? /matrix\\(([^)]+)\\)/.exec(t) : null;
      if (mm) {
        const p = mm[1].split(',').map(Number);
        if (Math.abs(p[1]) > 0.02 || Math.abs(p[2]) > 0.02) return true;
      }
    }
    return false;
  };

  const clips = (s) => !(s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible');
  /** Has this element already SAID what it does with content that will not fit? A clamp and an
   *  ellipsis are both a decision, not an accident. */
  const declaresTruncation = (el) => {
    const s = cs(el);
    return Boolean(
      (s.webkitLineClamp && s.webkitLineClamp !== 'none') ||
      (s.textOverflow && s.textOverflow.indexOf('ellipsis') !== -1)
    );
  };
  /** The screen-reader-only idiom: a 1px box with its own contents clipped away, announced but
   *  never painted. It cannot collide, cannot be too small to read, and cannot lose anything to a
   *  clip — measuring it reports the accessibility layer as a rendering fault. Specific on purpose:
   *  a real clip-path on a real box is still audited. */
  const srSeen = new Map(); // asked once per element, and asked about a lot of elements
  const srOnly = (el) => {
    let hit = srSeen.get(el);
    if (hit !== undefined) return hit;
    hit = false;
    for (let a = el; a && a !== panel.parentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.clip && s.clip !== 'auto') { hit = true; break; } // the legacy clip: rect(0 0 0 0) form
      if (s.clipPath && s.clipPath !== 'none') {
        // Its OWN box, not its box on screen: the camera scales the whole world, so on a one-node
        // world zoomed to 2.2× the canonical 1px sr-only span measures 2.2 screen pixels and a
        // screen-space threshold quietly stops recognising it.
        const w = typeof a.offsetWidth === 'number' ? a.offsetWidth : a.getBoundingClientRect().width;
        const h = typeof a.offsetHeight === 'number' ? a.offsetHeight : a.getBoundingClientRect().height;
        if (w <= 2 || h <= 2) { hit = true; break; }
      }
    }
    srSeen.set(el, hit);
    return hit;
  };
  /** A clip the reader can undo — a pane they can scroll, or type the design deliberately cut with
   *  a clamp or an ellipsis. Everything else has genuinely lost content off the edge of the world. */
  const excusedClip = (clipper, from) => {
    for (let a = from; a; a = a.parentElement) {
      if (declaresTruncation(a)) return true;
      if (a === clipper) break;
    }
    // The CAMERA's own box is a clip the reader undoes by DRAGGING rather than by a scrollbar. It
    // counts only when the world is actually larger than the stage — which is the pannable state
    // the offstage rule below already reports without failing. A viewport whose world fits inside
    // it is still held to this: a clip there is a real one.
    if (clipper.classList && clipper.classList.contains('mv-viewport')) {
      const world = clipper.querySelector('.mv-world');
      if (world) {
        const wr = world.getBoundingClientRect();
        const vr = clipper.getBoundingClientRect();
        if (wr.width > vr.width + 1 || wr.height > vr.height + 1) return true;
      }
    }
    const s = cs(clipper);
    const scrollableY = /auto|scroll/.test(s.overflowY) && clipper.scrollHeight > clipper.clientHeight + 1;
    const scrollableX = /auto|scroll/.test(s.overflowX) && clipper.scrollWidth > clipper.clientWidth + 1;
    return scrollableX || scrollableY;
  };

  const tiny = [];
  const placeholders = [];
  const clipped = [];
  const runs = [];
  let smallest = null;

  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent || '').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el) continue;
    // <title>/<desc> are the accessibility layer and <defs>/<clipPath>/<mask>/<pattern> are
    // definitions — none of it is ever painted, and a <title> has no screen matrix to measure by.
    if (el.closest('title, desc, defs, clipPath, mask, pattern')) continue;
    if (srOnly(el)) continue;
    if (visibility(el) < 0.15) continue;

    const s = cs(el);
    const size = parseFloat(s.fontSize) * screenScale(el);
    if (size > 0 && (smallest === null || size < smallest)) smallest = size;
    if (size > 0 && size < ${LEGIBLE_PX}) {
      tiny.push({ text: text.slice(0, 34), where: nameOf(el), size: size.toFixed(1) + 'px' });
    }
    if (/\\bundefined\\b|\\bNaN\\b|\\[object Object\\]/.test(text)) {
      placeholders.push({ text: text.slice(0, 60), where: nameOf(el) });
    }

    if (text.length < 2) continue;
    if (rotated(el)) continue;
    // A faded label (a ghost stroke, a watermark) is decoration nobody parses, so its box landing
    // on a real one is by design. Fades arrive as a low-alpha paint too, and SVG text paints
    // through fill rather than color.
    const paint = el.tagName.toLowerCase() === 'text' ? s.fill : s.color;
    const rgba = /rgba\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*([\\d.]+)\\s*\\)/.exec(paint) ||
      /rgba?\\([^)]*\\/\\s*([\\d.]+)\\s*\\)/.exec(paint);
    if (rgba && parseFloat(rgba[1]) < 0.4) continue;

    // Measure the TEXT, line by line, not the element's box: an inline run that wraps reports one
    // union rect spanning every line it touches, which reads as a flawless collision with itself.
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const box of Array.from(range.getClientRects())) {
      // A Range rect is the font's LINE box — ascent, descent and leading — not the ink, and on a
      // big display numeral that box reaches onto the line beneath. Tighten to the glyph band.
      const ink = Math.min(box.height, Math.max(size, 8) * 1.05);
      const inset = (box.height - ink) / 2;
      const raw = { left: box.left, right: box.right, top: box.top + inset, bottom: box.bottom - inset };
      const rawArea = (raw.right - raw.left) * (raw.bottom - raw.top);
      if (rawArea < 16) continue;
      // Clamp to every clipping ancestor, so what is left is exactly the ink on screen.
      let vis = raw;
      let cutBy = null;
      for (let a = el; a && a !== panel.parentElement; a = a.parentElement) {
        if (!clips(cs(a))) continue;
        const ar = a.getBoundingClientRect();
        const next = {
          left: Math.max(vis.left, ar.left),
          right: Math.min(vis.right, ar.right),
          top: Math.max(vis.top, ar.top),
          bottom: Math.min(vis.bottom, ar.bottom),
        };
        if (next.left !== vis.left || next.right !== vis.right || next.top !== vis.top || next.bottom !== vis.bottom) {
          if (!cutBy && !excusedClip(a, el)) cutBy = a;
        }
        vis = next;
        if (vis.right - vis.left <= 0 || vis.bottom - vis.top <= 0) break;
      }
      const w = vis.right - vis.left;
      const h = vis.bottom - vis.top;
      const lost = 1 - Math.max(0, w) * Math.max(0, h) / rawArea;
      if (cutBy && lost > 0.35) {
        clipped.push({ text: text.slice(0, 34), where: nameOf(el) + ' → ' + nameOf(cutBy), lost: Math.round(lost * 100) });
      }
      if (w < 4 || h < 4) continue;
      runs.push({ el: el, t: text, r: { left: vis.left, right: vis.right, top: vis.top, bottom: vis.bottom, w: w, h: h } });
    }
    range.detach();
  }

  const overlaps = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i], b = runs[j];
      if (a.el === b.el) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // nesting is not collision
      if (a.t && a.t === b.t) continue; // a layered effect draws the same string twice on purpose
      const lockA = a.el.closest('[data-tight-lockup]');
      if (lockA !== null && lockA === b.el.closest('[data-tight-lockup]')) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox <= 4 || oy <= 6) continue;
      const hit = ox * oy;
      // Judged against the SMALLER run, not a flat pixel count: two chips on one line legitimately
      // kiss, while a card landing on a label buries a solid share of it.
      if (hit > 200 && hit > Math.min(a.r.w * a.r.h, b.r.w * b.r.h) * 0.35) {
        overlaps.push({ a: a.t.slice(0, 26), b: b.t.slice(0, 26), area: Math.round(hit) });
      }
    }
  }

  // Anything the world paints, against the box it is painted into. The panel itself clips, so a
  // card past the stage edge is not merely ugly — it is gone.
  const offstage = [];
  for (const el of Array.from(panel.querySelectorAll('.mv-face, .mv-chrome-label, .mv-shelf-label'))) {
    if (visibility(el) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const out = Math.max(
      stageRect.left - r.left,
      r.right - stageRect.right,
      stageRect.top - r.top,
      r.bottom - stageRect.bottom,
    );
    if (out > 2) offstage.push({ what: nameOf(el), px: Math.round(out) });
  }

  // Horizontal scroll is never part of this layout — the rail scrolls vertically and nothing else
  // scrolls at all, so a pane that grew one is a pane that lost content sideways.
  //
  // Two exceptions, both argued from what the ink-level clip check above already proves. A clamped
  // label (display: -webkit-box + line-clamp) reports a scrollWidth wider than its client box while
  // every one of its line rects sits comfortably inside it — nothing is lost, the intrinsic width
  // of a -webkit-box is simply not its wrapped width. And an sr-only span is a 1px box holding a
  // whole sentence by design.
  const scrolled = [];
  for (const el of Array.from(panel.querySelectorAll('*'))) {
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth <= 0) continue;
    if (!clips(cs(el)) || declaresTruncation(el) || srOnly(el)) continue;
    // …and a third: the CAMERA's own clipping box. A world larger than the stage at the camera's
    // floor overflows .mv-viewport by design — that is the pannable state, reached by dragging
    // rather than by a scrollbar, and the offstage rule below already reports it on those terms.
    // Named specifically rather than exempting a class of element: everything else that clips is
    // still held to this.
    if (el.classList.contains('mv-viewport')) continue;
    scrolled.push({ where: nameOf(el), px: Math.round(el.scrollWidth - el.clientWidth) });
  }

  const TARGET = 'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const boxes = [];
  const smallTargets = [];
  for (const el of Array.from(panel.querySelectorAll(TARGET))) {
    const s = cs(el);
    if (s.pointerEvents === 'none' || visibility(el) < 0.05) continue;
    let r = el.getBoundingClientRect();
    // A node is a ZERO-SIZE anchor with its faces hanging off it, and only the face being shown
    // takes pointer events. So when a control's own box is too small to be the target, grow it by
    // whatever inside it can actually be pressed — starting FROM its own box, or an sr-only 1px
    // span would shrink a perfectly ordinary button down to a pixel.
    if (Math.min(r.width, r.height) < ${MIN_TARGET}) {
      const u = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      for (const kid of Array.from(el.querySelectorAll('*'))) {
        if (cs(kid).pointerEvents === 'none' || visibility(kid) < 0.05 || srOnly(kid)) continue;
        const kr = kid.getBoundingClientRect();
        if (kr.width < 1 || kr.height < 1) continue;
        u.left = Math.min(u.left, kr.left);
        u.right = Math.max(u.right, kr.right);
        u.top = Math.min(u.top, kr.top);
        u.bottom = Math.max(u.bottom, kr.bottom);
      }
      r = { left: u.left, right: u.right, top: u.top, bottom: u.bottom, width: u.right - u.left, height: u.bottom - u.top };
    }
    if (r.width < 1 || r.height < 1) continue;
    // The ON-SCREEN box: the raw rect clamped to whatever CLIPS it. getBoundingClientRect reports an
    // element's layout box and knows nothing about an ancestor's overflow, so on a spatial canvas —
    // where a world larger than its stage is clipped by design and reached by dragging — a card's
    // reported box runs on past the stage and lands on top of the evidence rail beside it. Neither
    // paint nor pointer events cross that boundary, so COLLISIONS are judged on this box.
    //
    // SIZE is not: how big a control is, is a property of the control, and half of it being
    // scrolled off the edge of a pannable world does not make it a small target — the offstage
    // check is what reports that. So the raw rect stays raw for the floor below, and only the
    // clamped copy is used for collisions.
    let onScreen = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    for (let a = el.parentElement; a && a !== panel.parentElement; a = a.parentElement) {
      if (!clips(cs(a))) continue;
      const ar = a.getBoundingClientRect();
      onScreen = {
        left: Math.max(onScreen.left, ar.left),
        right: Math.min(onScreen.right, ar.right),
        top: Math.max(onScreen.top, ar.top),
        bottom: Math.min(onScreen.bottom, ar.bottom),
        width: 0,
        height: 0,
      };
      onScreen.width = onScreen.right - onScreen.left;
      onScreen.height = onScreen.bottom - onScreen.top;
    }
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || nameOf(el)).slice(0, 34);
    if (onScreen.width > 1 && onScreen.height > 1) boxes.push({ el: el, label: label, r: onScreen });
    // Half a pixel of slack: a control laid out to exactly the floor must not fail on rounding.
    if (Math.min(r.width, r.height) < ${MIN_TARGET} - 0.5) {
      smallTargets.push({ label: label, w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  const crowded = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox <= 0 || oy <= 0) continue;
      const hit = ox * oy;
      // Two controls sharing a quarter of the smaller one's hit box: whichever is on top answers
      // for both, and the reader has no way to tell which they will get.
      if (hit > Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.25) {
        crowded.push({ a: a.label, b: b.label, area: Math.round(hit) });
      }
    }
  }

  const camRaw = viewport ? cs(viewport).getPropertyValue('--mv-cam-scale') : '';
  const dedup = (xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];
  return {
    cam: parseFloat(camRaw) || 1,
    nodes: panel.querySelectorAll('.mv-node').length,
    smallestPx: smallest === null ? null : Math.round(smallest * 10) / 10,
    tiny: dedup(tiny),
    overlaps: dedup(overlaps),
    clipped: dedup(clipped),
    offstage: dedup(offstage),
    smallTargets: dedup(smallTargets),
    crowded: dedup(crowded),
    scrolled: dedup(scrolled),
    placeholders: dedup(placeholders),
  };
})()`;

/** Every count that fails the run. `offstage` is counted by the caller, which knows whether the
 *  camera had stopped fitting — a pannable world past the stage edge is the design. */
function violations(row: Row): number {
  return (
    row.tiny.length +
    row.overlaps.length +
    row.clipped.length +
    row.smallTargets.length +
    row.crowded.length +
    row.scrolled.length +
    row.placeholders.length +
    (row.pannable ? 0 : row.offstage.length)
  );
}

/** Wait for the morph to stop moving. A representation swap flies the camera and cross-fades a
 *  whole chrome layer, and a fixed delay either measures a frame of that flight or wastes seconds
 *  on the worlds that settle instantly — so watch the geometry itself hold still.
 *
 *  The retiring chrome layer has to be GONE, not merely stable: under reduced motion it fades with
 *  no transition, so no transitionend fires and it is retired by useMorphStage's ~1.3s fallback
 *  timer — well after the positions stop moving. It paints nothing at opacity 0 but it still
 *  contributes layout overflow, and a graph's axes left lying under a timeline read as the timeline
 *  spilling a hundred pixels sideways. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __waKey?: string; __waTicks?: number };
    delete w.__waKey;
    delete w.__waTicks;
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __waKey?: string; __waTicks?: number };
      const nodes = [...document.querySelectorAll('.mv-node')];
      if (!nodes.length) return false;
      if (document.querySelector('.mv-chrome[data-exiting]')) return false;
      const key = nodes
        .map((n) => {
          const r = n.getBoundingClientRect();
          return `${Math.round(r.left)},${Math.round(r.top)}`;
        })
        .join('|');
      w.__waTicks = key === w.__waKey ? (w.__waTicks ?? 0) + 1 : 0;
      w.__waKey = key;
      return (w.__waTicks ?? 0) >= 3;
    },
    null,
    { timeout: 30_000, polling: 200 },
  );
  // The UI faces load with `font-display: swap`; measuring before the swap reads fallback metrics.
  await page.evaluate(() => document.fonts.ready);
}

async function auditScenario(
  page: Page,
  baseUrl: string,
  theme: string,
  size: string,
  id: string,
  wanted: readonly string[],
): Promise<Row[]> {
  await page.goto(`${baseUrl}/#/worldlab?s=${id}`, { waitUntil: 'load' });
  // `attached`, not `visible`: a node is a ZERO-SIZE anchor with its faces hanging off it, which
  // Playwright's visibility rule (a non-empty bounding box) reads as invisible forever.
  await page.waitForSelector('.wo-panel .mv-node', { state: 'attached', timeout: 30_000 });
  await settle(page);

  const offered = await page
    .locator('.wo-views .wo-chip')
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
  const rows: Row[] = [];
  for (const label of offered) {
    if (wanted.length && !wanted.includes(label)) continue;
    await page.getByRole('button', { name: label, exact: true }).click();
    await settle(page);
    const result = (await page.evaluate(AUDIT_SCRIPT)) as ViewAudit | null;
    if (!result) throw new Error(`${id} (${label}): the world panel never rendered`);
    rows.push({
      ...result,
      scenario: id,
      theme,
      size,
      view: label,
      pannable: result.cam <= FIT_FLOOR + 0.001,
    });
  }
  if (!rows.length) throw new Error(`${id}: none of the requested views is offered by this world`);
  return rows;
}

/** How many of one kind of finding a row prints before it says how many more there were. A world of
 *  sixty identical cards produces sixty identical lines, and a report nobody scrolls to the end of
 *  is a report nobody reads — the COUNT in the table above is the number that matters. */
const SHOWN_PER_KIND = 6;

function printKind<T>(kind: string, hits: readonly T[], line: (hit: T) => string): void {
  for (const hit of hits.slice(0, SHOWN_PER_KIND)) console.log(`  ${kind.padEnd(12)}${line(hit)}`);
  if (hits.length > SHOWN_PER_KIND) {
    console.log(`  ${''.padEnd(12)}… and ${hits.length - SHOWN_PER_KIND} more`);
  }
}

function printFindings(rows: Row[]): void {
  console.log('\n─── findings ───');
  for (const row of rows) {
    if (violations(row) === 0) continue;
    console.log(
      `\n${row.scenario} · ${row.view} · ${row.theme} · ${row.size} (camera ${row.cam.toFixed(2)}×)`,
    );
    printKind('ILLEGIBLE', row.tiny, (t) => `${t.size.padStart(7)}  "${t.text}"  ${t.where}`);
    printKind('OVERLAP', row.overlaps, (o) => `"${o.a}" ↔ "${o.b}" (${o.area}px²)`);
    printKind('CLIPPED', row.clipped, (c) => `${c.lost}% of "${c.text}"  ${c.where}`);
    if (!row.pannable) {
      printKind('OFFSTAGE', row.offstage, (o) => `${o.px}px past the stage  ${o.what}`);
    }
    printKind('SCROLLED', row.scrolled, (s) => `${s.px}px sideways  ${s.where}`);
    printKind('TARGET', row.smallTargets, (t) => `${t.w}×${t.h} (<${MIN_TARGET})  ${t.label}`);
    printKind('STACKED', row.crowded, (c) => `"${c.a}" ↔ "${c.b}" share ${c.area}px² of hit box`);
    printKind('PLACEHOLDER', row.placeholders, (p) => `"${p.text}"  ${p.where}`);
  }
}

async function main(): Promise<void> {
  const port = readFlag('port', '5179');
  const baseUrl = readFlag('url', `http://localhost:${port}`).replace(/\/$/, '');
  const themes = list(readFlag('theme', 'dark'));
  const asked = readFlag('scenario', 'all');
  const scenarios = asked === 'all' ? ALL_WORLD_SCENARIOS.map((s) => s.id) : list(asked);
  for (const id of scenarios) {
    if (!allWorldScenario(id)) {
      throw new Error(
        `Unknown scenario "${id}". Pass an id from src/live/world/scenarios, or all.`,
      );
    }
  }
  const views = list(readFlag('views', '')).map((v) => {
    const label = VIEW_LABEL[v as Representation];
    if (!label) throw new Error(`Unknown view "${v}". Use ${Object.keys(VIEW_LABEL).join(', ')}.`);
    return label;
  });

  const sizesFlag = readFlag('sizes', '');
  const sizes =
    sizesFlag === 'all'
      ? SIZES
      : sizesFlag
        ? list(sizesFlag).map((raw) => {
            const [w, h] = raw.toLowerCase().split('x').map(Number);
            if (!Number.isFinite(w) || !Number.isFinite(h)) {
              throw new Error(`Bad --sizes entry "${raw}". Use WxH, e.g. 1280x800.`);
            }
            return { width: w, height: h };
          })
        : [VIEWPORT];

  console.log(
    `[world-audit] ${scenarios.length} scenario(s) × ${views.length || 'every offered'} view(s) × ` +
      `${themes.join('/')} × ${sizes.map((s) => `${s.width}×${s.height}`).join(' ')} against ${baseUrl}`,
  );

  const browser: Browser = await chromium.launch({ headless: true });
  const rows: Row[] = [];
  const failed: string[] = [];
  try {
    for (const size of sizes) {
      const sizeLabel = `${size.width}×${size.height}`;
      for (const theme of themes) {
        // Geometry is measured in the settled state: entrance staggers deliberately move cards
        // through their own clipping boxes, and reduced motion is a supported product mode that
        // renders the same final layout at once — deterministic instead of a sampled frame.
        const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
        await ctx.addInitScript(
          ({ initialTheme, legalKey, legalVersion }) => {
            localStorage.setItem('mavea-theme', initialTheme);
            // #/worldlab is not on the legal gate's bypass list, so without this every load stops on
            // the acknowledgement screen and the audit measures a form.
            localStorage.setItem(
              legalKey,
              JSON.stringify({ version: legalVersion, acceptedAt: '2026-08-15T00:00:00.000Z' }),
            );
          },
          {
            initialTheme: theme,
            legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY,
            legalVersion: LEGAL_ACCEPTANCE_VERSION,
          },
        );
        const page = await ctx.newPage();
        for (const id of scenarios) {
          try {
            const got = await auditScenario(page, baseUrl, theme, sizeLabel, id, views);
            rows.push(...got);
            for (const row of got) {
              const bad = violations(row);
              console.log(
                `${row.scenario.padEnd(20)} ${row.view.padEnd(11)} ${row.theme.padEnd(5)} ` +
                  `${row.size.padEnd(9)} ` +
                  `${row.cam.toFixed(2)}× ${String(row.nodes).padStart(3)} nodes · ` +
                  `type ≥ ${(row.smallestPx === null ? '—' : row.smallestPx.toFixed(1) + 'px').padStart(6)} · ` +
                  `${String(row.tiny.length).padStart(3)} illegible · ` +
                  `${String(row.overlaps.length).padStart(2)} overlap · ` +
                  `${String(row.clipped.length).padStart(2)} clipped · ` +
                  `${String(row.offstage.length).padStart(2)} offstage${row.pannable ? '*' : ' '} · ` +
                  `${String(row.smallTargets.length + row.crowded.length).padStart(2)} targets · ` +
                  `${String(row.placeholders.length).padStart(2)} placeholder` +
                  (bad === 0 ? '  ✓' : ''),
              );
            }
          } catch (err) {
            const why = err instanceof Error ? err.message : String(err);
            console.log(`${id.padEnd(20)} ${theme.padEnd(5)} ${sizeLabel} — FAILED: ${why}`);
            failed.push(`${id} (${theme}, ${sizeLabel}): ${why}`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  const dirty = rows.filter((row) => violations(row) > 0);
  const pannedOff = rows.reduce((n, row) => n + (row.pannable ? row.offstage.length : 0), 0);
  if (pannedOff) {
    console.log(
      `\n* ${pannedOff} element(s) sit past the stage edge on worlds whose camera has hit its fit ` +
        `floor (${FIT_FLOOR}×). Those worlds are explicitly pannable, so this is reported, not failed.`,
    );
  }
  if (!dirty.length && !failed.length) {
    console.log(`\n✓ Clean across ${rows.length} scenario/view combination(s).`);
    return;
  }
  if (dirty.length) printFindings(dirty);
  if (failed.length) {
    console.log('\n─── never audited ───');
    for (const f of failed) console.log(`  ${f}`);
  }
  console.log(
    `\n${dirty.length} of ${rows.length} combination(s) flagged` +
      (failed.length ? `, ${failed.length} never audited` : '') +
      '.',
  );
  process.exitCode = 1;
}

// A bad flag or an unreachable dev server is a message, not a stack trace: the first thing anyone
// does with this script is get the port wrong.
main().catch((err: unknown) => {
  console.error(`[world-audit] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
