// slide-gate.mts — headless real-browser overflow gate for the presentation deck system (#/slidelab).
//
// Drives #/slidelab in gate mode (`?gate=1`), which walks every skin × both decks (representative
// and torture) internally and writes window.__slideGateResult once the sweep is done. This proves
// the audit mechanism end to end against a real Chromium layout instead of a human clicking through
// ten skins by hand.
//
// Requires a dev server already running (this script does not start one):
//   pnpm dev            # in one terminal
//   pnpm slides:gate     # in another — defaults to http://localhost:5173
//   pnpm slides:gate -- --url http://localhost:4173   # e.g. against `vite preview`
//
// Exits 0 with no failures, 1 with a printed report if anything was flagged.
import { chromium } from 'playwright';
import type { SlideGateFailure, SlideGateResult } from '../src/slides/lab/SlidesLab';

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const url = `${baseUrl}/#/slidelab?gate=1`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // The sweep renders 10 skins × 2 decks (~20 full slide-page gallery mounts) on a cold dev-server
    // bundle; the default 30s action timeout is nowhere near enough headroom for that.
    page.setDefaultTimeout(180_000);

    console.log(`[slide-gate] loading ${url}`);
    await page.goto(url, { waitUntil: 'load' });

    console.log('[slide-gate] waiting for the gate sweep to finish...');
    const t0 = Date.now();
    await page.waitForFunction(
      () =>
        (window as unknown as { __slideGateResult?: SlideGateResult }).__slideGateResult?.done ===
        true,
    );
    const ms = Date.now() - t0;

    const result = await page.evaluate<SlideGateResult>(
      () => (window as unknown as { __slideGateResult: SlideGateResult }).__slideGateResult,
    );
    console.log(
      `[slide-gate] swept 10 skins × 2 decks in ${ms}ms — ${result.failures.length} failure(s)`,
    );

    if (!result.failures.length) {
      console.log('[slide-gate] clean — no overflow found in any skin × deck combination.');
      process.exitCode = 0;
      return;
    }

    // Group by skin × deck so a run reads as a scannable report, not a wall of lines.
    const byKey = new Map<string, SlideGateFailure[]>();
    for (const f of result.failures) {
      const key = `${f.skin}  ·  ${f.deck}`;
      const list = byKey.get(key);
      if (list) list.push(f);
      else byKey.set(key, [f]);
    }
    for (const [key, hits] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`\n${key}`);
      for (const hit of hits) {
        console.log(`  - slide ${hit.index} (${hit.kind}): ${hit.reason}`);
      }
    }
    console.log(
      `\n[slide-gate] ${result.failures.length} failure(s) across ${byKey.size} skin/deck combination(s).`,
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error('[slide-gate] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
