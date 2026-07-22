import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Staging files on the Synthesis surface reads them in the browser. A read that blows up — an
// unreadable file, a hostile archive, a revoked permission — used to leave the drop zone stuck on
// "Reading…" forever, with the file inputs still holding their old value, so re-picking the same
// folder fired no change event and the only way out was a reload. Staging must always hand the
// surface back, and say what happened.

const filesToCorpus = vi.fn();
vi.mock('../src/live/prism/synthesis/ingest', () => ({
  filesToCorpus: (...a: unknown[]) => filesToCorpus(...a),
  MAX_CORPUS_SOURCES: 40,
}));

import { SynthesisApp } from '../src/live/prism/SynthesisApp';
import { MAX_DOCUMENT_BYTES } from '../src/live/attachments';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function pickFile(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Synthesis staging', () => {
  it('recovers the drop zone when a file read fails', async () => {
    filesToCorpus.mockRejectedValue(new Error('unreadable'));
    render(<SynthesisApp />);

    pickFile();

    // The spinner must clear and the failure must be explained — not left mid-read.
    await waitFor(() => {
      expect(screen.queryByText('Reading…')).toBeNull();
    });
    expect(screen.getByText(/couldn't be read/i)).toBeTruthy();

    // And the input is reset, so re-picking the very same folder fires a fresh change event
    // instead of silently doing nothing.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('tells the user plainly when nothing readable was found', async () => {
    filesToCorpus.mockResolvedValue({ sources: [] });
    render(<SynthesisApp />);

    pickFile();

    await waitFor(() => {
      expect(screen.getByText(/No readable sources found/i)).toBeTruthy();
    });
    expect(screen.queryByText('Reading…')).toBeNull();
  });

  // A .zip is deliberately read RAW (fileToAttachment's guard can't apply — the members inside are
  // what get type-checked), and that raw read had no size gate of its own: an oversized archive was
  // pulled into memory whole, then again as base64, taking the tab down with no message at all. The
  // ZIP reader's inflate budget is written assuming this gate exists.
  it('refuses an archive past the document size cap instead of reading it into memory', async () => {
    filesToCorpus.mockResolvedValue({ sources: [] });
    render(<SynthesisApp />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const zip = new File(['PK'], 'data-room.zip', { type: 'application/zip' });
    Object.defineProperty(zip, 'size', { value: MAX_DOCUMENT_BYTES + 1 });
    // A read would have to go through this — it must never be called for an oversized archive.
    const read = vi.spyOn(zip, 'arrayBuffer');
    Object.defineProperty(input, 'files', { value: [zip], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/too large/i)).toBeTruthy();
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText('Reading…')).toBeNull();
  });
});
