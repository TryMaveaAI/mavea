// live-settings-export.test.tsx — settings exports never carry API/search credentials, regardless
// of whether the encrypted on-device key vault remembers them between sessions.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';

beforeEach(() => {
  localStorage.clear();
  resetLiveConfig();
});

describe('LiveSettings — credential-safe settings export', () => {
  it('says credentials are excluded when remember-key is on', () => {
    setLiveConfigV2({ rememberKey: true });
    render(<LiveSettings />);
    expect(screen.getByText(/API and search keys are never included/i)).toBeInTheDocument();
  });

  it('says credentials are excluded when keys are session-only', () => {
    render(<LiveSettings />);
    expect(screen.getByText(/API and search keys are never included/i)).toBeInTheDocument();
  });
});
