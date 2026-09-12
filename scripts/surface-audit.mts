// surface-audit.mts — headless sweep of every reader-facing SURFACE across the screen sizes people
// actually use, in both themes, at 1× and zoomed.
//
// `audit:ui` sweeps the block library inside the gallery; that catches a chart whose labels collide,
// and nothing about the room the chart sits in. The defects readers actually report live one level
// up: a reading column squeezed to a porthole by chrome that never shrinks, a panel taller than the
// window with no way to scroll it, a control stranded off the edge, a page that scrolls sideways, a
// column that collapsed until its words stack one glyph per line, two labels printed over each
// other, a button a thumb cannot land on. None of those involve a block at all.
//
// So this drives the real surfaces (scripts/surface-sweep.mjs — one row per route prefix and per
// takeover state, held against src/routeTable.ts by a test) and asks of each: does anything sit
// outside the window or past a clipping ancestor, can everything that overflows be scrolled to, does
// the page scroll sideways, is the reading column a usable share of the screen, is any text below
// the legibility floor or standing on end, do any two runs of text overlap, are the controls
// thumb-sized on a phone, and does one page set its headings, body and buttons in one size each.
//
// Zoom is emulated the way a browser does it: a `--dpr` of 1.25 renders the same 1366×620 window as
// a 1093×496 CSS viewport at a 1.25 device scale factor — a narrower page, sharper pixels — which is
// exactly what ⌘+ does to a layout, and exactly what a 1× sweep never sees.
//
// Every moment is stamped by the PAGE's clock: an in-page frame poll marks when the ready element
// has a box and when the layout has held still, and Node reads the marks back. A Playwright
// selector wait first notices a freshly mounted surface up to ~450ms late on this app, so reading a
// wall clock when the wait returns would charge the surface for the harness.
//
//   pnpm audit:surfaces                                  # starts vite itself, all sizes, both themes
//   pnpm audit:surfaces -- --url http://localhost:5173   # against a running server
//   pnpm audit:surfaces -- --sizes 1366x620,2560x1080 --themes light --dpr 1.25,1.5
//   pnpm audit:surfaces -- --only study,ripple --checks scroll,clip,overlap --shots .audit-out/x
//   pnpm audit:tap                                       # the phone hit-floor check alone
//
// Exits 1 with a printed report if anything is flagged.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';
import { startDevServer } from './dev-server.mts';
import { launchChromium } from './launch-chromium.mts';
import { DEFAULT_SIZES, SURFACES, ZOOM_DPRS, ZOOM_SIZES, type Surface } from './surface-sweep.mjs';

/** Rendered px. Matches the app-wide floor `audit:ui` applies to block type. */
const TYPE_FLOOR = 9;

/** A reading column thinner than this share of the window is a porthole, however tall the page is:
 *  the chrome has taken the screen. Derived from the worst measured case rather than chosen — a
 *  short laptop was giving 27%, and the answer was unreadable at that share. */
const MIN_READING_SHARE = 0.45;

/** The hit floor a thumb lands on reliably (Apple's 44pt, Android's 48dp), and the least room
 *  between two controls to choose between them. Enforced at phone and tablet widths only. */
const TAP_MIN = 44;
const TAP_GAP = 6;
const TAP_MAX_WIDTH = 834;

export const CHECKS = [
  'outside',
  'trapped',
  'tiny',
  'shell',
  'scroll',
  'clip',
  'vertical',
  'overlap',
  'tap',
  'type',
] as const;
export type Check = (typeof CHECKS)[number];

export interface SweepOptions {
  baseUrl: string;
  sizes: string[];
  themes: string[];
  /** Extra device scale factors, applied to the ZOOM_SIZES only. */
  dprs: number[];
  only?: Set<string>;
  checks: Set<Check>;
  labs: boolean;
  /** Screenshot directory, or null for none. */
  shots: string | null;
  /** Name each overlapping element's ancestry in the report — for finding the rule behind it. */
  verbose?: boolean;
  log?: (line: string) => void;
}

export interface Finding {
  surface: string;
  key: string;
  size: string;
  dpr: number;
  theme: string;
  issues: string[];
  /** Page-clock milliseconds: the ready element's first box, and the layout holding still. */
  readyMs: number | null;
  settledMs: number | null;
}

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : fallback;
}
const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);

/** Installed before the page loads: stamps, on the page's own clock, when the ready element first
 *  has a box and when the overflow picture has then held still for six frames past the settle
 *  window. A `minMs` measured from ready covers surfaces that animate themselves in. */
