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

const printDoc = vi.fn();
vi.mock('../src/export/pipeline/printFallback', () => ({
  printDoc: (...args: unknown[]) => printDoc(...args),
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
  printDoc.mockReset();
  printDoc.mockResolvedValue(undefined);
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
    await waitFor(() => getByText('Just this answer'));

    fireEvent.click(getByText('Just this answer'));
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

  it('supplies the real title/topic/sources as the PDF properties, authored as Mavéa', async () => {
    exportDocToPdf.mockResolvedValue(new Blob(['pdf']));
    const { getByText } = await openDocumentModal([answer(0, 'Quarterly review')]);
    fireEvent.click(getByText('Download PDF'));

    await waitFor(() => expect(exportDocToPdf).toHaveBeenCalled());
    const opts = exportDocToPdf.mock.calls[0][2] as {
      properties?: { title?: string; author?: string; creator?: string };
    };
    expect(opts.properties?.title).toBe('Quarterly review');
    expect(opts.properties?.author).toBe('Mavéa');
    expect(opts.properties?.creator).toBe('Mavéa');
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

  // Regression: the preview scales the page stack with a transform, which leaves the LAYOUT box at
  // full size — so the scroll area ran on into ~44% of empty void below the last page.
  it('sizes the scaled preview to the real height of the page stack, with no void below it', async () => {
    const { container } = await openDocumentModal([answer(0, 'Quarterly review')]);

    const scaled = container.querySelector('.ex-doc')!.parentElement!;
    const box = scaled.parentElement!;
    const pages = container.querySelectorAll('.ex-page').length;
    expect(pages).toBeGreaterThan(0);

    // Letter (the jsdom locale default) at the wide layout's 460px preview column.
    const scale = 460 / 816;
    expect(parseFloat(box.style.width)).toBeCloseTo(816 * scale, 1);
    expect(parseFloat(box.style.height)).toBeCloseTo((1056 * pages + 40 * (pages - 1)) * scale, 1);
    // The transform overhangs that box by design — clipping is what keeps the scroll honest.
    expect(box.style.overflow).toBe('hidden');
  });

  // Dragging the custom-colour input fires continuously, and the accent only ever paints colour —
  // re-measuring and re-paginating the whole document on every pixel of that drag was pure waste.
  it('repaints on an accent change without re-running the offscreen layout pass', async () => {
    const { container, getByLabelText, getByText, queryByText } = await openDocumentModal([
      answer(0, 'Quarterly review'),
    ]);

    fireEvent.click(getByLabelText('Accent Brick'));

    expect(queryByText('Composing…')).toBeNull();
    expect(getByText('Download PDF')).not.toBeDisabled();
    // …and the preview still shows the new accent, straight from the render props.
    expect(container.querySelector('.ex-page')?.getAttribute('style')).toContain('#7A2E33');
  });

  it('offers no dead Cancel while printing, and says so when the dialog never opens', async () => {
    let rejectPrint!: (err: Error) => void;
    printDoc.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPrint = reject;
        }),
    );

    const { getByText, getAllByText, queryByText } = await openDocumentModal([
      answer(0, 'Quarterly review'),
    ]);
    fireEvent.click(getByText('Print'));

    await waitFor(() => expect(printDoc).toHaveBeenCalled());
    // A print is the browser's own dialog — there is nothing for Cancel to abort.
    expect(queryByText('Cancel')).toBeNull();
    expect(getByText('Print')).toBeDisabled();

    rejectPrint(new Error('popup blocked'));
    // Shown in the error line AND announced in the aria-live region.
    await waitFor(() =>
      expect(getAllByText('Could not open the print dialog — try again.').length).toBe(2),
    );
    await waitFor(() => expect(getByText('Print')).not.toBeDisabled());
  });
});

describe('ExportModal — the panel stacks before its preview can be clipped', () => {
  /** Answer the modal's own `(max-width: Npx)` query against a viewport of `width`. */
  function mockViewport(width: number) {
    window.matchMedia = ((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return {
        matches: max ? width <= Number(max[1]) : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }) as unknown as typeof window.matchMedia;
  }

  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // Regression: between 641 and 790px the two-column panel gave the preview a column narrower than
  // the 460px page it renders — centred inside an overflow:hidden area, so both edges were cut off
  // with no way to scroll to them.
  it('uses the stacked layout at 700px, where the wide preview column cannot hold the page', () => {
    mockViewport(700);
    const { getByRole } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    expect(getByRole('dialog').style.gridTemplateColumns).toBe('1fr');
  });

  it('keeps the two-column layout on a roomy viewport', () => {
    mockViewport(1200);
    const { getByRole } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    expect(getByRole('dialog').style.gridTemplateColumns).toBe('300px 1fr');
  });

  // The ✕ used to live only in the preview area — the SECOND row of the stacked panel, i.e. below
  // the fold on a phone, leaving no visible way out.
  it('renders exactly one ✕, reachable from the top of the panel when stacked', () => {
    mockViewport(700);
    const { getByLabelText, getAllByLabelText, getByRole } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );
    expect(getAllByLabelText('Close')).toHaveLength(1);

    const close = getByLabelText('Close');
    // Pinned inside the FIRST row of the stacked panel (the controls), not the preview below it.
    expect(close.style.position).toBe('sticky');
    expect(getByRole('dialog').firstElementChild?.contains(close)).toBe(true);
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

  it('drops the measured size once the slide list changes under it', async () => {
    exportDeckToPdf.mockResolvedValue(new Blob(['0123456789']));
    const { getByText, queryByText } = render(
      <ExportModal answers={[answer(0, 'Quarterly review')]} defaultIndex={0} onClose={() => {}} />,
    );

    fireEvent.click(getByText('Download PDF'));
    // The exact size of the file that was just written — no "~".
    await waitFor(() => expect(getByText(/^\d+(\.\d+)? (B|KB|MB)$/)).toBeInTheDocument());

    // Crossing a slide out makes that file a different file. Reporting its old byte count, still
    // without the "~", claimed an exact size for something that no longer exists.
    fireEvent.click(getByText('Skip slide'));
    await waitFor(() => expect(getByText(/^~ /)).toBeInTheDocument());
    expect(queryByText(/^\d+(\.\d+)? (B|KB|MB)$/)).toBeNull();
  });
});
