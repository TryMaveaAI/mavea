import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Block, ConversationSpec } from '../src/data/conversation';

// The real export pipeline lazy-imports modern-screenshot + jsPDF, which need a real browser
// canvas and can't load in jsdom — so we stand in a controllable fake. It drives onProgress and
// honours the abort signal, letting us assert the modal's progress UI, cancel/abort wiring, and
// post-success size readout without ever touching the rasterizer. printDeck is stubbed so Print
// is inert in the test DOM. exportDocToPdf gets the same treatment for the document pipeline —
// buildExportDoc (real, unmocked) still lays the document out in jsdom, so only the final
// raster/PDF step is faked.
const exportDeckToPdf = vi.fn();
vi.mock('../src/export/pipeline/exportDeck', () => ({
  exportDeckToPdf: (...args: unknown[]) => exportDeckToPdf(...args),
  printDeck: vi.fn(() => Promise.resolve()),
}));

const exportDocToPdf = vi.fn();
vi.mock('../src/export/pipeline/exportPdf', () => ({
  exportDocToPdf: (...args: unknown[]) => exportDocToPdf(...args),
}));

import { ExportModal, type ExportAnswer } from '../src/export/ExportModal';
import { ExportCancelledError } from '../src/export/pipeline/raster';

function block(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    col: 12,
    props: { title, summary: `${title} explained` },
  } as Block;
}