const OBSERVE_SCRIPT = (ready: string, minMs: number): string => `
  window.__sweep = { readyAt: 0, settledAt: 0 };
  (() => {
    let stable = 0, last = '';
    const fingerprint = () => {
      let n = 0;
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) n++;
      }
      return n + ':' + document.documentElement.scrollWidth + ':' + document.documentElement.scrollHeight;
    };
    const poll = () => {
      const s = window.__sweep;
      if (!s.readyAt) {
        const el = document.querySelector(${JSON.stringify(ready)});
        const box = el && el.getBoundingClientRect();
        if (box && box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden') {
          s.readyAt = Math.round(performance.now());
        }
      } else if (performance.now() - s.readyAt >= ${minMs}) {
        const key = fingerprint();
        stable = key === last ? stable + 1 : 0;
        last = key;
        if (stable >= 6) { s.settledAt = Math.round(performance.now()); return; }
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  })();
`;

/** Re-armed after a click changed the state: the same stillness test, from now. */
const RESETTLE_SCRIPT = (minMs: number): string => `
  (() => {
    window.__sweep.settledAt = 0;
    const t0 = performance.now();
    let stable = 0, last = '';
    const fingerprint = () => {
      let n = 0;
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) n++;
      }
      return n + ':' + document.documentElement.scrollWidth + ':' + document.documentElement.scrollHeight;
    };
    const poll = () => {
      if (performance.now() - t0 >= ${minMs}) {
        const key = fingerprint();
        stable = key === last ? stable + 1 : 0;
        last = key;
        if (stable >= 6) { window.__sweep.settledAt = Math.round(performance.now()); return; }
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  })();
`;

async function awaitMark(
  page: Page,
  mark: 'readyAt' | 'settledAt',
  timeoutMs: number,
): Promise<number | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = (await page
      .evaluate(`window.__sweep && window.__sweep.${mark}`)
      .catch(() => 0)) as number;
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Everything measured in the page, in one pass — a second evaluate would race the first's layout.
 *  Passed as a STRING, like the block sweep's own collision script: the bundler rewrites named
 *  functions inside an evaluated callback into calls to a helper that does not exist in the page. */
