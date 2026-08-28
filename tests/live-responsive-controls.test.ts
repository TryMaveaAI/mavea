// Guards the narrow-viewport fixes made across Flashcards/SRS, Memory, and Attachments so a
// future edit can't silently reintroduce them:
//   - the composer's text input must stay shrinkable (min-width: 0) so a narrow phone squeezes
//     IT, not the fixed-size mic/attach/send buttons around it;
//   - the attach/tool button must hold its size (flex-shrink: 0) for the same reason — losing
//     either one reopens the composer overflowing / the attach button shrinking below its
//     touch-target size below ~450px wide;
//   - the Flashcards top nav must wrap instead of clipping its action buttons off-screen;
//   - the SRS grade row must restructure into a 2x2 grid on a narrow shell rather than cramping
//     four buttons (and their longest label, "Again") into one row;
//   - the memory concept graph stays on design-system tokens, never raw hex, for its palette.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

describe('composer — narrow-viewport control sizing', () => {
  const css = read('src/styles/composer.css');
  const dockCss = read('src/live/livedock.css');

  it('the text input can shrink below its intrinsic content width', () => {
    const block = css.slice(
      css.indexOf('.composer-input {'),
      css.indexOf('.composer-input::placeholder'),
    );
    expect(block).toMatch(/min-width:\s*0/);
  });

  it('the attach/tool button never shrinks below its fixed size', () => {
    const block = css.slice(css.indexOf('.composer-tool {'), css.indexOf('.composer-tool:hover'));
    expect(block).toMatch(/flex-shrink:\s*0/);
  });

  it('gives typing a full row instead of squeezing it between five phone controls', () => {
    const phone = dockCss.slice(dockCss.indexOf('@media (max-width: 420px)'));
    expect(phone).toMatch(/grid-template-columns:\s*44px 38px 38px 38px 44px/);
    expect(phone).toMatch(/grid-column:\s*1 \/ -1/);
    expect(phone).toMatch(/\.mark-toggle-label\s*\{[^}]*display:\s*none/s);
    expect(phone).toMatch(/\.explain-chip-tag\s*\{[^}]*display:\s*none/s);
  });

  it('makes the model label width-constrained before hiding it on the narrowest phones', () => {
    const compact = dockCss.slice(dockCss.indexOf('@media (max-width: 560px)'));
    expect(compact).toMatch(/\.vc-transcript\s*\{[^}]*display:\s*none/s);
    expect(compact).toMatch(/\.chip-model\s*\{[^}]*display:\s*block[^}]*max-width:\s*64px/s);
    expect(compact).toMatch(
      /@media \(max-width:\s*360px\)[\s\S]*\.chip-model\s*\{[^}]*display:\s*none/,
    );
  });
});

describe('Live topbar — compact laptops keep every primary control reachable', () => {
  it('drops the duplicated canvas title before the standing menus clip', () => {
    const css = read('src/styles/mobile.css');
    expect(css).toMatch(/@media \(min-width:\s*769px\) and \(max-width:\s*1120px\)/);
    expect(css).toMatch(
      /\.with-rail \.topbar \.workspace-name,[\s\S]*\.with-rail \.topbar \.brand-sep\s*\{[^}]*display:\s*none/,
    );
  });
});

describe('Flashcards manage surface — top nav wraps instead of clipping', () => {
  const css = read('src/live/srs/flashcards.css');

  it('.fc-nav wraps its children', () => {
    const block = css.slice(css.indexOf('.fc-nav {'), css.indexOf('.fc-nav-back {'));
    expect(block).toMatch(/flex-wrap:\s*wrap/);
  });

  it('.fc-nav-actions wraps and stays right-aligned on its own row', () => {
    const block = css.slice(
      css.indexOf('.fc-nav-actions {'),
      css.indexOf('.fc-nav-actions {') + 200,
    );
    expect(block).toMatch(/flex-wrap:\s*wrap/);
    expect(block).toMatch(/justify-content:\s*flex-end/);
  });
});

describe('SRS review — grade row restructures on a narrow shell', () => {
  const css = read('src/live/srs/srs-review.css');

  it('switches the four grade buttons to a 2x2 grid under the narrow-shell breakpoint', () => {
    const idx = css.indexOf('.srs-grades {');
    const region = css.slice(idx, idx + 500);
    expect(region).toMatch(/@media \(max-width:\s*480px\)/);
    expect(region).toMatch(/display:\s*grid/);
    expect(region).toMatch(/grid-template-columns:\s*1fr 1fr/);
  });
});

describe('memory concept graph — tokens only, no raw hex', () => {
  const src = read('src/live/memory/MemoryGraph.tsx');

  it('the namespace palette uses CSS custom properties, not hardcoded hex colors', () => {
    const hexLiterals = src.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexLiterals).toEqual([]);
  });
});

describe('memory fact row — only references tokens that actually exist', () => {
  it('does not reference the undefined --surface-2 custom property', () => {
    // `--surface-2` was never defined in tokens-base.css, so `background: var(--surface-2)`
    // silently resolved to nothing — the edit textarea rendered with no background at all.
    const src = read('src/live/memory/MemoryFactRow.tsx');
    expect(src).not.toContain('--surface-2');

    // Whatever token it references has to actually be defined somewhere (tokens-base.css for
    // the core palette, templates.css for a few export-only tokens like --font-data).
    const tokens = read('src/styles/tokens-base.css') + read('src/styles/templates.css');
    const used = [...src.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    for (const token of used) {
      expect(tokens.includes(`${token}:`), `${token} is not defined in tokens-base.css`).toBe(true);
    }
  });
});
