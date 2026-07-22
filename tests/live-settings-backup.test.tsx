// live-settings-backup.test.tsx — the "Your data" tab must state the honest backup contract (keys
// excluded, merge-not-erase, why a raw copy won't travel) and wire the export/import controls, under
// the stored-data disclosure the app-wide legal review requires.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig } from '../src/live/useLiveConfig';

beforeEach(() => {
  localStorage.clear();
  resetLiveConfig();
});

describe('LiveSettings — Your data (backup) tab', () => {
  it('renders the honest backup copy under the stored-data notice', () => {
    render(<LiveSettings initialTab="data" />);
    expect(screen.getByText(/Saved on this browser/i)).toBeInTheDocument();
    expect(screen.getByText(/never included/i)).toBeInTheDocument();
    expect(screen.getByText(/never erases/i)).toBeInTheDocument();
    expect(screen.getByText(/incognito, another\s+port, or another computer/i)).toBeInTheDocument();
  });

  it('wires the export and import controls', () => {
    render(<LiveSettings initialTab="data" />);
    expect(screen.getByRole('button', { name: /Export all my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import a backup/i })).toBeInTheDocument();
  });
});