const MEASURE_SCRIPT = (
  readingSel: string | null,
  typeFloor: number,
  checks: string[],
  tap: boolean,
  verbose = false,
): string => `(() => {
  const CHECK = new Set(${JSON.stringify(checks)});
  const VERBOSE = ${verbose};
  // Where an element sits, for a verbose report: its own name and three ancestors.
  const lineage = (el) => { const out = []; for (let a = el, i = 0; a && i < 4 && a !== document.body; a = a.parentElement, i++) out.push(name(a)); return out.join(' < '); };
  const name = (el) => [el.tagName.toLowerCase(), ...String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').split(/\\s+/).filter(Boolean).slice(0, 2)].join('.');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.scrollingElement;
  const docScrolls = !!doc && doc.scrollHeight > doc.clientHeight + 2;
  const outside = [];
  const tiny = [];
  const trapped = [];
  const clipped = [];
  const vertical = [];
  const typeSizes = { h1: new Set(), p: new Set(), button: new Set() };
  const clipsAt = (el) => {
    const s = getComputedStyle(el);
    return s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible';
  };
  // Behind a takeover. A fixed element covering (nearly) the whole window that sits ABOVE the
  // target in the stack at that point is a scrim — the Lens, a sheet, a modal — and what it covers
  // is neither read nor pressed while it is up, so it is judged as absent rather than flagged.
  // Only a full-window fixed layer counts: an ordinary overlapping sibling is still a collision.
  // The LAYER an element paints in: its nearest out-of-flow ancestor (a fixed or absolute box —
  // a scrim, a sheet, a floating panel, a coach), or the document itself. Two things in different
  // layers are stacked by design, so they are never a collision; a control whose centre is under
  // another layer's paint is not pressable while that layer is up, so it is judged absent rather
  // than flagged. Two things in the SAME layer that overlap are still a collision.
  const layerOf = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const pos = getComputedStyle(a).position;
      if (pos === 'fixed' || pos === 'absolute') return a;
    }
    return document.body;
  };
  const coveredAt = (target, x, y) => {
    if (x < 0 || y < 0 || x > vw || y > vh) return false;
    const mine = layerOf(target);
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === target || el.contains(target) || target.contains(el)) return false;
      if (getComputedStyle(el).pointerEvents === 'none') continue;
      return layerOf(el) !== mine;
    }
    return false;
  };
  // A thumbnail: something scaled DOWN by a transform on an ancestor (a reel preview, a deck
  // sheet in a lab). Its type is small because the picture is small, and the full-size render is
  // what its own gate (audit:reel, slides:gate) judges.
  const thumbnail = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const t = getComputedStyle(a).transform;
      const m = t && t !== 'none' ? /matrix\(([^)]+)\)/.exec(t) : null;
      if (m && Math.abs(Number(m[1].split(',')[0])) < 0.98) return true;
    }
    return false;
  };
  // A declared fade: a mask that runs to transparent hides the overflow on purpose, the way a
  // line clamp does — the reader is shown an edge, not a cut.
  const fades = (style) => /gradient/.test(style.maskImage || '') || /gradient/.test(style.webkitMaskImage || '');
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const leaf = el.children.length === 0;
    const text = leaf ? (el.textContent || '').trim() : '';

    // Outside the window with nothing able to bring it back. A box inside a scroller is reachable
    // by definition, so only the scrollers that actually exist count as a way back — and a drag
    // camera is one of them. A map the reader pans (Synthesis' world is 1488px of graph inside a
    // 340px stage) is deliberately larger than its frame, and it declares that by taking a grab
    // cursor; the world sweep excuses exactly this shape. Judged on what the element DECLARES,
    // never on what it is called, and only for a pannable ancestor — an ordinary clip still fails.
    let scrollable = docScrolls;
    let clipper = null;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (/(auto|scroll)/.test(ps.overflowY + ps.overflowX) &&
          (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) scrollable = true;
      if (ps.cursor === 'grab' || ps.cursor === 'grabbing') scrollable = true;
      if (!clipper && clipsAt(p) && !/(auto|scroll)/.test(ps.overflowY + ps.overflowX)) clipper = p;
    }
    const overRight = box.right - vw, overBottom = box.bottom - vh, overLeft = -box.left, overTop = -box.top;
    if (CHECK.has('outside') && (overRight > 2 || overBottom > 2 || overLeft > 2 || overTop > 2) && leaf && !scrollable) {
      outside.push(name(el) + ' outside by ' + Math.round(Math.max(overRight, overBottom, overLeft, overTop)) + 'px');
    }

    // A text leaf that its nearest overflow:hidden ancestor cuts into, with no scroller between.
    // Reuses the block sweep's rule: clamp the box to the clipper, and what is lost is lost. A line
    // clamp and an ellipsis are truncation by design (they state their own limit) and are excused.
    if (CHECK.has('clip') && leaf && text.length > 1 && clipper && !scrollable) {
      const cr = clipper.getBoundingClientRect();
      const lost = Math.max(0, cr.left - box.left, box.right - cr.right, cr.top - box.top, box.bottom - cr.bottom);
      const truncates = (style.textOverflow === 'ellipsis' && style.overflow !== 'visible') ||
        (style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '');
      const parentTruncates = el.parentElement && ((getComputedStyle(el.parentElement).textOverflow === 'ellipsis') ||
        (getComputedStyle(el.parentElement).webkitLineClamp !== 'none' && getComputedStyle(el.parentElement).webkitLineClamp !== ''));
      if (lost > 4 && !truncates && !parentTruncates && !el.closest('.zoom-scrim, [data-text-disclosure]')) {
        clipped.push(name(el) + ' loses ' + Math.round(lost) + 'px to ' + name(clipper));
      }
    }

    // Type below the floor, judged on what is rendered rather than what was authored. SVG text
    // is in user units: convert through the screen matrix, exactly as audit:ui does.
    if (leaf && text.length > 1) {
      // Judged as it PAINTS: SVG text through its screen matrix, HTML text through whatever
      // transform scales its ancestors (the Study's desk sits at 0.9 on a short laptop, and a
      // 10px label there is a 9px label to the eye). offsetWidth is the layout width, the rect
      // the painted one; their ratio is the scale every ancestor contributed.
      // Rotation-proof: the scale is the root of each transform's determinant, never a ratio of
      // widths (a label turned on its side has a painted width of one line, which read as a 0.15
      // scale and flagged 11px type as 1.5px).
      let scale = 1;
      const ctm = el.ownerSVGElement && el.getScreenCTM ? el.getScreenCTM() : null;
      if (ctm) { const det = Math.abs(ctm.a * ctm.d - ctm.b * ctm.c); if (det > 0) scale = Math.sqrt(det); }
      else {
        const fo = el.closest('foreignObject');
        const host = fo ? fo.ownerSVGElement : null;
        const foCtm = host && host.getScreenCTM ? host.getScreenCTM() : null;
        if (foCtm) { const det = Math.abs(foCtm.a * foCtm.d - foCtm.b * foCtm.c); if (det > 0) scale = Math.sqrt(det); }
        for (let a = el; a && a !== document.body && a !== host; a = a.parentElement) {
          const t = getComputedStyle(a).transform;
          const m = t && t !== 'none' ? /matrix(3d)?\(([^)]+)\)/.exec(t) : null;
          if (!m) continue;
          const v = m[2].split(',').map(Number);
          const [ma, mb, mc, md] = m[1] ? [v[0], v[1], v[4], v[5]] : v;
          const det = Math.abs(ma * md - mb * mc);
          if (det > 0) scale *= Math.sqrt(det);
        }
      }
      const size = parseFloat(style.fontSize) * scale;
      // A tenth of a pixel under the floor is layout rounding on type designed to land exactly on
      // it (the desk's floor is derived to paint its smallest label at 9.0px), not a finding.
      if (CHECK.has('tiny') && size && size < ${typeFloor} - 0.1 && !thumbnail(el)) tiny.push(name(el) + ' ' + size.toFixed(1) + 'px');

      // Text standing on end: a box far taller than its own line while a few glyphs wide is a
      // column that collapsed until every word broke into a stack — the shape of a fixed width
      // meeting a narrow window. Exempt: a ROTATED SVG axis label (its rotation is the design,
      // and its axis-aligned box is tall by construction) — that specific case, never <svg> or
      // vertical writing modes as a category.
      if (CHECK.has('vertical') && box.width < 40 && text.length >= 4) {
        const lh = parseFloat(style.lineHeight) || size * 1.3;
        let rotated = false;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const tr = a.getAttribute && a.getAttribute('transform');
          if (tr && /rotate\\s*\\(/.test(tr)) { rotated = true; break; }
        }
        const isAxisLabel = rotated && !!el.ownerSVGElement;
        // Count the LINES the text actually breaks into — a 44px-tall pill holding one short
        // line is not a stack of glyphs, it is a tap target with room around its label.
        let lineTops = new Set();
        if (box.height > 3 * lh && !isAxisLabel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          for (const lr of Array.from(range.getClientRects())) if (lr.width > 0) lineTops.add(Math.round(lr.top));
          range.detach();
        }
        if (box.height > 3 * lh && !isAxisLabel && lineTops.size >= 3) {
          vertical.push(name(el) + ' "' + text.slice(0, 18) + '" ' + Math.round(box.width) + '×' + Math.round(box.height));
        }
      }
    }

    if (CHECK.has('type')) {
      const tag = el.tagName.toLowerCase();
      // font-size: 0 is the icon-only-button idiom (the label is for assistive tech), not a size.
      const fs = Math.round(parseFloat(style.fontSize) * 2) / 2;
      if ((tag === 'h1' || tag === 'button') && fs > 0 && (el.textContent || '').trim()) typeSizes[tag].add(fs);
      if (tag === 'p' && leaf && fs > 0 && text.length > 40) typeSizes.p.add(fs);
    }

    // Content taller than its box, in a box that refuses to scroll: unreachable by any gesture.
    // Two clips are the design rather than a defect, and both are excused on what the element
    // declares, not on what it is called. A drag camera is undone by dragging — the same case the
    // world sweep already excuses. A thumbnail is a snapshot scaled into a frame; showing all of it
    // would make it not a thumbnail.
    if (CHECK.has('trapped')) {
      const hidden = el.scrollHeight - el.clientHeight;
      const dragCamera = style.cursor === 'grab' || style.cursor === 'grabbing';
      const lineClamped = style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '';
      const scaledSnapshot = Array.from(el.children).some((c) => {
        const t = getComputedStyle(c).transform;
        return t !== 'none' && t.startsWith('matrix(0');
      });
      // The Study camera deliberately clips only scenery outside its frame. Prove its four reading
      // surfaces are wholly in-frame before treating that overflow as intentional; if any one
      // escapes, this exception stands down and the audit reports it like every other trapped box.
      const studyEssentialsInFrame = el.matches('.study-stage:not([data-compact])') &&
        ['.study-card.is-front', '.study-note-wrap', '.study-takeaway', '.study-beats'].every((selector) => {
          const child = el.querySelector(selector);
          if (!child) return false;
          const cr = child.getBoundingClientRect();
          return cr.top >= box.top - 2 && cr.bottom <= box.bottom + 2 && cr.left >= box.left - 2 && cr.right <= box.right + 2;
        });
      if (hidden > 4 && /hidden|clip/.test(style.overflowY) && el.clientHeight > 40 && !dragCamera && !scaledSnapshot && !lineClamped && !fades(style) && !thumbnail(el) && !studyEssentialsInFrame) {
        trapped.push(name(el) + ' hides ' + Math.round(hidden) + 'px with overflow-y:' + style.overflowY);
      }
    }
  }

  // Fixed shell bands are independent siblings. If their rectangles intersect, z-index merely
  // decides which control/text becomes unusable. Nested dock rows are normal flow inside one
  // reserved band and are deliberately not part of this comparison.
  const shellOverlaps = [];
  if (CHECK.has('shell')) {
    const fixedSelectors = ['.topbar', '.side-rail:not(.chat-open)', '.live-dock', '.demox-banner', '.demox-panel', '.demox-note'];
    const fixed = fixedSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
      });
    for (let i = 0; i < fixed.length; i += 1) for (let j = i + 1; j < fixed.length; j += 1) {
      const a = fixed[i], b = fixed[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const area = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left)) *
        Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
      if (area > 16) shellOverlaps.push(name(a) + ' overlaps ' + name(b) + ' by ' + Math.round(area) + 'px²');
    }
  }

  // Two runs of text printed over each other — the block sweep's collision rule, applied to the
  // whole page: line-by-line glyph boxes, clamped to every clipper, judged against the smaller run.
  const overlaps = [];
  if (CHECK.has('overlap')) {
    const runs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').trim();
      if (t.length < 2) continue;
      const el = n.parentElement;
      if (!el || el.closest('title, desc, defs, clipPath, mask, pattern, script, style, [aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.15) continue;
      // Deliberately stacked things (badges over art, tooltips, the fixed chrome) are positioned
      // out of flow; a collision there is the design, not a bug.
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      let rotated = false, hiddenFace = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const tr = a.getAttribute && a.getAttribute('transform');
        if (tr && /rotate\\s*\\(/.test(tr)) { rotated = true; break; }
        const acs = getComputedStyle(a);
        const mm = acs.transform && acs.transform !== 'none' ? /matrix\\(([^)]+)\\)/.exec(acs.transform) : null;
        if (mm) { const p = mm[1].split(',').map(Number); if (Math.abs(p[1]) > 0.02 || Math.abs(p[2]) > 0.02) { rotated = true; break; } }
        if (acs.backfaceVisibility === 'hidden') { hiddenFace = true; break; }
      }
      if (rotated || hiddenFace) continue;
      const paint = el.tagName.toLowerCase() === 'text' ? cs.fill : cs.color;
      const alpha = /rgba\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*([\\d.]+)\\s*\\)/.exec(paint) || /rgba?\\([^)]*\\/\\s*([\\d.]+)\\s*\\)/.exec(paint);
      if (alpha && parseFloat(alpha[1]) < 0.4) continue;
      let scale = 1;
      const ctm = el.ownerSVGElement && el.getScreenCTM ? el.getScreenCTM() : null;
      if (ctm) { const det = Math.abs(ctm.a * ctm.d - ctm.b * ctm.c); if (det > 0) scale = Math.sqrt(det); }
      const size = parseFloat(cs.fontSize) * scale;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const box of Array.from(range.getClientRects())) {
        const ink = Math.min(box.height, Math.max(size, 8) * 1.05);
        const inset = (box.height - ink) / 2;
        let vis = { left: box.left, right: box.right, top: box.top + inset, bottom: box.bottom - inset, width: box.width, height: ink };
        if (vis.width < 4 || vis.height < 4) continue;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          if (!clipsAt(a)) continue;
          const ar = a.getBoundingClientRect();
          const left = Math.max(vis.left, ar.left), right = Math.min(vis.right, ar.right);
          const top = Math.max(vis.top, ar.top), bottom = Math.min(vis.bottom, ar.bottom);
          vis = { left, right, top, bottom, width: right - left, height: bottom - top };
          if (vis.width <= 0 || vis.height <= 0) break;
        }
        // Off-screen ink cannot collide with anything the reader sees, and neither can ink under
        // a takeover's scrim.
        if (vis.width < 4 || vis.height < 4 || vis.bottom < 0 || vis.top > vh || vis.right < 0 || vis.left > vw) continue;
        if (coveredAt(el, (vis.left + vis.right) / 2, (vis.top + vis.bottom) / 2)) continue;
        runs.push({ el, r: vis, t, layer: layerOf(el) });
      }
      range.detach();
      if (runs.length > 2500) break;
    }
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i], b = runs[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.t === b.t || a.layer !== b.layer) continue;
      const lockA = a.el.closest('[data-tight-lockup]');
      if (lockA !== null && lockA === b.el.closest('[data-tight-lockup]')) continue;
      if (a.el.closest('.maplibregl-marker') && b.el.closest('.maplibregl-marker')) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox <= 4 || oy <= 6) continue;
      const hit = ox * oy;
      if (hit > 200 && hit > Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.35) {
        overlaps.push('"' + a.t.slice(0, 24) + '" ↔ "' + b.t.slice(0, 24) + '" (' + Math.round(hit) + 'px²)' +
          (VERBOSE ? ' [' + lineage(a.el) + ' ↔ ' + lineage(b.el) + ']' : ''));
      }
    }
  }

  // Can a thumb land on it? Not the control's own box — a 32px glyph with a projected 44px hit area
  // is fine — but a hit test: if the press lands 22px from the centre, does it still reach this
  // control? Then: is there room to choose between two neighbours.
  const small = [];
  const crowded = [];
  if (${tap} && CHECK.has('tap')) {
    const boxes = [];
    const sel = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const R = ${TAP_MIN} / 2;
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      if (parseFloat(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
      let locallyClipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) { locallyClipped = true; break; }
      }
      if (locallyClipped) continue;
      if (coveredAt(el, r.left + r.width / 2, r.top + r.height / 2)) continue;
      // A node on a pannable, zoomable map is reached by zooming — the map's own gate (audit:world,
      // the Synthesis lens) judges it; the map's chrome around it is still held to the floor.
      let inCamera = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const c = getComputedStyle(a).cursor;
        if (c === 'grab' || c === 'grabbing') { inCamera = true; break; }
      }
      if (inCamera) continue;
      const label = ((el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || '').slice(0, 30) + ' [' + name(el) + ']');
      const inProse = !!el.closest('p, .insight-summary, li');
      if (inProse && el.tagName === 'A' && !el.getAttribute('role')) continue;
      boxes.push({ label, r });
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const probes = [[cx - R + 1, cy], [cx + R - 1, cy], [cx, cy - R + 1], [cx, cy + R - 1]];
      let reachable = 0;
      const blockers = [];
      for (const p of probes) {
        if (p[0] < 0 || p[1] < 0 || p[0] > vw || p[1] > vh) { reachable++; continue; }
        const hit = document.elementsFromPoint(p[0], p[1]).find((c) => getComputedStyle(c).pointerEvents !== 'none');
        if (hit && (hit === el || el.contains(hit) || hit.contains(el))) reachable++;
        else blockers.push(hit ? name(hit) : 'nothing');
      }
      // Verbose says WHY: which neighbour took the press, and what made this element a target at
      // all — a box that is 44px tall and still fails is covered, not small.
      if (reachable < 4) small.push(Math.round(r.width) + '×' + Math.round(r.height) + ' ' + label +
        (VERBOSE ? ' [' + lineage(el) + '; role=' + (el.getAttribute('role') || '-') + ' tabindex=' + (el.getAttribute('tabindex') || '-') + '; pressed: ' + blockers.join(', ') + ']' : ''));
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      if (dx === 0 && dy === 0) continue;
      const gap = Math.max(dx, dy);
      if ((dx === 0 || dy === 0) && gap > 0 && gap < ${TAP_GAP}) crowded.push(Math.round(gap) + 'px "' + boxes[i].label + '" ↔ "' + boxes[j].label + '"');
    }
  }

  const readingEl = ${readingSel ? `document.querySelector(${JSON.stringify(readingSel)})` : 'null'};
  const uniq = (xs, n) => Array.from(new Set(xs)).slice(0, n);
  return {
    outside: uniq(outside, 8),
    tiny: uniq(tiny, 8),
    trapped: uniq(trapped, 8),
    clipped: uniq(clipped, 8),
    vertical: uniq(vertical, 8),
    shellOverlaps: uniq(shellOverlaps, 8),
    overlaps: uniq(overlaps, 8),
    small: uniq(small, 12),
    crowded: uniq(crowded, 8),
    typeSizes: { h1: [...typeSizes.h1], p: [...typeSizes.p], button: [...typeSizes.button] },
    readingH: readingEl ? Math.round(readingEl.clientHeight) : null,
    viewportH: vh,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
  };
})()`;

