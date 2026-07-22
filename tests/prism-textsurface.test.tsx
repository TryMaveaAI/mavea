// prism-textsurface.test.tsx — TextSurface (Word/TXT/Markdown/code) is the first non-PDF surface
// with real zoom (font-scale, since a CSS transform would blur reflowed text) and working ink/margin
// notes. Two things could silently break: useAnchoredRects must re-measure the rendered <mark>s on
// every zoom/resize change (not just once — a font-scale change reflows every line, so a stale
// pre-reflow rect would be wrong) instead of caching one measurement forever, and the reel-replay
// path must gracefully render a text beat for TextSurface's necessarily-rasterless annotations
// rather than showing a blank or broken markup slide.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type { Attachment } from '../src/live/attachments';
import { useAnchoredRects } from '../src/live/prism/useAnchoredRects';
import { TextSurface } from '../src/live/prism/TextSurface';
import { DocumentMarkupSlide } from '../src/clip/reel/templates/finishes/documentMarkup';
import { makeZip, toAttachment } from './helpers/officeZip';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => '',
  } as DOMRect;
}

/** Stub ResizeObserver, firing EVERY observed instance's callback — TextSurface attaches two
 *  independent observers (useFitZoom's, inert here, and useAnchoredRects') in the same tree, so a
 *  single shared handle (the pattern elsewhere in this suite) would only fire whichever attached
 *  last. */
function stubResizeObserver(): () => void {
  const fires: (() => void)[] = [];
  class ROStub {
    private readonly cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      fires.push(this.cb);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ROStub);
  return () => {
    if (!fires.length) throw new Error('ResizeObserver was never attached');
    fires.forEach((cb) => cb());
  };
}

describe('useAnchoredRects', () => {
  it('measures the primary mark relative to the surface, divided by the current zoom', () => {
    const surface = document.createElement('div');
    surface.getBoundingClientRect = () => domRect(0, 0, 600, 400);
    const mark = document.createElement('mark');
    mark.setAttribute('data-prism-anchor', 'primary');
    mark.getBoundingClientRect = () => domRect(50, 80, 120, 20);
    surface.appendChild(mark);
    const ref = createRef<HTMLElement | null>();
    (ref as { current: HTMLElement | null }).current = surface;

    const { result } = renderHook(({ zoom }) => useAnchoredRects(ref, zoom, []), {
      initialProps: { zoom: 1 },
    });
    expect(result.current.dims).toEqual({ w: 600, h: 400 });
    expect(result.current.rects).toEqual([{ x: 50, y: 80, w: 120, h: 20 }]);
  });

  it('re-measures on a zoom change instead of reusing the stale pre-reflow numbers', () => {
    const surface = document.createElement('div');
    let surfaceBox = domRect(0, 0, 600, 400);
    surface.getBoundingClientRect = () => surfaceBox;
    const mark = document.createElement('mark');
    mark.setAttribute('data-prism-anchor', 'primary');
    let markBox = domRect(50, 80, 120, 20);
    mark.getBoundingClientRect = () => markBox;
    surface.appendChild(mark);
    const ref = createRef<HTMLElement | null>();
    (ref as { current: HTMLElement | null }).current = surface;

    const { result, rerender } = renderHook(({ zoom }) => useAnchoredRects(ref, zoom, []), {
      initialProps: { zoom: 1 },
    });
    expect(result.current.rects).toEqual([{ x: 50, y: 80, w: 120, h: 20 }]);

    // A bigger font reflowed the column: the surface grew taller and the mark moved down — a REAL
    // reflow, not a uniform re-scale of the old numbers.
    surfaceBox = domRect(0, 0, 600, 520);
    markBox = domRect(50, 140, 150, 25);
    rerender({ zoom: 1.25 });

    expect(result.current.dims).toEqual({ w: 480, h: 416 });
    expect(result.current.rects).toEqual([{ x: 40, y: 112, w: 120, h: 20 }]);
  });

  it('re-measures on a ResizeObserver firing, with no zoom or deps change', () => {
    const fireResize = stubResizeObserver();
    const surface = document.createElement('div');
    let surfaceBox = domRect(0, 0, 600, 400);
    surface.getBoundingClientRect = () => surfaceBox;
    const mark = document.createElement('mark');
    mark.setAttribute('data-prism-anchor', 'primary');
    let markBox = domRect(50, 80, 120, 20);
    mark.getBoundingClientRect = () => markBox;
    surface.appendChild(mark);
    const ref = createRef<HTMLElement | null>();
    (ref as { current: HTMLElement | null }).current = surface;

    const { result } = renderHook(() => useAnchoredRects(ref, 1, []));
    expect(result.current.rects[0]).toEqual({ x: 50, y: 80, w: 120, h: 20 });

    surfaceBox = domRect(0, 0, 600, 460);
    markBox = domRect(50, 110, 120, 20);
    act(() => fireResize());
    expect(result.current.rects[0]).toEqual({ x: 50, y: 110, w: 120, h: 20 });
  });

  it('groups also-N marks by index, densely (no holes for a caller to trip on)', () => {
    const surface = document.createElement('div');
    surface.getBoundingClientRect = () => domRect(0, 0, 600, 400);
    const also1 = document.createElement('mark');
    also1.setAttribute('data-prism-anchor', 'also-1');
    also1.getBoundingClientRect = () => domRect(10, 10, 30, 10);
    surface.appendChild(also1);
    const ref = createRef<HTMLElement | null>();
    (ref as { current: HTMLElement | null }).current = surface;

    const { result } = renderHook(() => useAnchoredRects(ref, 1, []));
    expect(result.current.alsoRects).toHaveLength(2); // index 0 is a dense (empty) hole
    expect(result.current.alsoRects[0]).toEqual([]);
    expect(result.current.alsoRects[1]).toEqual([{ x: 10, y: 10, w: 30, h: 10 }]);
  });
});

