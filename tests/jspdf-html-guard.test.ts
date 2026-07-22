import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// jsPDF's ONLY browser build bundles its `.html()` convenience plugin inline, which lazily
// imports html2canvas (plus canvg/dompurify) only when `.html()` is actually called. This app
// never calls it — src/export/pipeline/raster.ts renders pages via modern-screenshot and feeds
// plain images to jsPDF through addImage()/output() only — so vite.config.ts's
// dropDeadHtml2canvasChunkPlugin strips the resulting (structurally unreachable) chunk from the
// build, saving real package weight. If that ever stops being true — a future export feature
// reaches for the far more commonly documented `.html()` API — the stripped build would 404 on
// a dynamic import at runtime instead of failing to compile. This test is the tripwire: it fails
// loudly at CI the moment `.html(` shows up anywhere in src/, so the fix is "remove the plugin
// exclusion in vite.config.ts", decided deliberately, not discovered by a user's broken export.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('jsPDF .html() is never called (html2canvas chunk is intentionally stripped)', () => {
  it('no source file calls a `.html(` method', () => {
    const offenders: string[] = [];
    for (const file of walk(join(__dirname, '../src'))) {
      const text = readFileSync(file, 'utf8');
      if (/\.html\(/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
