import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '../src/live/attachments';
import type { RenderedPage } from '../src/live/prism/extractPdf';
// The real (unmocked-below) implementation — used to compute the exact widths the effect should
// have asked for, so the test doesn't hardcode numbers that would silently drift from the source.
import { pickRasterWidth } from '../src/live/prism/extractPdf';

// PageView renders the real PDF page (pdf.js → canvas) imperatively into a holder, then flips state
// to 'ready'. A regression once made the holder ALSO hold React-rendered status children, so when
// React re-rendered after the imperative replaceChildren it tried to removeChild a node pdf.js had
// already swapped — crashing the whole app to a blank screen. This test pins that the load→ready
// transition mounts the canvas and never throws.

const renderMock = vi.fn();
vi.mock('../src/live/prism/extractPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/prism/extractPdf')>();
  return {
    ...actual,
    // pickRasterWidth/cappedDevicePixelRatio are pure and safe under jsdom — keep the real ones so
    // the sizing math this test isn't about stays exercised as written, not stubbed to a constant.
    renderPageWithHighlight: (...args: unknown[]) => renderMock(...args),
  };
});

const { PdfSurface: PageView } = await import('../src/live/prism/PdfSurface');

const pdf: Attachment = { name: 'doc.pdf', mime: 'application/pdf', data: 'AA==', size: 4 };

