// export-gate.mts — headless real-browser overflow gate for the PDF export document system
// (#/exportlab). The counterpart to slide-gate.mts.
//
// Drives #/exportlab in gate mode (`?gate=1`), which walks every skin × both page formats (Letter,
// A4) internally on the torture preset and writes window.__exportGateResult once the sweep is
// done. This proves the audit mechanism end to end against a real Chromium layout instead of a
// human clicking through ten skins by hand.
//
// Requires a dev server already running (this script does not start one):
//   pnpm dev            # in one terminal
//   pnpm export:gate     # in another — defaults to http://localhost:5173
//   pnpm export:gate -- --url http://localhost:4173   # e.g. against `vite preview`
//
// Exits 0 with no failures, 1 with a printed report if anything was flagged.
import { chromium } from 'playwright';
import type { ExportGateFailure, ExportGateResult } from '../src/export/lab/ExportLab';

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
  const url = `${baseUrl}/#/exportlab?gate=1`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // The sweep renders 10 skins × 2 page formats (~20 full torture-document mounts, several of
    // them multi-page) on a cold dev-server bundle; the default 30s action timeout is nowhere near
    // enough headroom for that.
    page.setDefaultTimeout(180_000);

    console.log(`[export-gate] loading ${url}`);
    await page.goto(url, { waitUntil: 'load' });

    console.log('[export-gate] waiting for the gate sweep to finish...');
    const t0 = Date.now();
    await page.waitForFunction(
      () =>
        (window as unknown as { __exportGateResult?: ExportGateResult }).__exportGateResult
          ?.done === true,
    );
    const ms = Date.now() - t0;

    const result = await page.evaluate<ExportGateResult>(
      () => (window as unknown as { __exportGateResult: ExportGateResult }).__exportGateResult,
    );
    console.log(
      `[export-gate] swept 10 skins × 2 formats in ${ms}ms — ${result.failures.length} failure(s)`,
    );

    if (!result.failures.length) {
      console.log('[export-gate] clean — no overflow found in any skin × format combination.');
      process.exitCode = 0;
      return;
    }

    // Group by skin × format so a run reads as a scannable report, not a wall of lines.
    const byKey = new Map<string, ExportGateFailure[]>();
    for (const f of result.failures) {
      const key = `${f.skin}  ·  ${f.format}`;
      const list = byKey.get(key);
      if (list) list.push(f);
      else byKey.set(key, [f]);
    }
    for (const [key, hits] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`\n${key}`);
      for (const hit of hits) {
        console.log(`  - page ${hit.page}: ${hit.reason}`);
      }
    }
    console.log(
      `\n[export-gate] ${result.failures.length} failure(s) across ${byKey.size} skin/format combination(s).`,
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error('[export-gate] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