function spec(title: string, blocks: Block[]): ConversationSpec {
  return {
    id: 'live',
    workspace: 'Live',
    title,
    sub: title,
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

function answer(index: number, title: string): ExportAnswer {
  return { index, label: title, spec: spec(title, [block('a', 'Revenue'), block('b', 'Costs')]) };
}

beforeEach(() => {
  exportDeckToPdf.mockReset();
  exportDocToPdf.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ExportModal — defaultIndices pre-selects a composed thread', () => {
  it('pre-checks every answer in defaultIndices, not just defaultIndex', () => {
    const answers = [answer(0, 'First'), answer(1, 'Second'), answer(2, 'Third')];
    const { getAllByRole } = render(
      <ExportModal answers={answers} defaultIndex={2} defaultIndices={[0, 2]} onClose={() => {}} />,
    );
    const pressed = () =>
      getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    expect(pressed().some((t) => t?.includes('First'))).toBe(true);
    expect(pressed().some((t) => t?.includes('Second'))).toBe(false);
    expect(pressed().some((t) => t?.includes('Third'))).toBe(true);
  });

  it('falls back to defaultIndex alone when defaultIndices is empty or omitted', () => {
    const answers = [answer(0, 'First'), answer(1, 'Second')];
    const { getAllByRole } = render(
      <ExportModal answers={answers} defaultIndex={1} defaultIndices={[]} onClose={() => {}} />,
    );
    const pressed = () =>
      getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    expect(pressed().some((t) => t?.includes('First'))).toBe(false);
    expect(pressed().some((t) => t?.includes('Second'))).toBe(true);
  });
});

describe('ExportModal — progress, cancel, and size', () => {
  it('shows a live progress bar driven by the pipeline, then the final file size', async () => {
    // Resolve the export only when we say so, so we can observe the in-flight progress state.
    let resolveExport!: (blob: Blob) => void;
    exportDeckToPdf.mockImplementation(
      (
        _slides: unknown,
        _skin: unknown,
        opts: { onProgress?: (done: number, total: number) => void },
      ) => {
        opts.onProgress?.(0, 3);
        opts.onProgress?.(2, 3);
        return new Promise<Blob>((resolve) => {
          resolveExport = resolve;
        });
      },
    );

    const { getByText, getByRole, queryByRole } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );

    fireEvent.click(getByText('Download PDF'));

    // The progressbar reflects the latest onProgress tick.
    const bar = await waitFor(() => getByRole('progressbar'));
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    getByText('2 / 3 slides');

    // jsPDF would return a real Blob; a 2.4 MB stand-in exercises the size formatter (→ "2.4 MB").
    resolveExport(new Blob([new Uint8Array(2_516_582)]));

    await waitFor(() => getByText('2.4 MB'));
    // Progress clears once the run finishes.
    expect(queryByRole('progressbar')).toBeNull();
  });

  it('Cancel aborts the in-flight export and stays quiet (no error)', async () => {
    let abortedSeen = false;
    exportDeckToPdf.mockImplementation(
      (_slides: unknown, _skin: unknown, opts: { signal?: AbortSignal }) =>
        new Promise<Blob>((_resolve, reject) => {
          // Mirror the real pipeline: reject with ExportCancelledError when the signal fires.
          opts.signal?.addEventListener('abort', () => {
            abortedSeen = true;
            reject(new ExportCancelledError());
          });
        }),
    );

    const { getByText, queryByText } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );

    fireEvent.click(getByText('Download PDF'));
    const cancel = await waitFor(() => getByText('Cancel'));
    fireEvent.click(cancel);

    await waitFor(() => expect(abortedSeen).toBe(true));
    // A user cancel is expected — the modal returns to idle with no error and no size readout.
    await waitFor(() => getByText('Download PDF'));
    expect(queryByText(/Could not generate|timed out|renderer unavailable/)).toBeNull();
    expect(queryByText('Cancel')).toBeNull();
  });

  it('surfaces a distinct message for a timeout vs a generic failure', async () => {
    const { ExportTimeoutError } = await import('../src/export/pipeline/raster');
    exportDeckToPdf.mockRejectedValueOnce(new ExportTimeoutError());

    const { getByText, getAllByText } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    fireEvent.click(getByText('Download PDF'));
    // The timeout copy shows in the visible error line AND is announced in the aria-live region.
    await waitFor(() => expect(getAllByText(/timed out/).length).toBeGreaterThanOrEqual(2));
  });

  it('aborts the running export when the modal unmounts (no leaked work)', async () => {
    let signal: AbortSignal | undefined;
    exportDeckToPdf.mockImplementation(
      (_slides: unknown, _skin: unknown, opts: { signal?: AbortSignal }) => {
        signal = opts.signal;
        return new Promise<Blob>(() => {}); // never settles on its own
      },
    );

    const { getByText, unmount } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    fireEvent.click(getByText('Download PDF'));
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('Select all / none keeps at least the default answer selected', async () => {
    const answers = [answer(0, 'First'), answer(1, 'Second'), answer(2, 'Third')];
    const { getByText, getAllByRole } = render(
      <ExportModal answers={answers} defaultIndex={1} onClose={() => {}} />,
    );

    // Only the default starts selected (the rows are pressed when included).
    const pressed = () =>
      getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');

    fireEvent.click(getByText('Select all'));
    await waitFor(() => getByText('Select none'));

    fireEvent.click(getByText('Select none'));
    // Collapsing never empties the selection — the default answer remains.
    await waitFor(() => getByText('Select all'));
    expect(pressed().some((b) => b.textContent?.includes('Second'))).toBe(true);
  });
});

describe('ExportModal — the document pipeline gets the same progress/cancel/metadata wiring as the deck', () => {
  /** Switch to Document and wait for the (real, unmocked) layout pass to finish. */
  async function openDocumentModal(answers: ExportAnswer[]) {
    const utils = render(
      <ExportModal answers={answers} defaultIndex={answers.length - 1} onClose={() => {}} />,
    );
    fireEvent.click(utils.getByText('Document'));
    await waitFor(() => expect(utils.getByText('Download PDF')).not.toBeDisabled());
    return utils;
  }

  it('shows a live progress bar with page (not slide) copy, driven by the pipeline', async () => {
    let resolveExport!: (blob: Blob) => void;
    exportDocToPdf.mockImplementation(
      (
        _doc: unknown,
        _skin: unknown,
        opts: { onProgress?: (done: number, total: number) => void },
      ) => {
        opts.onProgress?.(0, 2);
        opts.onProgress?.(1, 2);
        return new Promise<Blob>((resolve) => {
          resolveExport = resolve;
        });
      },
    );

    const { getByText, getByRole, queryByRole } = await openDocumentModal([
      answer(0, 'Quarterly review'),
    ]);
    fireEvent.click(getByText('Download PDF'));

    const bar = await waitFor(() => getByRole('progressbar'));
    expect(bar).toHaveAttribute('aria-label', 'Exporting pages');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    getByText('1 / 2 pages');

    resolveExport(new Blob([new Uint8Array(2048)]));
    await waitFor(() => getByText('2.0 KB'));
    expect(queryByRole('progressbar')).toBeNull();
  });

  it('Cancel aborts an in-flight document export and stays quiet (no error)', async () => {
    let abortedSeen = false;
    exportDocToPdf.mockImplementation(
      (_doc: unknown, _skin: unknown, opts: { signal?: AbortSignal }) =>
        new Promise<Blob>((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            abortedSeen = true;
            reject(new ExportCancelledError());
          });
        }),
    );

    const { getByText, queryByText } = await openDocumentModal([answer(0, 'Quarterly review')]);
    fireEvent.click(getByText('Download PDF'));
    const cancel = await waitFor(() => getByText('Cancel'));
    fireEvent.click(cancel);

    await waitFor(() => expect(abortedSeen).toBe(true));
    // A user cancel is expected — the modal returns to idle with no error and no size readout.
    await waitFor(() => getByText('Download PDF'));
    expect(queryByText(/Could not generate|timed out|renderer unavailable/)).toBeNull();
    expect(queryByText('Cancel')).toBeNull();
  });

  it('supplies the real title/topic/sources as the PDF properties, authored as Mavea', async () => {
    exportDocToPdf.mockResolvedValue(new Blob(['pdf']));
    const { getByText } = await openDocumentModal([answer(0, 'Quarterly review')]);
    fireEvent.click(getByText('Download PDF'));

    await waitFor(() => expect(exportDocToPdf).toHaveBeenCalled());
    const opts = exportDocToPdf.mock.calls[0][2] as {
      properties?: { title?: string; author?: string; creator?: string };
    };
    expect(opts.properties?.title).toBe('Quarterly review');
    expect(opts.properties?.author).toBe('Mavea');
    expect(opts.properties?.creator).toBe('Mavea');
  });

  it('defaults the page-size control to Letter/A4 by locale, and the choice reaches the exported doc', async () => {
    // Own-property shadow on the instance (not the prototype getter jsdom defines) — cleanly
    // removable afterward regardless of how the environment implements `navigator.language`.
    const original = Object.getOwnPropertyDescriptor(navigator, 'language');
    const setLanguage = (lang: string) =>
      Object.defineProperty(navigator, 'language', { value: lang, configurable: true });

    try {
      setLanguage('en-US');
      const us = await openDocumentModal([answer(0, 'Quarterly review')]);
      expect(us.getByText('Letter').getAttribute('aria-pressed')).toBe('true');
      expect(us.getByText('A4').getAttribute('aria-pressed')).toBe('false');
      us.unmount();

      setLanguage('en-GB');
      const gb = await openDocumentModal([answer(0, 'Quarterly review')]);
      expect(gb.getByText('A4').getAttribute('aria-pressed')).toBe('true');

      exportDocToPdf.mockResolvedValue(new Blob(['pdf']));
      fireEvent.click(gb.getByText('Letter'));
      // The format switch re-triggers the async layout pass — wait for it to finish (the button
      // re-enables) before downloading, or the click lands on a still-disabled button.
      await waitFor(() => expect(gb.getByText('Download PDF')).not.toBeDisabled());
      fireEvent.click(gb.getByText('Download PDF'));
      await waitFor(() => expect(exportDocToPdf).toHaveBeenCalled());
      const doc = exportDocToPdf.mock.calls[0][0] as { format: string };
      expect(doc.format).toBe('letter'); // the user's override wins over the locale default
    } finally {
      if (original) Object.defineProperty(navigator, 'language', original);
      else delete (navigator as { language?: string }).language;
    }
  });

  it('never shows the page-size control for the presentation (deck) format', async () => {
    const { getByText, queryByText } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    expect(getByText('Presentation').getAttribute('aria-pressed')).toBe('true');
    expect(queryByText('Page size')).toBeNull();
  });
});

describe('ExportModal — per-slide skip', () => {
  it('a skipped slide leaves the exported file, and only the file', async () => {
    let exported: { id: string }[] = [];
    exportDeckToPdf.mockImplementation((slides: unknown) => {
      exported = slides as { id: string }[];
      return Promise.resolve(new Blob(['x']));
    });

    const { getByText, queryByText } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );

    // The preview opens on the cover — cross it out. The navigator still shows every slide;
    // only the file's slide list shrinks, and the note says so.
    fireEvent.click(getByText('Skip slide'));
    getByText(/^\d+ of \d+ slides in the file$/);

    fireEvent.click(getByText('Download PDF'));
    await waitFor(() => expect(exportDeckToPdf).toHaveBeenCalled());
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.some((s) => s.id === 'cover')).toBe(false);

    // Putting it back clears the note — the full deck exports again.
    fireEvent.click(getByText('Include slide'));
    expect(queryByText(/slides in the file$/)).toBeNull();
  });
});