interface Measured {
  outside: string[];
  tiny: string[];
  trapped: string[];
  clipped: string[];
  vertical: string[];
  shellOverlaps: string[];
  overlaps: string[];
  small: string[];
  crowded: string[];
  typeSizes: { h1: number[]; p: number[]; button: number[] };
  readingH: number | null;
  viewportH: number;
  scrollWidth: number;
  innerWidth: number;
}

/** The sweep proper. Every combination is measured in a fresh context so nothing leaks between
 *  sizes, and each returns a Finding even when clean, so the caller can print a full matrix. */
export async function sweepSurfaces(opts: SweepOptions): Promise<Finding[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const surfaces = SURFACES.filter(
    (s) => (!opts.only || opts.only.has(s.key)) && (opts.labs || !s.lab),
  );
  const runs: { size: string; dpr: number }[] = [];
  for (const size of opts.sizes) {
    runs.push({ size, dpr: 1 });
    if (ZOOM_SIZES.includes(size)) for (const dpr of opts.dprs) runs.push({ size, dpr });
  }
  if (opts.shots) mkdirSync(opts.shots, { recursive: true });

  const findings: Finding[] = [];
  const browser = await launchChromium({ headless: true });
  try {
    for (const surface of surfaces) {
      for (const { size, dpr } of runs) {
        const [w, h] = size.split('x').map(Number);
        // Zoom: the same window, a narrower CSS viewport, sharper pixels.
        const width = Math.round(w / dpr);
        const height = Math.round(h / dpr);
        const tap = width <= TAP_MAX_WIDTH;
        for (const theme of opts.themes) {
          const ctx = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: dpr,
            // A phone-shaped window is a phone: touch, and the mobile hit-testing that goes with it.
            hasTouch: tap,
            isMobile: width <= 414,
            // Settled, not mid-animation: a reveal caught halfway reads as a layout bug.
            reducedMotion: 'reduce',
          });
          const page = await ctx.newPage();
          await page.addInitScript(
            ({ initialTheme, legalKey, legalVersion }) => {
              try {
                localStorage.setItem('mavea-theme', initialTheme);
                localStorage.setItem(
                  legalKey,
                  JSON.stringify({ version: legalVersion, acceptedAt: '2026-08-12T00:00:00.000Z' }),
                );
              } catch {
                // A sandboxed preview frame: no storage, and nothing here to seed.
              }
            },
            {
              initialTheme: theme,
              legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY,
              legalVersion: LEGAL_ACCEPTANCE_VERSION,
            },
          );
          await page.addInitScript(OBSERVE_SCRIPT(surface.ready, surface.settleMs ?? 1200));
          const issues: string[] = [];
          let readyMs: number | null = null;
          let settledMs: number | null = null;
          try {
            await page.goto(`${opts.baseUrl}/${surface.hash}`, { waitUntil: 'load' });
            readyMs = await awaitMark(page, 'readyAt', 45_000);
            if (readyMs === null) throw new Error(`${surface.ready} never had a box`);
            for (const label of surface.click ?? []) {
              const button = page
                .getByRole('button', { name: new RegExp(`^${label}`, 'i') })
                .first();
              // A row that starts a curated replay and then reaches for a control ON the answer is
              // pressing as the choreography does, not as a visitor: a running script holds the
              // surface `inert` (useScriptedLock), so hit-testing falls through and Playwright's
              // actionability check can never pass. Wait for the control to actually be on screen,
              // then dispatch — `inert` stops the visitor's input, not the script's.
              await button.waitFor({ state: 'visible', timeout: 25_000 });
              await button.dispatchEvent('click');
              await page.evaluate(RESETTLE_SCRIPT(surface.settleMs ?? 1200));
            }
            settledMs = await awaitMark(page, 'settledAt', 60_000);
            if (settledMs === null) issues.push('layout never held still for six frames');

            // A lab is a developer harness reached only in dev builds, never by a reader on a
            // phone. It is held to the checks that judge the PAGE — does the harness itself
            // scroll sideways, clip, run off the window, print text over text — and not to the
            // reader promises (the thumb floor, the legibility floor) its chrome was never
            // designed against, nor to the trapped-overflow rule inside its frames: a reel board
            // and a print page are fixed frames that clip by design, and each has its own gate
            // (audit:reel, export:gate, slides:gate) that judges their fit with the knowledge of
            // aspect, palette and text length this sweep does not have.
            const checks = surface.lab
              ? [...opts.checks].filter((c) => c !== 'tap' && c !== 'tiny' && c !== 'trapped')
              : [...opts.checks];
            const m = (await page.evaluate(
              MEASURE_SCRIPT(surface.reading ?? null, TYPE_FLOOR, checks, tap, !!opts.verbose),
            )) as Measured;
            for (const o of m.outside) issues.push(`unreachable: ${o}`);
            for (const t of m.trapped) issues.push(`trapped: ${t}`);
            for (const c of m.clipped) issues.push(`clipped: ${c}`);
            for (const t of m.tiny) issues.push(`below ${TYPE_FLOOR}px: ${t}`);
            for (const v of m.vertical) issues.push(`vertical text: ${v}`);
            for (const o of m.shellOverlaps) issues.push(`shell collision: ${o}`);
            for (const o of m.overlaps) issues.push(`overlap: ${o}`);
            for (const s of m.small) issues.push(`under ${TAP_MIN}px: ${s}`);
            for (const c of m.crowded) issues.push(`packed under ${TAP_GAP}px: ${c}`);
            if (opts.checks.has('scroll') && m.scrollWidth > m.innerWidth + 1) {
              issues.push(
                `page scrolls horizontally (${m.scrollWidth}px in a ${m.innerWidth}px window)`,
              );
            }
            if (opts.checks.has('type')) {
              // One page, one heading size — a second h1 size is a page that could not decide.
              // Buttons and running text are allowed a small family (a primary action, a mini
              // control, a dock button; body, a caption, a pull-quote — the Study sets its notes
              // in a hand and its takeaway large on purpose), but a sixth size is a control or a
              // paragraph that missed the ramp, which is what this is here to catch.
              if (m.typeSizes.h1.length > 1)
                issues.push(
                  `h1 set in ${m.typeSizes.h1.length} sizes: ${m.typeSizes.h1.join('/')}px`,
                );
              if (m.typeSizes.button.length > 5)
                issues.push(
                  `buttons set in ${m.typeSizes.button.length} sizes: ${m.typeSizes.button.join('/')}px`,
                );
              if (m.typeSizes.p.length > 5)
                issues.push(
                  `body text set in ${m.typeSizes.p.length} sizes: ${m.typeSizes.p.join('/')}px`,
                );
            }
            if (m.readingH !== null) {
              const share = m.readingH / m.viewportH;
              if (share < MIN_READING_SHARE) {
                issues.push(
                  `reading column ${m.readingH}px of ${m.viewportH}px (${Math.round(share * 100)}%, floor ${Math.round(MIN_READING_SHARE * 100)}%)`,
                );
              }
            }
            if (opts.shots) {
              await page.screenshot({
                path: join(opts.shots, `${surface.key}-${size}@${dpr}-${theme}.png`),
                fullPage: false,
              });
            }
          } catch (err) {
            issues.push(
              `did not reach a measurable state: ${(err as Error).message.split('\n')[0]}`,
            );
          }
          findings.push({
            surface: surface.label,
            key: surface.key,
            size,
            dpr,
            theme,
            issues,
            readyMs,
            settledMs,
          });
          const zoom = dpr === 1 ? '' : `@${dpr}`;
          log(
            `${surface.label.padEnd(20)} ${(size + zoom).padStart(14)} ${theme.padEnd(5)} ` +
              `ready ${String(readyMs ?? '-').padStart(5)}ms settled ${String(settledMs ?? '-').padStart(5)}ms — ` +
              (issues.length ? `${issues.length} issue(s)` : '✓'),
          );
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return findings;
}

/** Print the findings and return whether everything was clean. */
export function reportFindings(findings: Finding[]): boolean {
  const dirty = findings.filter((f) => f.issues.length);
  if (!dirty.length) {
    console.log(`\n✓ ${findings.length} surface/size/zoom/theme combinations are clean.`);
    return true;
  }
  console.log('\n─── Surface findings ───');
  for (const f of dirty) {
    console.log(`\n${f.surface} @ ${f.size}${f.dpr === 1 ? '' : `@${f.dpr}`} ${f.theme}`);
    for (const issue of f.issues) console.log(`  ${issue}`);
  }
  console.log(`\n${dirty.length} of ${findings.length} combinations flagged.`);
  return false;
}

export function parseChecks(raw: string): Set<Check> {
  const wanted = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!wanted.length || wanted.includes('all')) return new Set(CHECKS);
  for (const c of wanted) {
    if (!(CHECKS as readonly string[]).includes(c)) {
      throw new Error(`Unknown check "${c}". Use ${CHECKS.join(', ')} or all.`);
    }
  }
  return new Set(wanted as Check[]);
}

async function main(): Promise<void> {
  const explicitUrl = readFlag('url', '');
  const server = explicitUrl ? null : await startDevServer(Number(readFlag('port', '5178')));
  const baseUrl = (explicitUrl || server!.url).replace(/\/$/, '');
  const only = readFlag('only', '').trim();
  try {
    const findings = await sweepSurfaces({
      baseUrl,
      sizes: readFlag('sizes', DEFAULT_SIZES.join(','))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      themes: readFlag('themes', 'light,dark')
        .split(',')
        .map((t) => t.trim()),
      dprs: readFlag('dpr', ZOOM_DPRS.join(','))
        .split(',')
        .map(Number)
        .filter((d) => d > 1),
      only: only ? new Set(only.split(',').map((s) => s.trim())) : undefined,
      checks: parseChecks(readFlag('checks', 'all')),
      labs: hasFlag('labs'),
      shots: hasFlag('no-shots') ? null : readFlag('shots', '.audit-out/surfaces'),
      verbose: hasFlag('verbose'),
    });
    if (!reportFindings(findings)) process.exitCode = 1;
  } finally {
    server?.stop();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();

export type { Surface };
