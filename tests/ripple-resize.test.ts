// ripple-resize.test.ts — guards the scrollbar-gutter/oscillation fix (a ResizeObserver-driven
// fit-to-container inside .ripple-main/.ripple-rail needs a reserved scrollbar lane or it
// oscillates as the scrollbar pops in/out — the same class of bug fixed for the PDF panel in
// pdfworld.css) and the vh-floor regression that defeated it inside shorter panels (the verdict
// band's embedded impact map). Also guards that the P0-era section-stub placeholder it shipped
// alongside is fully retired. Source-scans only, mirroring tests/ripple-dashboards-responsive.test.ts
// and tests/prism-app-scroll.test.ts — jsdom has no real layout engine, so scrollbar/overflow
// geometry can't be asserted by rendering.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** The declaration block for the first `selector { ... }` rule found (not nested at-rules). */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, (c) => '\\' + c);
  const m = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`selector not found in stylesheet: ${selector}`);
  return m[1]!;
}

const RIPPLE_DIR = join(__dirname, '../src/live/ripple');
const css = readFileSync(join(RIPPLE_DIR, 'ripple.css'), 'utf8');

describe('ripple.css — scrollbar-gutter reserved where a ResizeObserver fits to the container', () => {
  it('.ripple-main reserves a stable scrollbar gutter', () => {
    expect(ruleBody(css, '.ripple-main')).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it('.ripple-rail reserves a stable scrollbar gutter', () => {
    expect(ruleBody(css, '.ripple-rail')).toMatch(/scrollbar-gutter:\s*stable/);
  });
});

describe('ripple.css — the impact map panels use a pixel floor, not a viewport-relative one', () => {
  it('.ripple-impact no longer forces a vh-based min-height', () => {
    const body = ruleBody(css, '.ripple-impact');
    expect(body).not.toMatch(/min-height:\s*\d+vh/);
    expect(body).toMatch(/min-height:\s*\d+px/);
  });

  it('.ripple-stage no longer forces a vh-based min-height', () => {
    const body = ruleBody(css, '.ripple-stage');
    expect(body).not.toMatch(/min-height:\s*\d+vh/);
    expect(body).toMatch(/min-height:\s*\d+px/);
  });
});

describe('the P0-era section stub is fully retired', () => {
  it('SectionStub.tsx no longer exists', () => {
    expect(existsSync(join(RIPPLE_DIR, 'sections/SectionStub.tsx'))).toBe(false);
  });

  it('no source file under src/live/ripple references SectionStub or the stale "coming alive" copy', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry.name)) {
          const text = readFileSync(full, 'utf8');
          if (/SectionStub|Coming alive|in the next pass|in a later pass/.test(text)) {
            offenders.push(full);
          }
        }
      }
    };
    walk(RIPPLE_DIR);
    expect(offenders).toEqual([]);
  });
});
