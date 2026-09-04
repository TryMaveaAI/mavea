// The headless UI gate (scripts/ui-audit.mts) once skipped every text run inside an <svg>:
//
//   if (el.closest('svg')) continue;
//
// In a library whose charts are SVG, that excused the single most common real defect. The gate
// reported "0 overlapping · 0 illegible" across every width and theme while BigO drew four curve
// labels as two unreadable piles and LineBalance's station names ran straight through each other.
//
// It also read font-size raw. Inside a viewBox that number is in USER UNITS, so a chart scaled
// 2.4x reported its crisp 19px labels as 8px — and one scaled down reported unreadable type as
// fine. Legibility has to be judged on what actually lands on the retina.
//
// Both are invisible failures: the gate stays green, so nobody looks. These assertions keep the
// collider pointed at the content it exists to check.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(join(process.cwd(), 'scripts/ui-audit.mts'), 'utf8');

describe('ui-audit collider', () => {
  it('waits for real cards instead of auditing TopicCanvas loading skeletons', () => {
    expect(SOURCE).toMatch(/\.vlib-render \[aria-busy=["']true["']\]/);
    expect(SOURCE).toMatch(/\.vlib-render \.skel-card/);
  });

  it('bounds peak audit memory by visiting every renderer family separately', () => {
    expect(SOURCE).toContain('for (const family of families)');
    expect(SOURCE).toContain('family=${encodeURIComponent(family)}');
    expect(SOURCE).toContain('Gallery coverage mismatch');
  });

  it('does not blanket-skip text inside an <svg>', () => {
    expect(SOURCE).not.toMatch(/closest\(['"]svg['"]\)\)\s*continue/);
  });

  it('measures legibility in rendered pixels, not raw user units', () => {
    // The screen matrix is what converts viewBox user units into on-screen px.
    expect(SOURCE).toContain('getScreenCTM');
  });

  it('has no accepted narrow-screen legibility waiver', () => {
    expect(SOURCE).not.toMatch(/KNOWN_NARROW_SVG_TYPE|known limit:|accepted 2026-08-08/);
    expect(SOURCE).toMatch(/if \(dirty\.length === 0\)/);
  });

  it('still excuses the stacking that is genuinely by design', () => {
    // Rotated runs (their axis-aligned box is far larger than their ink), faded decoration, and
    // out-of-flow overlays would all false-flag if the collider judged them as collisions.
    expect(SOURCE).toMatch(/rotate/);
    expect(SOURCE).toMatch(/position === 'absolute'/);
  });
});
