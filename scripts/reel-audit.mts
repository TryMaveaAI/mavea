// reel-audit.mts — headless real-browser overflow/overlap sweep for the reel gallery (#/reel).
//
// Drives window.__reelAuditAll() (installed by ReelGallery in dev) across every aspect × palette ×
// longest-text combination and reports what it flags. Proves the audit mechanism end to end so
// every later change to the reel finishes gets measured against a real Chromium layout instead of
// a human eyeballing ~500 tiles by hand.
//
// Requires a dev server already running (this script does not start one):
//   pnpm dev            # in one terminal
//   pnpm audit:reel      # in another — defaults to http://localhost:5173
//   pnpm audit:reel -- --url http://localhost:4173   # e.g. against `vite preview`
//
// Exits 0 with no flags, 1 with a printed report if anything was flagged (expected for now — this
// script proves the harness works, not that the reel is already clean).
import { chromium } from 'playwright';

interface AuditHit {
  tile: string;
  aspect: string;
  palette: string;
  longest: boolean;
  reason: string;
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

async function main(): Promise<void> {
  const baseUrl = readFlag('url', 'http://localhost:5173').replace(/\/$/, '');
  const url = `${baseUrl}/#/reel`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // The full sweep remounts ~500 tiles 24 times over; the default 30s action timeout is nowhere
    // near enough headroom for that on a cold dev-server bundle.
    page.setDefaultTimeout(180_000);

    console.log(`[reel-audit] loading ${url}`);
    await page.goto(url, { waitUntil: 'load' });

    console.log('[reel-audit] waiting for the gallery to mount...');
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>).__reelAuditAll === 'function',
    );

    console.log(
      '[reel-audit] running window.__reelAuditAll() — 3 aspects × 4 palettes × 2 lengths...',
    );
    const t0 = Date.now();
    const flags = await page.evaluate<AuditHit[]>(async () => {
      const w = window as unknown as { __reelAuditAll: () => Promise<AuditHit[]> };
      return w.__reelAuditAll();
    });
    const ms = Date.now() - t0;
    console.log(`[reel-audit] swept in ${ms}ms — ${flags.length} flagged reason(s)`);

    if (!flags.length) {
      console.log('[reel-audit] clean — no overflow/overlap found.');
      process.exitCode = 0;
      return;
    }

    // Group by tile/aspect/palette/longest so a run reads as a scannable report, not a wall of lines.
    const byKey = new Map<string, AuditHit[]>();
    for (const f of flags) {
      const key = `${f.tile}  ·  ${f.aspect}  ·  ${f.palette}${f.longest ? '  ·  longest' : ''}`;
      const list = byKey.get(key);
      if (list) list.push(f);
      else byKey.set(key, [f]);
    }
    for (const [key, hits] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`\n${key}`);
      for (const hit of hits) console.log(`  - ${hit.reason}`);
    }
    console.log(`\n[reel-audit] ${flags.length} flag(s) across ${byKey.size} tile state(s).`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error('[reel-audit] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
