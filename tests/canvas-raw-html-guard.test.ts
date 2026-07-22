// Guards the render-boundary sanitization invariant for block markup.
//
// Block text that reaches the DOM as HTML must pass through `richInnerHtml` (the allow-list
// sanitizer in lib/richText) AT the render site, not rely on upstream neutralization staying
// in place. liveSchema does neutralize model strings today — but that guarantee lives far from
// the `dangerouslySetInnerHTML` it protects, and one added RAW_TEXT_PROPS entry (or a new call
// path that skips coercion) would silently turn a raw site into stored XSS.
//
// A raw `__html:` is allowed only where the value is provably safe by other means, each named
// below with its reason. Everything else must read `dangerouslySetInnerHTML={richInnerHtml(…)}`.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : e.name.endsWith('.tsx') ? [p] : [];
  });
}

/** Render sites whose raw HTML is produced or sanitized by the component itself — and HOW MANY such
 *  sites each file is allowed to have.
 *
 *  The count is the point. This allowlist used to be file-scoped, which quietly exempted the whole
 *  file: SportsPitch was listed because its pitch markings are a local constant table, and that
 *  blanket then covered a SECOND, unrelated raw site in the same file — the model-written `footer` —
 *  which this guard exists precisely to catch. Pinning the number means a new raw sink in an
 *  already-trusted file trips the wire instead of inheriting someone else's justification. */
const SELF_SANITIZED: ReadonlyMap<string, number> = new Map([
  ['blocks/display/Codeblock.tsx', 1], // Shiki output — the highlighter escapes the source itself
  ['blocks/learn/TeX.tsx', 1], // KaTeX MathML output (trust: false, output: 'mathml')
  ['blocks/media/SvgBlock.tsx', 1], // sanitizeSvg's strict deny-by-default XML sanitizer
  ['blocks/media/SportsPitch.tsx', 1], // the pitch markings table only — a local constant, never props
]);

describe('canvas raw-HTML render sites', () => {
  const canvasDir = join(__dirname, '../src/canvas');
  const files = tsxFiles(canvasDir);

  it('every __html in canvas outside the self-sanitizing set goes through richInnerHtml', () => {
    const issues: string[] = [];

    for (const file of files) {
      const rel = file.replace(canvasDir + '/', '');
      const src = readFileSync(file, 'utf8');
      const raw = [...src.matchAll(/__html\s*:/g)];

      // An allowlisted file is trusted for a KNOWN NUMBER of raw sites, not for all of them.
      const allowed = SELF_SANITIZED.get(rel);
      if (allowed !== undefined) {
        if (raw.length > allowed) {
          issues.push(
            `  ${rel}: ${raw.length} raw __html sites, but only ${allowed} is vouched for — ` +
              'a new one cannot inherit the old justification',
          );
        }
        continue;
      }

      for (const m of raw) {
        const lineNum = src.slice(0, m.index).split('\n').length;
        issues.push(`  ${rel}:${lineNum}`);
      }
    }

    expect(
      issues,
      [
        'Raw __html: found — use dangerouslySetInnerHTML={richInnerHtml(value)} so the',
        'sanitizer sits at the render boundary (or add the file to SELF_SANITIZED with a reason):',
        ...issues,
      ].join('\n'),
    ).toHaveLength(0);
  });

  it('the self-sanitizing allowlist stays honest — each listed file still exists and uses __html', () => {
    for (const [rel, allowed] of SELF_SANITIZED) {
      const src = readFileSync(join(canvasDir, rel), 'utf8');
      expect(src, `${rel} no longer uses __html — remove it from SELF_SANITIZED`).toMatch(
        /__html|dangerouslySetInnerHTML/,
      );
      // Fewer sites than vouched for means the reason has drifted from the code; re-read it.
      const count = [...src.matchAll(/__html\s*:/g)].length;
      expect(
        count,
        `${rel} now has ${count} raw sites, not ${allowed} — update SELF_SANITIZED`,
      ).toBe(allowed);
    }
  });
});
