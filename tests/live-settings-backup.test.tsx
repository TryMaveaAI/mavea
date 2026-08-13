// live-settings-backup.test.tsx — the "Your data" tab must state the honest backup contract (keys
// excluded, merge-not-erase, why a raw copy won't travel) and wire the export/import controls, under
// the stored-data disclosure the app-wide legal review requires.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  downloadBackup: vi.fn(),
  importBackup: vi.fn(),
}));

vi.mock('../src/live/backup/backup', () => ({
  MAX_BACKUP_BYTES: 10,
  downloadBackup: mocks.downloadBackup,
  importBackup: mocks.importBackup,
}));

import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig } from '../src/live/useLiveConfig';

function importSummary(overrides: Record<string, unknown> = {}) {
  const section = {
    incoming: 0,
    accepted: 0,
    rejected: 0,
    limit: 10,
    conflicts: 0,
    evictedExisting: 0,
  };
  return {
    dashboards: 0,
    memory: 0,
    flashcards: 0,
    studyStyle: 'collection',
    library: 0,
    atlas: 0,
    courses: 0,
    settingsApplied: false,
    versionAhead: false,
    credentialsIgnored: [],
    warnings: [],
    excludedStores: [],
    durability: 'best-effort-unverified',
    preflight: {
      version: 1,
      versionAhead: false,
      byteLength: 2,
      credentialsPresent: [],
      warnings: [],
      excludedStores: [],
      sections: {},
    },
    sections: {
      dashboards: { ...section },
      memory: { ...section },
      flashcards: { ...section },
      library: { ...section },
      atlas: { ...section },
      courses: { ...section },
    },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetLiveConfig();
  vi.clearAllMocks();
  mocks.downloadBackup.mockResolvedValue(undefined);
  mocks.importBackup.mockResolvedValue(importSummary());
});

afterEach(() => vi.unstubAllGlobals());

describe('LiveSettings — Your data (backup) tab', () => {
  it('renders the honest backup copy under the stored-data notice', () => {
    render(<LiveSettings initialTab="data" />);
    expect(screen.getAllByText(/Saved on this browser/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/never included/i)).toBeInTheDocument();
    expect(screen.getByText(/bounded stores can evict older records/i)).toBeInTheDocument();
    expect(screen.getByText(/ordinary browser storage/i)).toBeInTheDocument();
    expect(screen.getByText(/incognito, another port, browser, or computer/i)).toBeInTheDocument();
  });

  it('wires the export and import controls', () => {
    render(<LiveSettings initialTab="data" />);
    expect(screen.getByRole('button', { name: /Export a backup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import a backup/i })).toBeInTheDocument();
  });

  it('holds backup export in one busy state until the async download completes', async () => {
    let finish!: () => void;
    mocks.downloadBackup.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<LiveSettings initialTab="data" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export a backup' }));
    expect(screen.getByRole('button', { name: 'Exporting backup…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import a backup' })).toBeDisabled();

    await act(async () => finish());
    expect(await screen.findByRole('status')).toHaveTextContent('Backup downloaded.');
  });

  it('rejects an oversized backup before reading or importing it', async () => {
    render(<LiveSettings initialTab="data" />);
    const input = document.querySelector('#ls-panel-data input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(11)], 'oversized.json')] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(mocks.importBackup).not.toHaveBeenCalled();
  });

  it('awaits backup import and announces its merge summary', async () => {
    mocks.importBackup.mockResolvedValue(importSummary({ dashboards: 1, flashcards: 2 }));
    render(<LiveSettings initialTab="data" />);
    const input = document.querySelector('#ls-panel-data input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    expect(screen.getByRole('button', { name: 'Importing backup…' })).toBeDisabled();
    await waitFor(() => expect(mocks.importBackup).toHaveBeenCalledWith('{}'));
    expect(await screen.findByRole('status')).toHaveTextContent('Merged 1 dashboard, 2 cards.');
  });

  it('surfaces credential, validation, conflict, eviction, version, and durability results', async () => {
    const summary = importSummary({
      memory: 1,
      settingsApplied: true,
      versionAhead: true,
      credentialsIgnored: ['provider-api-keys'],
    });
    summary.sections.memory = {
      ...summary.sections.memory,
      incoming: 3,
      accepted: 1,
      rejected: 2,
      conflicts: 1,
      evictedExisting: 1,
    };
    mocks.importBackup.mockResolvedValue(summary);
    render(<LiveSettings initialTab="data" />);
    const input = document.querySelector('#ls-panel-data input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Recognized settings were applied.');
    expect(status).toHaveTextContent('1 incoming ID matched records already present.');
    expect(status).toHaveTextContent('2 entries were rejected as invalid.');
    expect(status).toHaveTextContent('1 existing record was evicted');
    expect(status).toHaveTextContent('Ignored provider API keys');
    expect(status).toHaveTextContent('newer format');
    expect(status).toHaveTextContent('persistence is best-effort');
  });

  it('surfaces a backup import error and clears the busy state for retry', async () => {
    mocks.importBackup.mockRejectedValue(new Error('This backup is corrupted.'));
    render(<LiveSettings initialTab="data" />);
    const input = document.querySelector('#ls-panel-data input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This backup is corrupted.');
    expect(screen.getByRole('button', { name: 'Import a backup' })).toBeEnabled();
  });

  it('aborts a backup FileReader when Settings unmounts', async () => {
    const read = vi.fn();
    const abort = vi.fn();
    class HangingFileReader {
      static readonly EMPTY = 0;
      static readonly LOADING = 1;
      static readonly DONE = 2;
      readyState = HangingFileReader.EMPTY;
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      readAsText(): void {
        read();
        this.readyState = HangingFileReader.LOADING;
      }
      abort(): void {
        abort();
        this.readyState = HangingFileReader.DONE;
        this.onabort?.();
      }
    }
    vi.stubGlobal('FileReader', HangingFileReader as unknown as typeof FileReader);
    const view = render(<LiveSettings initialTab="data" />);
    const input = document.querySelector('#ls-panel-data input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });
    await waitFor(() => expect(read).toHaveBeenCalledOnce());

    view.unmount();
    expect(abort).toHaveBeenCalledOnce();
  });
});
