// canvas-view-node-title.test.ts — source-scan guard for a real font-consistency bug: the
// "View as canvas" board (CanvasView.tsx) hides each card's own .card-eyebrow (the app's
// established small-caps/mono header voice — templates.css/visualizations-extra.css) and
// substitutes its own `.cv-node-title` label, which had drifted to a completely different
// treatment (plain sentence-case sans, tighter tracking, --text-primary) — a jarring "why did
// the font change" the instant you spread an answer onto the board. No DOM needed: jsdom never
// loads stylesheets, so this asserts directly against the source CSS rather than computed style.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'src', 'canvas', 'focus', 'canvas.css'), 'utf8');

function rule(selector: string): string {
  const re = new RegExp(selector.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  return css.match(re)?.[1] ?? '';
}

describe('CanvasView node title matches the app-wide .card-eyebrow voice', () => {
  it('reads in the same small-caps mono treatment as every other card eyebrow', () => {
    const title = rule('.cv-node-title');
    expect(title).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(title).toMatch(/text-transform:\s*uppercase/);
    expect(title).toMatch(/letter-spacing:\s*0\.06em/);
    expect(title).toMatch(/color:\s*var\(--text-muted\)/);
  });
});
