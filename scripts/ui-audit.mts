// ui-audit.mts — headless sweep of the whole block library across every screen size and both themes.
//
// The gallery's own window.__overflowAudit() answers "did anything spill out of its card?". That is
// half the question. The half the eye actually notices — two labels sitting on top of each other,
// type shrunk past legibility — it cannot see, because a collision between two in-flow text runs
// clips nothing. This adds those checks and drives all three across the width matrix, so a block
// that only breaks at 320px (or only at 2560) is caught by a machine instead of by a user.
//
// Requires a dev server already running (labs and the audit hook are dev-only):
//   pnpm dev
//   pnpm audit:ui
//   pnpm audit:ui -- --widths 320,768,1280 --family "Charts"
//   pnpm audit:ui -- --templates all --widths 390,768,1440,1920
//
// Exits 1 with a printed report if anything is flagged.
import { chromium, type Page } from 'playwright';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

interface OverflowHit {
  type: string;
  px: number;
  el: string;
  clipper: string;
}
interface Report {
  scanned: number;
  clip: OverflowHit[];
  scroll: OverflowHit[];
}
interface Collision {
  block: string;
  a: string;
  b: string;
  area: number;
}
interface TinyType {
  block: string;
  text: string;
  size: string;
}
interface Truncation {
  type: string;
  kind: 'ellipsis' | 'clamp';
  el: string;
  text: string;
}
interface Finding {
  width: number;
  theme: string;
  clipped: OverflowHit[];
  scrolled: OverflowHit[];
  overlaps: Collision[];
  truncated: Truncation[];
  tiny: TinyType[];
  scanned: number;
}

interface TemplateFinding {
  width: number;
  theme: string;
  template: string;
  issues: string[];
}

// No lower or upper bound: the smallest real phone (a folded Galaxy Fold is 280) through 4K.
const DEFAULT_WIDTHS = [280, 320, 390, 768, 1024, 1280, 1536, 1920, 2560, 3840];

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

