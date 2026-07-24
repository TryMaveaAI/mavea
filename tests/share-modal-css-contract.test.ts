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

  it('the JS stacking breakpoint matches the CSS one (no reversed-column band)', () => {
    const cssBreak = shareModalCss.match(/@media\s*\(max-width:\s*(\d+)px\)/)?.[1];
    expect(shareModalSource).toContain(`(max-width: ${cssBreak}px)`);
  });
});
