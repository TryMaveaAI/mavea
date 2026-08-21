// One indicator for one wait.
//
// The static boot splash (index.html #boot) and the Suspense fallback draw the SAME orb — same
// size, same gradient, same 1.1s pulse — by design, so the handoff would be invisible. But they are
// two separate animations with independent clocks, so painting the second over the first restarts
// the pulse from phase zero and the orb visibly snaps. That was the flash on a cold surface load,
// and it looked random because it depended only on where in the cycle the bundle finished.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SurfaceFallback } from '../src/RootBoundary';

const mainSrc = readFileSync(join(__dirname, '../src/main.tsx'), 'utf8');

afterEach(() => {
  cleanup();
  document.getElementById('boot')?.remove();
});

function bootSplash(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'boot';
  document.body.appendChild(el);
  return el;
}

describe('the loading orb never restarts mid-pulse', () => {
  it('renders nothing while the boot splash is still holding the screen', () => {
    bootSplash();
    const { container } = render(<SurfaceFallback />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders its own orb once the splash is gone', () => {
    const { container } = render(<SurfaceFallback />);
    expect(container.querySelector('.surface-fallback-orb')).toBeTruthy();
  });

  it('takes over the moment the splash is removed — a later route change still shows it', () => {
    const splash = bootSplash();
    const first = render(<SurfaceFallback />);
    expect(first.container).toBeEmptyDOMElement();
    cleanup();
    splash.remove();
    const later = render(<SurfaceFallback />);
    expect(later.container.querySelector('.surface-fallback-orb')).toBeTruthy();
  });
});

describe('the splash is retired by the SURFACE, not by the root', () => {
  it('removes #boot only when something mounts inside Suspense', () => {
    // Root used to retire the splash on its own first commit — which happens while the lazy
    // surface chunk is still downloading, pulling the cover off exactly when it was still needed.
    expect(mainSrc).toMatch(/function RetireBootSplash/);
    const suspenseBody = /<Suspense fallback=\{<SurfaceFallback \/>\}>([\s\S]*?)<\/Suspense>/.exec(
      mainSrc,
    )?.[1];
    expect(suspenseBody).toContain('<RetireBootSplash />');
  });

  it('no longer retires it from Root itself', () => {
    const rootBody = /function Root\(\)[\s\S]*?\n}/.exec(mainSrc)?.[0] ?? '';
    expect(rootBody).not.toContain("getElementById('boot')");
  });
});