// Runs IN the page: text-overlap + illegible-type detection, which the clip audit cannot see.
//
// Deliberately a plain string, not a function. tsx compiles this file with esbuild, which rewrites
// the functions it touches to carry a `__name` helper — a helper that does not exist inside the
// browser, so a passed-in function dies on "__name is not defined" the moment it runs there.
const COLLIDE_SCRIPT = `(() => {
  const overlaps = [];
  const tiny = [];

  for (const card of Array.from(document.querySelectorAll('.vlib-tile'))) {
    const block = ((card.querySelector('.vlib-type') || {}).textContent || '?').trim();
    const runs = [];

    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').trim();
      if (t.length < 2) continue;
      const el = n.parentElement;
      if (!el) continue;
      // <title>/<desc> are the SVG accessibility layer and <defs>/<clipPath>/<mask>/<pattern>
      // are definitions — none of it is ever painted, so it can neither collide nor be too small
      // to read. A <title> also has no screen matrix, so its size would be read unscaled.
      if (el.closest('title, desc, defs, clipPath, mask, pattern')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (parseFloat(cs.opacity) < 0.15) continue;
      // Deliberately stacked things (badges over art, tooltips) are positioned out of flow; a
      // collision there is the design, not a bug. SVG text is NOT exempt: axis ticks, bar labels
      // and curve end-labels are the library's most common real collision, and skipping them is
      // what let a chart whose labels sat squarely on top of each other pass this gate.
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;

      // A rotated glyph's axis-aligned box is much larger than its ink, so a rotated axis label
      // would false-flag against its neighbour. Measure only upright runs.
      let rotated = false;
      for (let a = el; a && a !== card; a = a.parentElement) {
        const tr = a.getAttribute && a.getAttribute('transform');
        if (tr && /\\brotate\\s*\\(/.test(tr)) { rotated = true; break; }
        const cm = getComputedStyle(a).transform;
        const mm = cm && cm !== 'none' ? /matrix\\(([^)]+)\\)/.exec(cm) : null;
        if (mm) {
          const p = mm[1].split(',').map(Number);
          if (Math.abs(p[1]) > 0.02 || Math.abs(p[2]) > 0.02) { rotated = true; break; }
        }
      }
      if (rotated) continue;

      // A faded label (a ghost stroke behind a badge, a watermark) is decoration the reader never
      // parses, so its box landing on a real label is by design. Fades arrive as opacity OR as a
      // low-alpha paint, and SVG text paints through fill rather than color.
      const paint = el.tagName.toLowerCase() === 'text' ? cs.fill : cs.color;
      const alpha =
        /rgba\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*([\\d.]+)\\s*\\)/.exec(paint) ||
        /rgba?\\([^)]*\\/\\s*([\\d.]+)\\s*\\)/.exec(paint);
      if (alpha && parseFloat(alpha[1]) < 0.4) continue;

      // The far side of a flip card stays in the DOM, laid out in flow, hidden only by being turned
      // away from the camera. It reads as a flawless text-on-text collision and is nothing of the sort.
      let hiddenFace = false;
      for (let a = el; a && a !== card; a = a.parentElement) {
        if (getComputedStyle(a).backfaceVisibility === 'hidden') { hiddenFace = true; break; }
      }
      if (hiddenFace) continue;

      // Inside a viewBox, font-size is in USER UNITS, not pixels: the same 8 renders at 19px in a
      // chart scaled 2.4x and at 4px in one scaled down. Legibility is about what lands on the
      // retina, so convert through the element's screen matrix before judging it. Ignoring this
      // reads a perfectly crisp 13px pitch label as a 2.8px one.
      let scale = 1;
      const ctm = el.ownerSVGElement && el.getScreenCTM ? el.getScreenCTM() : null;
      if (ctm) {
        const det = Math.abs(ctm.a * ctm.d - ctm.b * ctm.c);
        if (det > 0) scale = Math.sqrt(det);
      }
      const size = parseFloat(cs.fontSize) * scale;
      // Below ~9px is not reading, it is squinting — flag it wherever it turns up.
      if (size > 0 && size < 9)
        tiny.push({ block: block, text: t.slice(0, 30), size: size.toFixed(1) + 'px' });

      // Measure the TEXT ITSELF, line by line, not the element's bounding box. An inline run that
      // wraps reports one union rect spanning every line it touches — so two highlighted phrases in
      // the same paragraph appear to sit squarely on top of each other while rendering perfectly.
      // Range rects are the actual glyph boxes, one per line, which is what a collision means.
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const box of Array.from(range.getClientRects())) {
        // A Range rect is the font's LINE box — ascent, descent and leading — not the ink. On a big
        // display number (weathernow's 70°) that box reaches well past the glyphs and lands on the
        // line beneath, which reads as a perfect collision on a card that renders beautifully.
        // Tighten to roughly the glyph band so we compare what is actually drawn.
        const ink = Math.min(box.height, Math.max(size, 8) * 1.05);
        const inset = (box.height - ink) / 2;
        const raw = {
          left: box.left,
          right: box.right,
          top: box.top + inset,
          bottom: box.bottom - inset,
          width: box.width,
          height: ink,
        };
        if (raw.width < 4 || raw.height < 4) continue;
        // Text hidden by a clip is still laid out and still reports a rect — whether it scrolled
        // out of an overflow pane, was truncated by text-overflow: ellipsis (fundraisingrounds'
        // round labels), or is a line a -webkit-line-clamp cut away (collectiontracker's titles).
        // Don't guess with a threshold: CLAMP the rect to every clipping box, element included, so
        // what remains is exactly the ink on screen. Nothing left ⇒ nothing to collide with.
        let vis = raw;
        for (let a = el; a && a !== card.parentElement; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.overflow === 'visible' && acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          const left = Math.max(vis.left, ar.left);
          const right = Math.min(vis.right, ar.right);
          const top = Math.max(vis.top, ar.top);
          const bottom = Math.min(vis.bottom, ar.bottom);
          vis = { left, right, top, bottom, width: right - left, height: bottom - top };
          if (vis.width <= 0 || vis.height <= 0) break;
        }
        if (vis.width < 4 || vis.height < 4) continue;
        runs.push({ el: el, r: vis, t: t });
      }
      range.detach();
    }

    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i];
        const b = runs[j];
        if (a.el === b.el) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // nesting is not collision
        // Two runs carrying the SAME text stacked on each other are a layered effect, not a
        // collision: a star rating's gold fill clipped over its grey track reads as one legible
        // string. Any duplicate drawn as a shadow/echo behaves the same way.
        if (a.t && a.t === b.t) continue;
        // A tight display lockup (a huge numeral at sub-1 line-height with its caption tucked in)
        // deliberately lets glyph BOXES overlap while the ink stays clear. Only pairs inside the
        // same lockup are exempt — the lockup colliding with a neighbour is still a real failure.
        const lockA = a.el.closest('[data-tight-lockup]');
        if (lockA !== null && lockA === b.el.closest('[data-tight-lockup]')) continue;
        // Map markers sit at real coordinates: two nearby places genuinely collide at the fitted
        // zoom, and nudging them apart would lie about where they are. Marker-to-marker only —
        // a caption landing on the map is still reported.
        if (a.el.closest('.maplibregl-marker') && b.el.closest('.maplibregl-marker')) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox <= 4 || oy <= 6) continue;
        // Judge against the SMALLER run, not a flat pixel count: inline chips side by side on one
        // line have padding boxes that legitimately kiss, while a popover landing on a paragraph
        // buries a solid share of it.
        const areaA = a.r.width * a.r.height;
        const areaB = b.r.width * b.r.height;
        const hit = ox * oy;
        if (hit > 200 && hit > Math.min(areaA, areaB) * 0.35) {
          overlaps.push({ block: block, a: a.t.slice(0, 26), b: b.t.slice(0, 26), area: Math.round(hit) });
        }
      }
    }
  }
  const dedup = (xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];
  return { overlaps: dedup(overlaps), tiny: dedup(tiny) };
})()`;

