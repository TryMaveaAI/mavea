// Guards against the SVG y-axis label anti-pattern that caused invisible content
// in several chart components.
//
// The broken pattern:
//   <text x={-n} transform="rotate(-90)">  ← x is in rotated coords → bboxes
//   are reported in local space, making overflow analysis wrong and labels
//   hard to position correctly.
//
// The correct patterns:
//   <text x={0} y={0} transform={`translate(cx, cy) rotate(-90)`}>   ← preferred
//   <text transform="rotate(-90 cx cy)">                               ← also OK
//
// This test scans all canvas TSX source and fails on bare rotate(±90|180|270)
// that has no center-point args and no preceding translate() in the same attribute.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : e.name.endsWith('.tsx') ? [p] : [];
  });
}

describe('SVG label anti-patterns', () => {
  const canvasDir = join(__dirname, '../src/canvas');
  const files = tsxFiles(canvasDir);

  it('no SVG transform uses bare rotate(±90|180|270) without translate or center-point args', () => {
    // Detects: transform="rotate(-90)" or transform={`rotate(-90)`}
    // Does NOT flag:
    //   - rotate(-90 cx cy)   — has center-point args → content stays in place
    //   - translate(…) rotate(-90) — has translate → fine
    //   - rotate(45deg)  — CSS, not SVG
    const issues: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const rel = file.replace(canvasDir + '/', '');

      // Match any transform attribute value (string literal or template literal)
      for (const m of src.matchAll(/transform=["'`]([^"'`]+)["'`]/g)) {
        const val = m[1];

        // Skip CSS transforms — they always use unit suffixes like 'deg'
        if (val.includes('deg')) continue;

        // Bare rotate: angle followed immediately by ) with only optional whitespace,
        // meaning no center-point args (which would have spaces + more numbers).
        const hasBareRotate = /\brotate\(\s*-?(?:90|180|270)\s*\)/.test(val);
        if (!hasBareRotate) continue;

        // translate() before rotate is the safe wrapper pattern
        if (val.includes('translate')) continue;

        const lineNum = src.slice(0, m.index).split('\n').length;
        issues.push(`  ${rel}:${lineNum}  →  transform="${val}"`);
      }
    }

    expect(
      issues,
      ['Bare rotate() found — use translate(cx, cy) rotate(deg) with x=0 y=0:', ...issues].join(
        '\n',
      ),
    ).toHaveLength(0);
  });
});
