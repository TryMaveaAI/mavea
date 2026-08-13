import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shareModalSource = readFileSync(resolve(process.cwd(), 'src/clip/ShareModal.tsx'), 'utf8');
const shareModalCss = readFileSync(resolve(process.cwd(), 'src/clip/share-modal.css'), 'utf8');

describe('ShareModal production styling contract', () => {
  it('ships its shell through a CSP-safe lazy stylesheet', () => {
    expect(shareModalSource).toContain("import './share-modal.css'");
    expect(shareModalSource).not.toContain('<style>{SHEET}</style>');
    expect(shareModalCss).toContain('.shm-scrim');
    expect(shareModalCss).toContain('.shm-modal');
    expect(shareModalCss).toContain('.shm-frame');
  });

  it('centers the reel independently of nested page and modal scrollbars', () => {
    const scrim = shareModalCss.match(/\.shm-scrim\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(scrim).toMatch(/width:\s*100vw/);
    expect(scrim).toMatch(/height:\s*100dvh/);
    expect(scrim).toMatch(/scrollbar-gutter:\s*stable both-edges/);
  });

  it('the Landscape frame leaves room for the control panel beside it (the 14-inch crush)', () => {
    // The modal caps at 1100px with a 480px panel and ~72px gap; a landscape frame wider than
    // ~548px monopolizes the row and wraps the controls into a ragged sliver. The width cap and
    // the stage's ability to shrink are both load-bearing.
    const landscape = shareModalCss.match(/\[data-aspect='16:9'\]\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const cap = Number(landscape.match(/width:\s*min\([^,]+,\s*(\d+)px\)/)?.[1] ?? Infinity);
    expect(cap).toBeLessThanOrEqual(560);
    const stage = shareModalCss.match(/\.shm-stage\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(stage).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(stage).toMatch(/min-width:\s*0/);
  });

  it('the stylesheet alone stacks the modal, in DOM order (no reversed-column band)', () => {
    // The JS used to set an inline flexDirection at the same breakpoint, which always beat the
    // media query — so the stylesheet asserted `column-reverse` while users saw `column`.
    expect(shareModalSource).not.toContain('flexDirection');
    const stacked = shareModalCss.match(/@media[^{]*\{\s*\.shm-modal\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(stacked).toMatch(/flex-direction:\s*column;/);
  });

  it('the tall frames leave room for the modal chrome inside the viewport', () => {
    // 58px of modal padding-top plus the scrim's 24px gutters: a bare 90vh phone frame opened
    // taller than the viewport on every common laptop and hid its own preview controls.
    const portrait = shareModalCss.match(/\[data-aspect='9:16'\]\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(portrait).toMatch(/height:\s*min\(100dvh - 106px/);
  });

  it('centers the mode switcher on its own midpoint', () => {
    const tabs = shareModalCss.match(/\.shm-tabs\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(tabs).toMatch(/left:\s*50%/);
    expect(tabs).toMatch(/translate:\s*-50% 0/);
    // …and the narrow override re-anchors it to the left edge without that shift.
    const narrow = shareModalCss.match(/@media[\s\S]*\.shm-tabs\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(narrow).toMatch(/translate:\s*none/);
  });
});