describe('TextSurface', () => {
  it('renders the page as a sheet, with the located quote marked, for a DOCX fixture', async () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>The market reaches $87B by 2030.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const doc = toAttachment('report.docx', makeZip({ 'word/document.xml': xml }));

    const { container } = render(
      <TextSurface
        doc={doc}
        source={0}
        page={1}
        quote="reaches $87B by 2030"
        color="var(--presence)"
        kindLabel="FINDING"
        title="Market size"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('.prism-doc-sheet')).toBeTruthy());
    const mark = container.querySelector('mark[data-prism-anchor="primary"]');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toContain('reaches $87B by 2030');
  });

  it('renders a plain-TXT fixture without crashing, and marks the located quote', async () => {
    const txt = 'Intro paragraph.\n\nThe key finding is a 38% increase in signups.\n\nOutro line.';
    const doc: Attachment = {
      name: 'notes.txt',
      mime: 'text/plain',
      data: btoa(txt),
      size: txt.length,
    };

    const { container } = render(
      <TextSurface
        doc={doc}
        source={0}
        page={1}
        quote="38% increase in signups"
        color="var(--insight)"
        kindLabel="STAT"
        title="Signups"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('.prism-doc-sheet')).toBeTruthy());
    expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
      '38% increase in signups',
    );
    expect(screen.getByText(/verbatim quote, on its real page/i)).toBeTruthy();
  });

  it('shows an honest fallback message when the file can’t be read', async () => {
    const doc: Attachment = { name: 'broken.docx', mime: '', data: btoa('not a zip'), size: 9 };
    render(
      <TextSurface
        doc={doc}
        source={0}
        page={1}
        quote="anything"
        color="var(--presence)"
        kindLabel="FINDING"
        title="X"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Couldn.t read this page/i)).toBeTruthy());
  });

  it('records a REAL rect (not empty geometry) when annotated, with pageImage left empty', async () => {
    const fireResize = stubResizeObserver();
    const txt = 'A short note. The important number is 42 percent this quarter.';
    const doc: Attachment = {
      name: 'notes.txt',
      mime: 'text/plain',
      data: btoa(txt),
      size: txt.length,
    };
    const onAnnotated = vi.fn();

    const { container } = render(
      <TextSurface
        doc={doc}
        source={2}
        page={1}
        quote="important number is 42 percent"
        color="var(--insight)"
        kindLabel="STAT"
        title="Growth"
        penOn
        onAnnotated={onAnnotated}
        onClose={vi.fn()}
      />,
    );

    // jsdom never lays anything out (every element reads a 0×0 rect) — stub the two elements
    // useAnchoredRects actually reads, then force its ResizeObserver to remeasure them.
    await waitFor(() => expect(container.querySelector('.prism-doc-text')).toBeTruthy());
    const surface = container.querySelector('.prism-doc-text') as HTMLElement;
    const mark = container.querySelector('mark[data-prism-anchor="primary"]') as HTMLElement;
    surface.getBoundingClientRect = () => domRect(0, 0, 600, 200);
    mark.getBoundingClientRect = () => domRect(30, 60, 200, 18);
    act(() => fireResize());

    await waitFor(() => expect(onAnnotated).toHaveBeenCalled());
    const geo = onAnnotated.mock.calls.at(-1)![0];
    expect(geo.pageImage).toBe(''); // no raster to snapshot — the reel-fallback test below covers this
    expect(geo.rects).toEqual([{ x: 30, y: 60, w: 200, h: 18 }]);
    expect(geo.imgW).toBeGreaterThan(0);
    expect(geo.imgH).toBeGreaterThan(0);
  });
});

// The recorded step above (pageImage: '', real rects) is what the reel replay actually receives —
// confirm it still renders as a clean text beat instead of a blank/broken markup slide. The gate is
// solely `!pageImage` (documentMarkup.tsx); the presence of rects must not change that.
describe('DocumentMarkupSlide — reel replay of a rasterless (TextSurface) annotation', () => {
  it('falls back to a text beat, showing the title + explanation, when pageImage is empty', () => {
    const { container } = render(
      <DocumentMarkupSlide
        slots={{
          pageImage: '',
          imgW: 600,
          imgH: 200,
          rects: [{ x: 30, y: 60, w: 200, h: 18 }],
          isFigure: false,
          seed: '2:1:important number is 42 percent',
          color: '#6a4fd0',
          title: 'A 42% jump this quarter',
          explanation: 'The document leans on this passage.',
        }}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/A 42% jump this quarter/)).toBeTruthy();
    expect(screen.getByText(/document leans on this passage/)).toBeTruthy();
  });
});
