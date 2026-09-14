// A reader who is told "Web search is off, turn it on in Live's settings" has been told a fact,
// not shown a door. Reported verbatim after finding the dashboard toolbar dead: "I didn't even
// realize" the setting existed — so the copy naming it is only half the fix. Live's settings panel
// is local state, not a route, which is why every surface that needed to send someone here could
// only ever link to "#/live" and leave them to find a row behind a chip, a tab and a scroller.
// `?settings=<row>` makes it reachable, and this pins that: the panel opens, on the right tab,
// with the named row in the document.
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { clearSession } from '../src/live/session/store';

function ready(): void {
  localStorage.setItem('mavea-live-setup-v1', '1');
  setLiveConfigV2({
    provider: 'gemini',
    models: { gemini: 'gemini-3.1-flash-lite' },
    keys: { gemini: 'test-key' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
  window.location.hash = '';
});

describe('Live settings deep link', () => {
  it('opens the panel on the Web search row when the hash names it', async () => {
    ready();
    window.location.hash = '#/live?settings=web-search';
    render(<LiveApp />);
    expect(await screen.findByRole('dialog', { name: /settings/i })).toBeInTheDocument();
    // The row itself, by the id the link is built from — `#ls-<id>` is the whole lookup, so a
    // renamed row breaks this test rather than silently landing readers at the top of a scroller.
    expect(document.querySelector('#ls-web-search')).toBeTruthy();
  });

  it('opens the panel on the model tab for a reader with nothing connected', async () => {
    ready();
    window.location.hash = '#/live?settings=model';
    render(<LiveApp />);
    expect(await screen.findByRole('dialog', { name: /settings/i })).toBeInTheDocument();
  });

  it('leaves the panel shut when the hash names nothing', () => {
    ready();
    window.location.hash = '#/live';
    render(<LiveApp />);
    expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull();
  });

  it('ignores an unknown setting rather than opening on an arbitrary tab', () => {
    ready();
    window.location.hash = '#/live?settings=not-a-real-row';
    render(<LiveApp />);
    expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull();
  });
});
