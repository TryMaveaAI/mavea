// demo-boot.test.tsx — booting the Live surface in demo replay mode. A stashed persona (the
// landing card hand-off) must mount the demo chrome with NO setup wizard and no key; a
// garbage ?demo= id must fall back to the ordinary boot instead of stranding the visitor on
// an empty stage. Mirrors app-smoke's deterministic setup: fetch is stubbed so mount probes
// never touch the network.
import { render, cleanup, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LegalGate } from '../src/legal/LegalGate';
import { LiveApp } from '../src/live/LiveApp';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('LiveApp — demo replay boot', () => {
  it('a stashed demo persona boots the demo chrome, not the setup wizard', () => {
    sessionStorage.setItem('mavea-demo-persona', 'cfo');
    const { container } = render(<LiveApp />);
    expect(container.querySelector('.demox')).not.toBeNull();
    expect(container.querySelector('.setup')).toBeNull();
  });

  it('a ?demo= deep link boots the same way', () => {
    window.location.hash = '#/live?demo=student';
    const { container } = render(<LiveApp />);
    expect(container.querySelector('.demox')).not.toBeNull();
    expect(container.querySelector('.setup')).toBeNull();
  });

  it('an unknown persona id falls back to the ordinary boot', () => {
    sessionStorage.setItem('mavea-demo-persona', 'not-a-real-persona');
    const { container } = render(<LiveApp />);
    expect(container.querySelector('.demox')).toBeNull();
  });

  it('consumes the one-shot flag on mount (a later plain boot is clean)', () => {
    sessionStorage.setItem('mavea-demo-persona', 'cfo');
    render(<LiveApp />);
    expect(sessionStorage.getItem('mavea-demo-persona')).toBeNull();
  });

  it('lets the deck present itself on the demo replay, not only the tour', () => {
    // The "presents itself" beat opens PresentationDeck; auto-advance used to be gated on tour
    // mode alone, so the demo sat on the cover slide for the whole chapter and showed nothing.
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(live).toMatch(/autoAdvanceMs=\{tourMode\.current \|\| demoPersona\.current \? \d+ :/);
  });

  it('hands the user’s annotation settings back when a pen beat borrowed them', () => {
    // A pen chapter persists annotationsEnabled + teachMode so Mavéa can draw. Without a restore
    // path, watching the tour or a demo permanently flips a real user's setting.
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(live).toMatch(/penConfigRestoreRef\.current \?\?= \{ annotationsEnabled, teachMode \}/);
    // Restored when the run ends, and again on unmount (leaving Live mid-run).
    expect(live).toMatch(/if \(tourDrive\.done \|\| demoDrive\.done\) restorePenConfig\(\)/);
    expect(live).toMatch(/useEffect\(\(\) => \(\) => restorePenConfig\(\), \[restorePenConfig\]\)/);
    // …but a toggle the user makes themselves mid-run drops the snapshot and stands.
    expect(live).toMatch(
      /penConfigRestoreRef\.current = null;\n\s*setLiveConfigV2\(\{ annotationsEnabled: next/,
    );
  });

  it('does not mount provider, voice, or settings controls before legal acceptance', () => {
    sessionStorage.setItem('mavea-demo-persona', 'cfo');
    const { container } = render(
      <LegalGate>
        <LiveApp />
      </LegalGate>,
    );

    expect(screen.getByRole('heading', { name: 'Before using connected features' })).toBeVisible();
    expect(container.querySelector('.composer-input')).toBeNull();
    expect(container.querySelector('.live-model-chip')).toBeNull();
    expect(container.querySelector('.send-btn')).toBeNull();
    expect(container.querySelector('.composer-tool')).toBeNull();
    expect(container.querySelector('.mic-btn')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
