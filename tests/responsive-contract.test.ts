// The responsive layout contract, held together. The breakpoint ladder is written twice on purpose
// (a var() is not valid inside @media, so tokens-base.css can only DOCUMENT it while
// scripts/breakpoints.mjs, which stylelint.config.js reads, enforces it); every route needs a row in the geometry sweep; and the type
// ramp's floor is what keeps the reader's "smaller" knob on the 9px legibility line. Each of those
// is a promise two files make to each other, and this is where they are checked against each other.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BREAKPOINT_HEIGHTS, BREAKPOINT_WIDTHS } from '../scripts/breakpoints.mjs';
import { LAB_ROUTES, PUBLIC_ROUTES } from '../src/routeTable';
import {
  DEFAULT_SIZES,
  SURFACES,
  WIDTHS,
  heightFor,
  surfacesTouchedBy,
  uncoveredRoutes,
} from '../scripts/surface-sweep.mjs';
import { tokenFloorPx } from './helpers/fluidType';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const tokens = read('src/styles/tokens-base.css');

describe('the breakpoint ladder', () => {
  it('is the same list in tokens-base.css (documented) and scripts/breakpoints.mjs (enforced)', () => {
    const contract = tokens.slice(tokens.indexOf('--- layout contract ---'));
    const widths = contract.slice(contract.indexOf('width:'), contract.indexOf('height:'));
    const heightLine = contract.indexOf('height:');
    const heights = contract.slice(heightLine, contract.indexOf('\n', heightLine));
    const numbers = (s: string) => [...s.matchAll(/(\d{3,4}) [a-z]/g)].map((m) => Number(m[1]));
    expect(numbers(widths)).toEqual(BREAKPOINT_WIDTHS);
    expect(numbers(heights)).toEqual(BREAKPOINT_HEIGHTS);
  });

  it('is sorted, so "the next step up" means one thing', () => {
    expect([...BREAKPOINT_WIDTHS].sort((a, b) => a - b)).toEqual(BREAKPOINT_WIDTHS);
    expect([...BREAKPOINT_HEIGHTS].sort((a, b) => a - b)).toEqual(BREAKPOINT_HEIGHTS);
  });

  it('keeps the compact treatments off the width a 1280px window resolves to', () => {
    // 1280 − scrollbar ≈ 1265, so a `width <= 1280px` rule would hand the most common laptop the
    // tablet layout. The step below 1280 exists for exactly that reason.
    expect(BREAKPOINT_WIDTHS).toContain(1200);
    expect(BREAKPOINT_WIDTHS).toContain(1280);
  });
});

describe('the fluid type ramp', () => {
  const RAMP = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'stat', 'hero'];

  it('lives in tokens-base.css alone; wow-polish keeps only the reader knob', () => {
    const wow = read('src/styles/wow-polish.css');
    expect(wow).not.toMatch(/--fs-(?!reader)[a-z0-9]+:/);
    expect(wow).toMatch(/\[data-font-scale='smaller'\]\s*\{\s*--fs-reader:\s*0\.9/);
    for (const step of RAMP) expect(tokenFloorPx(`--fs-${step}`), step).toBeDefined();
  });

  it('is the floor the Study derives its own scale floor from', async () => {
    const { RAMP_FLOOR_PX, STUDY_FIT_FLOOR } = await import('../src/canvas/study/slots');
    expect(tokenFloorPx('--fs-2xs')).toBe(RAMP_FLOOR_PX);
    expect(STUDY_FIT_FLOOR).toBeCloseTo(9 / RAMP_FLOOR_PX);
  });

  it('floors at 10px, so the reader’s 0.9 knob renders exactly the 9px legibility floor', () => {
    for (const step of RAMP) expect(tokenFloorPx(`--fs-${step}`)! * 0.9).toBeGreaterThanOrEqual(9);
  });

  it('is monotonic — each step’s floor is at or above the one below it', () => {
    const floors = RAMP.map((s) => tokenFloorPx(`--fs-${s}`)!);
    for (let i = 1; i < floors.length; i++) expect(floors[i]).toBeGreaterThanOrEqual(floors[i - 1]);
  });

  it('composes the reader knob with the viewport scale exactly once', () => {
    expect(tokens).toMatch(/--fs-scale:\s*calc\(var\(--fs-reader\) \* var\(--vp-type-scale, 1\)\)/);
    expect(read('src/styles/wow-polish.css')).not.toMatch(/--fs-scale:/);
  });
});

