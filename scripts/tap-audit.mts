// tap-audit.mts — can you actually hit the controls with a thumb?
//
// A button that is 20px tall is not a button on a phone; it is a coin toss. The platform guidance is
// ~44px (Apple) / 48dp (Android), and the failure is invisible on a desktop mouse — which is the only
// place this app has ever been driven. This walks every surface at a phone width and reports any
// interactive control whose hit area is too small to land reliably, and any pair of controls packed
// so tightly that a thumb cannot choose between them.
//
// Requires a dev server already running:
//   pnpm dev
//   pnpm audit:tap
import { chromium } from 'playwright';

const MIN = 44; // px — the smaller side of a control's hit box
const MIN_GAP = 6; // px — bare minimum between two adjacent hit boxes

interface Hit {
  surface: string;
  label: string;
  w: number;
  h: number;
}
interface Crowd {
  surface: string;
  a: string;
  b: string;
  gap: number;
}

const SURFACES: { name: string; path: string; ready: string }[] = [
  { name: 'landing', path: '/', ready: 'button' },
  { name: 'live', path: '/#/live', ready: '.setup, .live-voice, .command-composer' },
  { name: 'dashboards', path: '/#/dashboards', ready: '.dash-topbar' },
  { name: 'flashcards', path: '/#/flashcards', ready: '.fc-nav' },
  { name: 'courses', path: '/#/courses', ready: '.cr-nav' },
  { name: 'prism', path: '/#/prism', ready: '.prism-app' },
  { name: 'synthesis', path: '/#/synthesis', ready: '.prism-app' },
  { name: 'deepzoom', path: '/#/deepzoom', ready: '.dz-topbar' },
  { name: 'gallery', path: '/#/gallery', ready: '.vlib-bar' },
  { name: 'ripple', path: '/#/ripple', ready: '.ripple-panel' },
];

// Runs in the page. Does NOT measure the element's own box — that is the mistake. A control can be
// visually 32px and still be perfectly tappable if it projects a larger hit area (which is exactly
// how you fix this without redesigning anything). So this asks the only question that matters: if a
// finger lands 22px from the centre — the edge of a 44px thumb — does the press still reach this
// control? That is a hit test, not a measurement.
const SCRIPT = `(() => {
  const small = [];
  const boxes = [];
  const sel = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const R = ${MIN} / 2;
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    if (parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // Only judge what is actually on screen — elementFromPoint cannot answer for anything else.
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
    // A transformed control can be only partly visible inside a pan/scroll viewport. Its raw DOM
    // rect still extends through the clip and can appear to collide with controls outside that
    // viewport, even though those pixels cannot paint or receive a pointer. Audit it after the user
    // pans it fully into view; the layout-overflow gate separately catches accidental clipping.
    let locallyClipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) {
        locallyClipped = true;
        break;
      }
    }
    if (locallyClipped) continue;
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || el.className || el.tagName).slice(0, 34);

    // A link inside prose is text, not a button; nobody expects a 44px word.
    const inProse = !!el.closest('p, .insight-summary, li');
    if (inProse && el.tagName === 'A' && !el.getAttribute('role')) continue;

    boxes.push({ label: label, r: r });

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // The four extremes of a 44px thumb centred on the control. If the press lands on this control
    // (or on something inside it), the finger has somewhere to go.
    const probes = [[cx - R + 1, cy], [cx + R - 1, cy], [cx, cy - R + 1], [cx, cy + R - 1]];
    let reachable = 0;
    for (const p of probes) {
      if (p[0] < 0 || p[1] < 0 || p[0] > innerWidth || p[1] > innerHeight) { reachable++; continue; }
      // Chromium's mobile emulation can return a pointer-events:none overlay from
      // elementFromPoint even though an actual tap passes through it. Walk the stack to the first
      // pointer-receiving element so this measures dispatch behavior, not paint order.
      const hit = document
        .elementsFromPoint(p[0], p[1])
        .find((candidate) => getComputedStyle(candidate).pointerEvents !== 'none');
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) reachable++;
    }
    if (reachable < 4) {
      small.push({ label: label, w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  const crowded = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      if (dx === 0 && dy === 0) continue;
      const gap = Math.max(dx, dy);
      if ((dx === 0 || dy === 0) && gap > 0 && gap < ${MIN_GAP}) {
        crowded.push({ a: boxes[i].label, b: boxes[j].label, gap: Math.round(gap) });
      }
    }
  }
  const dedup = (xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];
  return { small: dedup(small).slice(0, 30), crowded: dedup(crowded).slice(0, 15) };
})()`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const small: Hit[] = [];
  const crowded: Crowd[] = [];

  for (const s of SURFACES) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5173' + s.path, { waitUntil: 'load' });
    try {
      await page.waitForSelector(s.ready, { timeout: 20_000 });
    } catch {
      console.log(`${s.name.padEnd(12)} — never rendered`);
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(1800);
    const r = (await page.evaluate(SCRIPT)) as {
      small: Omit<Hit, 'surface'>[];
      crowded: Omit<Crowd, 'surface'>[];
    };
    for (const h of r.small) small.push({ surface: s.name, ...h });
    for (const c of r.crowded) crowded.push({ surface: s.name, ...c });
    console.log(
      `${s.name.padEnd(12)} ${String(r.small.length).padStart(3)} too small · ` +
        `${String(r.crowded.length).padStart(2)} crowded` +
        (r.small.length + r.crowded.length === 0 ? '  ✓' : ''),
    );
    await ctx.close();
  }
  await browser.close();

  if (small.length) {
    console.log(`\n─── under ${MIN}px (a thumb cannot land on these reliably) ───`);
    for (const h of small) console.log(`  ${h.surface.padEnd(12)} ${h.w}×${h.h}  ${h.label}`);
  }
  if (crowded.length) {
    console.log(`\n─── packed closer than ${MIN_GAP}px (no room to choose between them) ───`);
    for (const c of crowded)
      console.log(`  ${c.surface.padEnd(12)} ${c.gap}px  "${c.a}" ↔ "${c.b}"`);
  }
  if (!small.length && !crowded.length) console.log('\n✓ Every control is thumb-sized.');
  else process.exitCode = 1;
}

await main();
