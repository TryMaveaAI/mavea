// The Forget action is two clicks on one control — never a browser dialog — and it leaves for the
// landing only when the whole sweep succeeded. A partial sweep stays put and says what survived.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkReady: vi.fn(),
  forgetDevice: vi.fn(),
  reloadToLanding: vi.fn(),
}));

vi.mock('../src/live/ready', () => ({ checkLiveReady: mocks.checkReady }));
vi.mock('../src/voice/preview', () => ({ previewVoice: vi.fn(), stopPreview: vi.fn() }));
vi.mock('../src/live/voiceAvailability', () => ({
  useKokoroAvailable: () => true,
  VOICE_OFF_HINT: 'Voice is unavailable.',
  VOICE_MUTED_HINT: 'Voice is muted.',
}));
vi.mock('../src/live/forgetDevice', () => ({
  forgetDevice: mocks.forgetDevice,
  reloadToLanding: mocks.reloadToLanding,
}));

import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig } from '../src/live/useLiveConfig';

beforeEach(() => {
  localStorage.clear();
  resetLiveConfig();
  vi.clearAllMocks();
  mocks.checkReady.mockResolvedValue({ llm: true, model: true });
  mocks.forgetDevice.mockResolvedValue({ failed: [] });
});

describe('LiveSettings — Forget everything on this device', () => {
  it('arms on the first click and forgets only on the second', async () => {
    render(<LiveSettings initialTab="data" />);
    const button = screen.getByRole('button', { name: 'Forget everything on this device' });
    expect(
      screen.getByText(/Removes saved keys, the encryption key that sealed them/),
    ).toBeInTheDocument();

    // It reads as what it is — the one destructive control in Settings — and says when it is armed.
    expect(button).toHaveClass('ls-danger');
    expect(button).not.toHaveAttribute('data-armed');

    fireEvent.click(button);
    expect(button).toHaveTextContent('Confirm: forget everything on this device');
    expect(button).toHaveAttribute('data-armed');
    expect(mocks.forgetDevice).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(mocks.forgetDevice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.reloadToLanding).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays on the page and names what survived when a step failed', async () => {
    mocks.forgetDevice.mockResolvedValue({ failed: ['indexedDB:mavea-key-vault'] });
    render(<LiveSettings initialTab="data" />);
    const button = screen.getByRole('button', { name: 'Forget everything on this device' });

    fireEvent.click(button);
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('indexedDB:mavea-key-vault');
    expect(mocks.reloadToLanding).not.toHaveBeenCalled();
    // The control is back, so the reader can close the other tab and try again.
    expect(screen.getByRole('button', { name: 'Forget everything on this device' })).toBeEnabled();
  });
});