afterEach(() => {
  cleanup();
  renderMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeCanvas(w = 400, h = 560): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Give the (layout-less) jsdom scroll container a concrete size for the fit math to read. */
function sizeScroll(container: HTMLElement, w: number, h: number): HTMLDivElement {
  const scroll = container.querySelector('.prism-page-scroll') as HTMLDivElement;
  Object.defineProperty(scroll, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(scroll, 'clientHeight', { value: h, configurable: true });
  return scroll;
}

/** Stub ResizeObserver with a handle to fire the observed callback, like a real panel resize. */
function stubResizeObserver(): () => void {
  let fire: (() => void) | null = null;
  class ROStub {
    private readonly cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      fire = this.cb;
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ROStub);
  return () => {
    if (!fire) throw new Error('ResizeObserver was never attached');
    fire();
  };
}

describe('PageView', () => {
  it('mounts the rendered canvas and shows highlight marks without crashing on load→ready', async () => {
    renderMock.mockResolvedValue({
      canvas: makeCanvas(),
      rects: [{ x: 10, y: 20, w: 120, h: 14 }],
    });

    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="a real quote"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );

    // starts in the loading state
    expect(screen.getByText(/Rendering page 3/)).toBeTruthy();

    // resolves to ready: the canvas is swapped into the holder, a highlight mark renders, no throw
    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeTruthy();
    });
    expect(container.querySelector('.prism-page-mark')).toBeTruthy();
    expect(screen.queryByText(/Rendering page 3/)).toBeNull();
  });

  it('falls back to a useful grounded excerpt when the page cannot be rendered twice', async () => {
    renderMock.mockResolvedValue(null);
    render(
      <PageView
        pdf={pdf}
        source={0}
        page={5}
        quote="q"
        color="var(--danger)"
        kindLabel="RISK"
        title="A risk"
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Page preview unavailable')).toBeTruthy();
    });
    expect(screen.getByText('“q”')).toBeTruthy();
    expect(screen.getByText(/Verbatim text grounded to page 5/)).toBeTruthy();
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a valid page visible when only its optional sharpness re-render fails', async () => {
    const fireResize = stubResizeObserver();
    renderMock
      .mockResolvedValueOnce({ canvas: makeCanvas(400, 560), rects: [] })
      .mockResolvedValue(null);
    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={4}
        quote="a grounded quote"
        color="var(--presence)"
        kindLabel="DEFINITION"
        title="Incentive model analogy"
        onClose={() => {}}
      />,
    );
    sizeScroll(container, 900, 700);
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());

    vi.useFakeTimers();
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(container.querySelector('canvas')).toBeTruthy();
    expect(screen.queryByText('Page preview unavailable')).toBeNull();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
  });

  it('renders the source document name in the header in multi-PDF mode', async () => {
    renderMock.mockResolvedValue({ canvas: makeCanvas(), rects: [] });
    render(
      <PageView
        pdf={pdf}
        source={0}
        page={2}
        quote="q"
        color="var(--insight)"
        kindLabel="STAT"
        title="A stat"
        docName="Paper B.pdf"
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Paper B — A stat/)).toBeTruthy();
    });
  });

  // Resize-feedback regressions. At panel widths where the fitted page height sat right at the
  // container height, the scrollbar toggled on every fit and each toggle re-fired the resize
  // observer — the page "shook" at frame rate and the debounced sharp re-render never landed.
  // The CSS half of the fix (scrollbar-gutter: stable) can't run under jsdom; these pin the JS
  // invariants that keep the loop broken.
  it('reserves the margin-note gutter in both fit modes so the fitted page never overflows sideways', async () => {
    renderMock.mockResolvedValue({
      canvas: makeCanvas(),
      rects: [{ x: 10, y: 20, w: 120, h: 14 }],
    });
    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="a real quote"
        note="Why this passage matters"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    // Tall container so fit-screen is width-bound — the axis the gutter reserve lives on.
    sizeScroll(container, 800, 10000);
    await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    const unitWidth = () =>
      parseFloat((container.querySelector('.prism-page-unit') as HTMLDivElement).style.width);
    // Fit-width (the default): page + notes gutter must exactly fill the padded container width —
    // one extra pixel summons a horizontal scrollbar, which resizes the container and re-fits.
    await waitFor(() => expect(unitWidth()).toBeCloseTo(800 - 32, 4));

    // Fit-screen scales only the page, so it must reserve the gutter too.
    fireEvent.click(screen.getByLabelText('Fit whole page'));
    expect(unitWidth()).toBeCloseTo(800 - 32, 4);
  });

  it('re-rasters when a bigger panel would gain pixels, at the width the panel actually shows', async () => {
    const fireResize = stubResizeObserver();
    renderMock.mockResolvedValue({ canvas: makeCanvas(), rects: [] });
    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="q"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    sizeScroll(container, 800, 600);
    // The canvas is swapped in imperatively before React commits 'ready' — wait for a ready-gated
    // control so the resize observer (a post-commit effect) is guaranteed to be attached.
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());
    expect(renderMock).toHaveBeenCalledTimes(1);

    // The 400px canvas can't show an 800px panel sharply — the debounced re-raster fires, sized
    // for the panel (pickRasterWidth(800) = 920).
    vi.useFakeTimers();
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock.mock.calls[1][3]).toBe(920);
  });

  it('stops re-rastering at the raster-width ceiling instead of looping the loading flash', async () => {
    const fireResize = stubResizeObserver();
    // A canvas already at the ceiling (pickRasterWidth caps at 1900; jsdom dpr is 1).
    renderMock.mockResolvedValue({ canvas: makeCanvas(1900, 2660), rects: [] });
    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="q"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    // Panel wider than the canvas can show sharply — but a re-raster would pick 1900 again, so
    // re-rendering must NOT be scheduled (it would flash the loading state on every resize).
    sizeScroll(container, 2200, 1200);
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());
    expect(renderMock).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  // The resize-flicker fix: a re-raster triggered ONLY by the panel settling at a new size (not a
  // navigation to a different claim) must never blank the page — the old canvas stays on screen,
  // in the DOM, until the new one is fully drawn and ready to take its place.
  it('re-rasters silently on a resize: no loading flash, and the old canvas is never detached before the new one replaces it', async () => {
    const fireResize = stubResizeObserver();
    const firstCanvas = makeCanvas(400, 560);
    let resolveSecond: (page: RenderedPage) => void = () => {};
    const secondRaster = new Promise<RenderedPage>((resolve) => {
      resolveSecond = resolve;
    });
    renderMock
      .mockResolvedValueOnce({ canvas: firstCanvas, rects: [] })
      .mockImplementationOnce(() => secondRaster);

    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="q"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    sizeScroll(container, 800, 600);
    // Wait on a ready-gated control (not the canvas itself, which lands imperatively a tick before
    // React's 'ready' commit) so the resize observer — a post-commit effect — is guaranteed attached.
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());
    expect(container.querySelector('canvas')).toBe(firstCanvas);
    expect(screen.queryByText(/Rendering page/)).toBeNull();

    // The panel grows — the debounced re-raster fires and asks for a sharper canvas, but the
    // promise it's waiting on hasn't resolved yet.
    vi.useFakeTimers();
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(2);
    // Still mid-flight: the original canvas must remain exactly where it was, and the page must
    // never have flashed back to the loading state while it waits.
    expect(container.querySelector('canvas')).toBe(firstCanvas);
    expect(screen.queryByText(/Rendering page/)).toBeNull();

    // The sharper raster lands — only now does it replace the old one. Asserted synchronously right
    // after (not via waitFor): fake timers are active, and waitFor's polling is itself timer-based,
    // so it would wait on a clock nothing is advancing — the awaited promise below is enough to let
    // the effect's `.then` (queued before this one) run and commit before this line continues.
    const secondCanvas = makeCanvas(920, 1288);
    await act(async () => {
      resolveSecond({ canvas: secondCanvas, rects: [] });
      await secondRaster;
    });
    expect(container.querySelector('canvas')).toBe(secondCanvas);
    expect(screen.queryByText(/Rendering page/)).toBeNull();
  });

  // The 0-width-mount fix: a panel measured before its first real layout (behind a hidden tab, or
  // mid-mount) must not get stuck oversized once it's actually shown at a smaller width — the normal
  // resize gate only re-rasters on GROWTH, so a mount that guessed blind needs a one-time exception.
  it('corrects a blind (0-width) mount down to the real size on its first measurement, once only', async () => {
    const fireResize = stubResizeObserver();
    const blindWidth = pickRasterWidth(0);
    const correctedWidth = pickRasterWidth(500);
    renderMock
      .mockResolvedValueOnce({ canvas: makeCanvas(blindWidth, blindWidth * 1.4), rects: [] })
      .mockResolvedValueOnce({
        canvas: makeCanvas(correctedWidth, correctedWidth * 1.4),
        rects: [],
      });

    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="q"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    // No sizeScroll call yet — the (layout-less) jsdom container reads clientWidth 0, exactly the
    // hidden-tab/mid-mount case this fix targets.
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.calls[0][3]).toBe(blindWidth);

    // The panel becomes visible at a real width SMALLER than the blind fallback — a shrink, which
    // the ordinary grow-only gate would ignore. The one-time blind correction must fire anyway.
    vi.useFakeTimers();
    sizeScroll(container, 500, 600);
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock.mock.calls[1][3]).toBe(correctedWidth);

    // A second tick at the very same width must NOT re-raster again — the allowance was spent.
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  // A manual zoom must survive a resize-driven silent re-raster of the SAME page. The raster
  // effect compensates 'manual' mode to preserve the on-screen size across the sharper canvas, but
  // an unrelated effect (the once-per-load default fit-width) used to be re-triggered by fitWidth's
  // shifting identity on every dims.w change — snapping fitMode back to 'width' and discarding the
  // reader's zoom on the very next commit.
  it('keeps a manual zoom across a resize-driven silent re-raster (does not snap back to fit-width)', async () => {
    const fireResize = stubResizeObserver();
    const firstCanvas = makeCanvas(400, 560);
    let resolveSecond: (page: RenderedPage) => void = () => {};
    const secondRaster = new Promise<RenderedPage>((resolve) => {
      resolveSecond = resolve;
    });
    renderMock
      .mockResolvedValueOnce({ canvas: firstCanvas, rects: [] })
      .mockImplementationOnce(() => secondRaster);

    const { container } = render(
      <PageView
        pdf={pdf}
        source={0}
        page={3}
        quote="q"
        color="var(--presence)"
        kindLabel="FINDING"
        title="A finding"
        onClose={() => {}}
      />,
    );
    sizeScroll(container, 800, 600);
    await waitFor(() => expect(screen.getByLabelText('Zoom in')).toBeTruthy());

    // Zoom in twice: fitMode flips to 'manual', reaching a display width well past plain fit-width.
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    const frameWidth = () =>
      parseFloat((container.querySelector('.prism-page-frame') as HTMLDivElement).style.width);
    const manualWidth = frameWidth();
    expect(manualWidth).toBeGreaterThan(800 - 32); // past plain fit-width — proves it's manual

    // The panel resize schedules the debounced, same-content re-raster (a sharper 920px canvas).
    vi.useFakeTimers();
    act(() => {
      fireResize();
      vi.advanceTimersByTime(400);
    });
    expect(renderMock).toHaveBeenCalledTimes(2);

    // The sharper raster lands — only the underlying pixel density changed, so the displayed width
    // must stay at the reader's manual size, not snap back to plain fit-width.
    await act(async () => {
      resolveSecond({ canvas: makeCanvas(920, 1288), rects: [] });
      await secondRaster;
    });
    expect(frameWidth()).toBeCloseTo(manualWidth, 0);
    expect(frameWidth()).not.toBeCloseTo(800 - 32, 0);
  });
});
