// Leaving something you started from the hub must land you back on the hub.
//
// Opening a launcher row used to mark the session STARTED even when no turn followed it. With no
// canvas and nothing on the way, the render fell to the branch meant for a turn in flight — which
// draws an empty stage. You were left on neither the hub nor an answer, with the Create and Share
// menus gone too (they key off having an answer), and no way back except reloading.
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { markSetupDone } from '../src/live/setup/setup';

vi.mock('@ricky0123/vad-web', () => ({
  get MicVAD(): never {
    throw new Error('no VAD in test');
  },
}));

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
  // A returning reader lands on the Go hub — the step the launcher lives on. Without this the
  // wizard opens on Connect and there is no launcher to click.
  markSetupDone();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  localStorage.clear();
  resetLiveConfig();
});

const hubIsUp = () => !!document.querySelector('.start-with');
const findButton = (match: (text: string, el: HTMLButtonElement) => boolean) => {
  const el = [...document.querySelectorAll('button')].find((b) =>
    match((b.textContent || '').trim(), b as HTMLButtonElement),
  );
  if (!el) throw new Error('button not found');
  return el;
};
const clickRow = (label: string) =>
  fireEvent.click(
    findButton((_t, el) => el.querySelector('.start-with-label')?.textContent === label),
  );

describe('the hub is where a launcher row returns you', () => {
  it('opens on the hub with its launcher', () => {
    render(<LiveApp />);
    expect(hubIsUp()).toBe(true);
  });

  it('keeps the hub underneath an overlay row, so closing it has somewhere to land', () => {
    render(<LiveApp />);
    clickRow('Rehearse');
    // Rehearse is a full-page overlay at the app root — it never needed the hub dismissed, and
    // dismissing it is what created the dead end.
    expect(hubIsUp()).toBe(true);
  });

  it('leaves the hub only for a mode that genuinely needs the dock, and comes back after', async () => {
    render(<LiveApp />);
    clickRow('Just listen');
    // This one DOES need the live surface — what it starts lives in the dock the wizard hides.
    await waitFor(() => expect(hubIsUp()).toBe(false));

    fireEvent.click(findButton((_t, el) => el.title === 'Stop banking and go back to answering'));
    // Stopping without ever asking anything used to strand you on the empty stage.
    await waitFor(() => expect(hubIsUp()).toBe(true));
  });
});
