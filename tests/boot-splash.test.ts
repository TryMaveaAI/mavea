import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The removal test boots the REAL entry module (createRoot + Root), whose default surface is the
// full flagship landing — a component tree whose effects and timers would keep the React
// scheduler ticking after this jsdom environment tears down, surfacing as an unhandled-error
// flake in whichever worker runs next. The contract under test is Root's mount effect, not the
// landing, so mount an inert stand-in and skip the perf probe's multi-second frame watcher.
vi.mock('../src/flagship/FlagshipHost', async () => {
  const { createElement } = await import('react');
  // One inert element (not null): the test's "real UI took over" check needs a committed child.
  return { FlagshipHost: () => createElement('div') };
});
vi.mock('../src/lib/perfProbe', () => ({ startPerfProbe: () => {} }));

// The boot splash is the one piece of loading UI that must exist BEFORE any JavaScript runs:
// index.html paints it from static markup + inline style (the CSP allows inline style, never an
// inline script), and Root() removes it on its first commit. Half of that contract lives in a
// file no bundler ever type-checks, so pin it by source-scan; the removal is real behavior, so
// exercise it by actually booting the entry module into a seeded document.

const indexHtml = readFileSync(join(__dirname, '../index.html'), 'utf8');

describe('boot splash markup (index.html)', () => {
  it('ships #boot as a static sibling BEFORE #root, with the loading a11y contract', () => {
    const boot = indexHtml.indexOf('<div id="boot"');
    const root = indexHtml.indexOf('<div id="root"');
    expect(boot).toBeGreaterThan(-1);
    expect(root).toBeGreaterThan(-1);
    // Before #root, so the cover is painted even if React never mounts.
    expect(boot).toBeLessThan(root);
    expect(indexHtml).toContain(
      '<div id="boot" role="status" aria-busy="true" aria-label="Loading Mavéa">',
    );
    // The orb is decorative; only the container's label should reach assistive tech.
    expect(indexHtml).toContain('<div class="boot-orb" aria-hidden="true">');
  });

  it('styles the splash inline (CSP-safe) with no inline script anywhere', () => {
    expect(indexHtml).toContain('<style>');
    // Every <script> must load by src — an inline one would be dead under the CSP and a
    // tempting place for the splash logic to silently rot.
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });

  it('keeps the splash animation cheap and honors reduced motion', () => {
    // A stalled bundle can leave this animation running for a long time on the weakest
    // machines — opacity/scale composite for free, anything else would not.
    const keyframes = indexHtml.match(/@keyframes boot-pulse\s*\{([\s\S]*?)\n {6}\}/)?.[1] ?? '';
    expect(keyframes).not.toBe('');
    const properties = [...keyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
    expect(new Set(properties)).toEqual(new Set(['transform', 'opacity']));
    expect(indexHtml).toContain('prefers-reduced-motion');
  });

  it('sits just under SurfaceFallback so the React loading UI wins the hand-off', () => {
    const bootZ = Number(indexHtml.match(/#boot\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
    const css = readFileSync(join(__dirname, '../src/rootBoundary.css'), 'utf8');
    const fallbackZ = Number(css.match(/\.surface-fallback\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
    expect(bootZ).toBeGreaterThan(0);
    expect(fallbackZ).toBeGreaterThan(0);
    expect(bootZ).toBeLessThan(fallbackZ);
  });
});

describe('boot splash removal (src/main.tsx)', () => {
  it("Root's first commit removes a pre-seeded #boot cover", async () => {
    // The entry module probes Kokoro health and provider tags on mount; fail those fast so
    // nothing touches the network (same stance as the app-smoke suite).
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('no network in test'))),
    );
    document.body.innerHTML =
      '<div id="boot" role="status" aria-busy="true" aria-label="Loading Mavéa">' +
      '<div class="boot-orb" aria-hidden="true"></div></div><div id="root"></div>';

    // Importing the entry module runs the real boot path: createRoot into #root, then Root's
    // mount effect retires the splash on the first commit.
    await import('../src/main');

    // createRoot renders asynchronously; wait for the commit rather than a fixed beat.
    const started = Date.now();
    while (document.getElementById('boot') && Date.now() - started < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    expect(document.getElementById('boot')).toBeNull();
    // …and only because real UI took over underneath it, not because the mount crashed.
    expect(document.getElementById('root')?.hasChildNodes()).toBe(true);
    vi.unstubAllGlobals();
  });
});
