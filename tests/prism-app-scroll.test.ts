// prism-app-scroll.test.ts — the standalone #/prism and #/synthesis entry (both mount
// PrismApp.tsx's <div className="prism-app">) must be its OWN scroll container, the same idiom
// gallery.css documents: `height: 100dvh; overflow-y: auto`. The global stylesheet locks
// `html, body { overflow: hidden }` for the app-shell surfaces that manage their own internal
// scroll regions — a standalone route that instead grows past the viewport with `min-height`
// relies on body scroll that lock forbids, so its tail content (Prism's "why trust this" feature
// bullets) becomes permanently unreachable on any window shorter than the page. This is a static
// scan, not a jsdom layout assertion, because jsdom doesn't compute real overflow/scroll geometry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('.prism-app is a self-contained scroll container', () => {
  const css = readFileSync(join(__dirname, '../src/live/prism/prism-app.css'), 'utf8');
  // Isolate the .prism-app rule block itself (not a descendant like .prism-app-header).
  const rule = css.match(/(?<!-)\.prism-app\s*\{[^}]*\}/)?.[0] ?? '';

  it('the root rule exists and is bounded + scrollable', () => {
    expect(rule).not.toBe('');
    expect(rule).toMatch(/height:\s*100dvh/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
  });

  it('does not regress to the unbounded min-height that relies on locked body scroll', () => {
    expect(rule).not.toMatch(/min-height/);
  });
});