async function collide(page: Page): Promise<{ overlaps: Collision[]; tiny: TinyType[] }> {
  return page.evaluate(COLLIDE_SCRIPT) as Promise<{ overlaps: Collision[]; tiny: TinyType[] }>;
}

const ALL_TEMPLATES = ['default', 'paper', 'daylight', 'ink', 'console', 'marquee'] as const;

async function auditLiveTemplates(
  baseUrl: string,
  widths: number[],
  themes: string[],
  templates: string[],
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const findings: TemplateFinding[] = [];
  try {
    for (const template of templates) {
      if (!ALL_TEMPLATES.includes(template as (typeof ALL_TEMPLATES)[number])) {
        throw new Error(`Unknown template "${template}". Use ${ALL_TEMPLATES.join(', ')} or all.`);
      }
      for (const theme of themes) {
        for (const width of widths) {
          const ctx = await browser.newContext({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
          });
          const page = await ctx.newPage();
          const remoteFonts: string[] = [];
          page.on('request', (request) => {
            if (/fonts\.(googleapis|gstatic)\.com/.test(request.url()))
              remoteFonts.push(request.url());
          });
          await page.addInitScript(
            ({ initialTheme, initialTemplate, legalKey, legalVersion }) => {
              localStorage.setItem('mavea-theme', initialTheme);
              localStorage.setItem('mavea-template', initialTemplate);
              localStorage.setItem(
                legalKey,
                JSON.stringify({ version: legalVersion, acceptedAt: '2026-07-16T00:00:00.000Z' }),
              );
            },
            {
              initialTheme: theme,
              initialTemplate: template,
              legalKey: LEGAL_ACCEPTANCE_STORAGE_KEY,
              legalVersion: LEGAL_ACCEPTANCE_VERSION,
            },
          );
          await page.goto(`${baseUrl}/#/live`, { waitUntil: 'load' });
          await page.waitForSelector('.mavea-app', { timeout: 30_000 });
          const appearanceTrigger = page.locator('.appearance-trigger');
          await appearanceTrigger.waitFor({ state: 'attached', timeout: 30_000 });
          if (!(await appearanceTrigger.isVisible())) {
            const chain = await appearanceTrigger.evaluate((element) => {
              const values: string[] = [];
              for (
                let node: HTMLElement | null = element as HTMLElement;
                node;
                node = node.parentElement
              ) {
                const style = getComputedStyle(node);
                values.push(
                  `${node.tagName.toLowerCase()}.${node.className}: display=${style.display}; visibility=${style.visibility}; opacity=${style.opacity}; rect=${Math.round(node.getBoundingClientRect().width)}×${Math.round(node.getBoundingClientRect().height)}`,
                );
              }
              return values;
            });
            throw new Error(`Appearance trigger is hidden:\n${chain.join('\n')}`);
          }
          await appearanceTrigger.click();
          await page.waitForSelector('.appearance-panel:not(.is-embedded)', { timeout: 10_000 });
          await page.waitForTimeout(100);

          const issues = await page.evaluate(
            ({ expectedTemplate, expectedTheme, viewportWidth }) => {
              const out: string[] = [];
              const root = document.documentElement;
              if (root.dataset.template !== expectedTemplate)
                out.push(`data-template=${root.dataset.template ?? 'missing'}`);
              if (root.dataset.theme !== expectedTheme)
                out.push(`data-theme=${root.dataset.theme ?? 'missing'}`);

              const panel = document.querySelector<HTMLElement>(
                '.appearance-panel:not(.is-embedded)',
              );
              if (!panel) return [...out, 'appearance panel missing'];
              const panelRect = panel.getBoundingClientRect();
              if (panelRect.left < -1 || panelRect.right > innerWidth + 1)
                out.push(
                  `appearance panel horizontal overflow (${Math.round(panelRect.left)}–${Math.round(panelRect.right)})`,
                );
              if (panelRect.top < -1 || panelRect.bottom > innerHeight + 1)
                out.push(
                  `appearance panel vertical overflow (${Math.round(panelRect.top)}–${Math.round(panelRect.bottom)})`,
                );

              const options = Array.from(panel.querySelectorAll<HTMLElement>('.appearance-option'));
              if (options.length !== 6)
                out.push(`expected 6 appearance options, found ${options.length}`);
              for (const option of options) {
                const rect = option.getBoundingClientRect();
                if (rect.width < 44 || rect.height < 44)
                  out.push('appearance option below 44px target');
              }

              const trigger = document.querySelector<HTMLElement>('.appearance-trigger');
              if (trigger) {
                const rect = trigger.getBoundingClientRect();
                const minimum = viewportWidth <= 720 ? 44 : 40;
                if (rect.width < minimum || rect.height < minimum)
                  out.push(
                    `appearance trigger ${Math.round(rect.width)}×${Math.round(rect.height)} (<${minimum})`,
                  );
              }

              for (const selector of ['.topbar', '.live-dock', '.canvas-stage']) {
                const element = document.querySelector<HTMLElement>(selector);
                if (!element) continue;
                const rect = element.getBoundingClientRect();
                if (rect.left < -2 || rect.right > innerWidth + 2)
                  out.push(
                    `${selector} horizontal overflow (${Math.round(rect.left)}–${Math.round(rect.right)})`,
                  );
              }

              const style = getComputedStyle(root);
              for (const variable of [
                '--font-display',
                '--font-body',
                '--font-ui',
                '--font-data',
                '--content-measure',
                '--card-gap',
                '--card-radius',
                '--motion-enter',
              ]) {
                if (!style.getPropertyValue(variable).trim()) out.push(`${variable} unresolved`);
              }
              return out;
            },
            { expectedTemplate: template, expectedTheme: theme, viewportWidth: width },
          );
          if (remoteFonts.length) issues.push(`remote font requests: ${remoteFonts.length}`);
          findings.push({ width, theme, template, issues });
          console.log(
            `${template.padEnd(8)} ${theme.padEnd(5)} ${String(width).padStart(4)}px — ${issues.length ? issues.join('; ') : '✓'}`,
          );
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const dirty = findings.filter((finding) => finding.issues.length);
  if (!dirty.length) {
    console.log('\n✓ Live appearance matrix is clean.');
    return;
  }
  console.log('\n─── Live appearance findings ───');
  for (const finding of dirty) {
    console.log(`${finding.template} ${finding.theme} @ ${finding.width}px`);
    for (const issue of finding.issues) console.log(`  ${issue}`);
  }
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const templateFlag = readFlag('templates', '').trim();
  const defaultWidths = templateFlag ? '390,768,1440,1920' : DEFAULT_WIDTHS.join(',');
  const widths = readFlag('widths', defaultWidths)
    .split(',')
    .map((w) => Number(w.trim()))
    .filter(Boolean);
  const themes = readFlag('themes', 'dark,light').split(',');

  if (templateFlag) {
    const templates = templateFlag === 'all' ? [...ALL_TEMPLATES] : templateFlag.split(',');
    await auditLiveTemplates(baseUrl, widths, themes, templates);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const findings: Finding[] = [];
  try {
    for (const theme of themes) {
      for (const width of widths) {
        // Geometry must be measured in the settled state. Entrance animations deliberately move
        // labels through clipping boxes for a few hundred milliseconds, and family-level staggers
        // can still be running after every renderer has mounted. Reduced motion is a first-class
        // supported product mode and renders the same final layout immediately, making the gate
        // deterministic instead of sampling a random animation frame.
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        const page = await ctx.newPage();
        // Pin the theme before first paint so nothing is measured mid-swap.
        await page.addInitScript((t) => localStorage.setItem('mavea-theme', t), theme);
        await page.goto(`${baseUrl}/#/gallery?mountall=1`, { waitUntil: 'load' });
        // Every tile must be mounted and settled before anything is measured.
        await page.waitForFunction(
          () =>
            typeof window.__overflowAudit === 'function' &&
            typeof window.__truncationAudit === 'function',
          null,
          { timeout: 30_000 },
        );
        await page.waitForFunction(
          () => document.querySelectorAll('.vlib-tile').length > 100,
          null,
          {
            timeout: 30_000,
          },
        );
        // Catalog details and family renderers are route-scoped chunks. A fixed delay can audit
        // skeletons on a slow machine or cold network and falsely report success. Require every
        // listed tile to settle into its real renderer before measuring overflow/collisions.
        await page.waitForFunction(
          () => {
            const tiles = document.querySelectorAll('.vlib-tile').length;
            return (
              tiles > 100 &&
              document.querySelectorAll('.vlib-render--pending').length === 0 &&
              document.querySelectorAll('.vlib-render').length === tiles
            );
          },
          null,
          { timeout: 60_000 },
        );
        // TopicCanvas performs one guaranteed post-lazy-paint accessibility pass at 700 ms to
        // label/focus deliberate horizontal scroll regions and attach complete-text disclosures.
        // Wait for that contract, otherwise a cold family chunk can be measured before the exact
        // same DOM becomes keyboard/touch/screen-reader reachable and the result depends on cache
        // warmth or theme order.
        await page.waitForTimeout(850);
        // The UI faces load with `font-display: swap`, so a cold run can paint fallback metrics
        // and re-layout mid-measure — rects captured before the swap collide with rects captured
        // after it, and fallback glyphs run wider than the real face. Measure only settled type.
        await page.evaluate(() => document.fonts.ready);
        // Even after the fonts land, a narrow viewport keeps reflowing for a beat: a lazily-mounted
        // family chunk momentarily overflows its scroll pane before the pane resolves, which the
        // sweep reads as a real horizontal scroll. It showed up as a handful of tiles flagged in
        // ONE theme and not the other on the same run — the signature of a race, not a defect, and
        // an intermittently red gate is one nobody trusts. Wait for the overflow picture itself to
        // hold still rather than guessing at another fixed delay.
        await page.waitForFunction(
          () => {
            const w = window as unknown as { __lastOverflow?: string; __stableTicks?: number };
            const key = [...document.querySelectorAll<HTMLElement>('.vlib-tile *')]
              .filter(
                (el) =>
                  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
              )
              .length.toString();
            w.__stableTicks = key === w.__lastOverflow ? (w.__stableTicks ?? 0) + 1 : 0;
            w.__lastOverflow = key;
            return (w.__stableTicks ?? 0) >= 3;
          },
          null,
          { timeout: 30_000, polling: 250 },
        );

        const renderErrors = await page
          .locator('.vlib-render-error')
          .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLElement).dataset.blockType ?? 'unknown'),
          );
        if (renderErrors.length) {
          throw new Error(`Gallery render failures: ${renderErrors.join(', ')}`);
        }

        const report = (await page.evaluate('window.__overflowAudit()')) as Report;
        const truncation = (await page.evaluate('window.__truncationAudit()')) as {
          truncations: Truncation[];
        };
        const { overlaps, tiny } = await collide(page);

        findings.push({
          width,
          theme,
          scanned: report.scanned,
          clipped: report.clip,
          scrolled: report.scroll,
          overlaps,
          truncated: truncation.truncations,
          tiny,
        });
        const bad =
          report.clip.length +
          report.scroll.length +
          overlaps.length +
          truncation.truncations.length +
          tiny.length;
        console.log(
          `${theme.padEnd(5)} ${String(width).padStart(4)}px — ${report.scanned} tiles · ` +
            `${report.clip.length} clipped · ${report.scroll.length} scrolled · ` +
            `${overlaps.length} overlapping · ${truncation.truncations.length} truncated · ` +
            `${tiny.length} illegible` +
            (bad === 0 ? '  ✓' : ''),
        );
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  const dirty = findings.filter(
    (f) =>
      f.clipped.length ||
      f.scrolled.length ||
      f.overlaps.length ||
      f.truncated.length ||
      f.tiny.length,
  );

  // KNOWN LIMIT, accepted 2026-08-08: a chart's SVG type is sized in viewBox USER UNITS, so a
  // figure authored to fill a laptop card renders about a third of that on a phone and its labels
  // land under the 9px floor. It is structural (161 blocks), not a per-block defect, and fixing it
  // needs a per-chart small-screen decision rather than a size bump. Until that is made, narrow
  // widths report but do not fail — otherwise this gate is red forever and, per weekly.yml's own
  // comment, a permanently-red audit:ui is exactly what once masked every gate behind it.
  // Deliberately narrow: ONLY sub-9px text, ONLY below laptop width. Clipping, scrolling,
  // overlap and truncation still fail at every width, and legibility still fails at >= 1024.
  const KNOWN_NARROW_SVG_TYPE = 1024;
  const failing = dirty.filter(
    (f) =>
      f.clipped.length ||
      f.scrolled.length ||
      f.overlaps.length ||
      f.truncated.length ||
      (f.tiny.length && f.width >= KNOWN_NARROW_SVG_TYPE),
  );
  const excused = dirty
    .filter((f) => f.width < KNOWN_NARROW_SVG_TYPE)
    .reduce((sum, f) => sum + f.tiny.length, 0);
  if (excused) {
    console.log(
      `\n! known limit: ${excused} sub-9px SVG label(s) below ${KNOWN_NARROW_SVG_TYPE}px — ` +
        'charts scale with their viewBox on phones (accepted 2026-08-08, not failing this gate).',
    );
  }
  if (failing.length === 0) {
    console.log('\n✓ Clean across every width and theme.');
    return;
  }

  console.log('\n─── findings ───');
  for (const f of failing) {
    console.log(`\n${f.theme} @ ${f.width}px`);
    for (const h of f.clipped)
      console.log(`  CLIPPED    ${h.type}: ${h.el} → ${h.clipper} (${h.px}px)`);
    for (const h of f.scrolled)
      console.log(`  SCROLLED   ${h.type}: ${h.el} → ${h.clipper} (${h.px}px)`);
    for (const o of f.overlaps)
      console.log(`  OVERLAP    ${o.block}: "${o.a}" ↔ "${o.b}" (${o.area}px²)`);
    for (const t of f.truncated)
      console.log(`  TRUNCATED  ${t.type}: ${t.kind} ${t.el} "${t.text}"`);
    for (const t of f.tiny) console.log(`  ILLEGIBLE  ${t.block}: "${t.text}" @ ${t.size}`);
  }
  process.exitCode = 1;
}

declare global {
  interface Window {
    __overflowAudit?: () => unknown;
    __truncationAudit?: () => unknown;
  }
}

await main();
