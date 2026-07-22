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
});