describe('the geometry sweep', () => {
  it('has a row for every route prefix, public and lab, plus the landing', () => {
    expect(uncoveredRoutes(PUBLIC_ROUTES.map((r) => r.prefix))).toEqual([]);
    expect(uncoveredRoutes(LAB_ROUTES.map((r) => r.prefix))).toEqual([]);
    expect(SURFACES.some((s) => s.route === '')).toBe(true);
  });

  it('marks exactly the lab routes as labs', () => {
    const labPrefixes = new Set(LAB_ROUTES.map((r) => r.prefix));
    for (const s of SURFACES) expect(!!s.lab, s.key).toBe(labPrefixes.has(s.route));
  });

  it('uses unique keys, so --only and the matrix name one thing each', () => {
    const keys = SURFACES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('measures the short laptop short, phones at their real heights, and wide screens at 1080', () => {
    expect(heightFor(1366)).toBe(620);
    expect(heightFor(375)).toBe(812);
    expect(heightFor(1920)).toBe(1080);
    expect(heightFor(3440)).toBe(1080);
    expect(DEFAULT_SIZES).toEqual(WIDTHS.map((w) => `${w}x${heightFor(w)}`));
    expect(WIDTHS).toEqual([
      320, 375, 414, 768, 834, 1024, 1280, 1366, 1440, 1536, 1920, 2560, 3440,
    ]);
  });

  it('presses a row’s controls the way a script does, since a row can start one', () => {
    // Rows like `lens` click Start demo and then a control ON the answer. A running replay holds
    // the surface inert (useScriptedLock), so hit-testing falls through it and an actionability
    // check can never pass: the sweep would hang out its timeout and go red on every push. The
    // press is a script's, not a visitor's, so it dispatches.
    const audit = read('scripts/surface-audit.mts');
    expect(audit).toMatch(/dispatchEvent\('click'\)/);
    expect(audit).not.toMatch(/\.click\(\{ timeout/);
    expect(SURFACES.some((s) => s.click?.some((label) => /^start/i.test(label)))).toBe(true);
  });

  it('routes a changed file to the surfaces that own it, and a shared file to all of them', () => {
    expect(surfacesTouchedBy(['src/live/prism/PrismOverlay.tsx'])).toEqual(
      new Set(['prism', 'synthesis', 'synthesis-map', 'synlab', 'pageviewlab']),
    );
    // Live's own files reach Live's rows, never Prism's.
    const live = surfacesTouchedBy(['src/live/LiveApp.tsx'])!;
    expect(live.has('board')).toBe(true);
    expect(live.has('prism')).toBe(false);
    expect(surfacesTouchedBy(['src/styles/tokens-base.css'])).toBeNull();
    expect(surfacesTouchedBy(['src/canvas/blocks/tables/styles.css'])!.has('gallery')).toBe(true);
  });
});

describe('query containers', () => {
  it('declares .card-grid a container without changing the box useResponsiveGrid measures', () => {
    // The hook re-tiles from the grid's content box; containment on the inline axis leaves a
    // width:100% grid exactly where it was. Both halves of that bargain are pinned here.
    expect(tokens).toMatch(/\.card,\s*\n\.card-grid,[\s\S]*?container-type:\s*inline-size/);
    expect(read('src/styles/visualizations-extra.css')).toMatch(
      /\.card-grid\s*\{[^}]*width:\s*100%/,
    );
  });
});
