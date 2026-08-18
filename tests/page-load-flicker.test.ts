// Source-level regression guard for the two page-load flicker fixes (see the CSS itself for the
// full "why" — index.html's #boot block and public/fonts/fonts.css). jsdom never lays out real
// fonts or resolves prefers-color-scheme against an actual OS setting, so — like
// perf-lite-css.test.ts and eager-bundle.test.ts's font-loading check — this is a text-level
// contract on the authored CSS rather than a rendered assertion.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('boot splash — dark-mode pre-mount paint', () => {
  const html = read('index.html');

  it('still ships the light default on <html>, so the guess below has something to override', () => {
    expect(html).toMatch(/<html[^>]*\bdata-theme="light"/);
  });

  it('paints #boot dark under prefers-color-scheme before the bundle can stamp the real choice', () => {
    // A plain #boot selector (no :root[data-theme] guard) inside the media query — anything more
    // specific would out-rank the explicit dark-attribute rule below and never yield to it.
    expect(html).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*{\s*#boot\s*{\s*background:\s*var\(--surface-default,\s*#0a0e15\)/,
    );
  });

  it('still lets an explicit dark choice win the instant applyTheme stamps it', () => {
    // Higher-specificity attribute selector — must survive alongside the media guess above, or a
    // returning dark reader would fall back to the guess's OS-only heuristic forever.
    expect(html).toMatch(
      /:root\[data-theme='dark'\]\s*#boot\s*{\s*background:\s*var\(--surface-default,\s*#0a0e15\)/,
    );
  });

  it('lets a RESOLVED light choice overrule the guess (the one reader it gets wrong)', () => {
    // Without this the reader who keeps the app light on a dark system keeps the dark guess for
    // the whole boot; data-theme-resolved is stamped by applyTheme, so it can only ever mean a
    // real choice — see theme.ts.
    expect(html).toMatch(/:root\[data-theme-resolved\]\[data-theme='light'\]\s+#boot\s*\{/);
  });

  it('guesses and confirms the identical dark color, so the handoff has no visible step', () => {
    const guess = html.match(
      /@media \(prefers-color-scheme: dark\)\s*{\s*#boot\s*{\s*background:\s*(var\([^)]+\));/,
    )?.[1];
    const confirmed = html.match(
      /:root\[data-theme='dark'\]\s*#boot\s*{\s*background:\s*(var\([^)]+\));/,
    )?.[1];
    expect(guess).toBeTruthy();
    expect(guess).toBe(confirmed);
  });
});

describe('hero font — Newsreader fallback metrics', () => {
  const fontsCss = read('public/fonts/fonts.css');
  const typeRoles = read('src/styles/type-roles.css');

  const fallbackFace = fontsCss.match(
    /@font-face\s*{\s*font-family:\s*'Newsreader Fallback';[\s\S]*?}/,
  )?.[0];

  it('declares a local Newsreader Fallback face (no network request)', () => {
    expect(fallbackFace).toBeTruthy();
    expect(fallbackFace).toMatch(/src:\s*local\(/);
    expect(fallbackFace).not.toMatch(/src:[^;]*url\(/);
  });

  it('carries all four box-matching metric overrides', () => {
    for (const descriptor of [
      'size-adjust',
      'ascent-override',
      'descent-override',
      'line-gap-override',
    ]) {
      expect(fallbackFace).toMatch(new RegExp(`${descriptor}:\\s*[\\d.]+%`));
    }
  });

  it('sits in --font-display between Newsreader and its system fallback, so swap actually uses it', () => {
    const stack = typeRoles.match(/--font-display:\s*([^;]+);/)?.[1] ?? '';
    const order = ["'Newsreader'", "'Newsreader Fallback'", 'Georgia'].map((name) =>
      stack.indexOf(name),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });
});
