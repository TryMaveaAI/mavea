import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageSurface } from '../src/live/prism/ImageSurface';
import { useDragScroll } from '../src/live/prism/useDragScroll';
import { usePanZoom } from '../src/live/prism/usePanZoom';
// The real (unmocked-below) implementation — used to compute the exact widths the effect should
// have asked for, so the test doesn't hardcode numbers that would silently drift from the source.
import { pickRasterWidth } from '../src/live/prism/extractPdf';
import type { Attachment } from '../src/live/attachments';
import type { RenderedPage } from '../src/live/prism/extractPdf';

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

// PageView renders the real PDF page (pdf.js → canvas) imperatively into a holder, then flips state
// to 'ready'. A regression once made the holder ALSO hold React-rendered status children, so when
// React re-rendered after the imperative replaceChildren it tried to removeChild a node pdf.js had
// already swapped — crashing the whole app to a blank screen. This test pins that the load→ready
// transition mounts the canvas and never throws.
describe('PdfSurface — the rendered PDF page', () => {
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
});

// the source panel for an image-exported deck. The slides are
// pictures, and the only source for a highlight box is the vision model's guessed pixel coordinates,
// which proved unreliable (wrong place, or missing). So the panel does NOT draw a box: it shows the
// real slide — at its own resolution, scaled by the shared fit/zoom engine — and the verbatim quote
// (the accurate proof). These pin that behavior, plus the zoom/fit/resize machinery ImageSurface adds
// on top of the old plain <img width:100%> (which blurred by stretching a fixed raster to the panel).
describe('ImageSurface — the source panel for an image-exported deck', () => {
  afterEach(cleanup);

  const image = { data: 'AAAA', mime: 'image/png' };

  /** Give the (layout-less) jsdom scroll container a concrete size for the fit math to read. */
  function sizeScroll(container: HTMLElement, w: number, h: number): HTMLDivElement {
    const scroll = container.querySelector('.prism-page-scroll') as HTMLDivElement;
    Object.defineProperty(scroll, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: h, configurable: true });
    return scroll;
  }

  /** jsdom never actually decodes an <img>; fake a decoded slide at a given natural pixel size. */
  function fireLoaded(container: HTMLElement, naturalWidth: number, naturalHeight: number): void {
    const img = container.querySelector('.prism-slide-img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true });
    fireEvent.load(img);
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

  describe('ImageSurface', () => {
    it('shows the slide and the verbatim quote, with no box overlay even though the model guesses one', () => {
      const { container } = render(
        <ImageSurface
          image={image}
          page={2}
          quote="Lead response under five minutes"
          color="var(--insight)"
          kindLabel="FINDING"
          title="Fast response"
          onClose={vi.fn()}
        />,
      );
      fireLoaded(container, 960, 540);
      expect(container.querySelector('.prism-slide-img')).toBeTruthy();
      // there is no mechanism to draw a model-guessed box — not even a class for one exists
      expect(container.querySelector('.prism-slide-mark')).toBeNull();
      // the verbatim quote is the proof, shown with its label
      expect(screen.getByText(/Lead response under five minutes/)).toBeTruthy();
      expect(screen.getByText(/Mavéa read this on the slide/i)).toBeTruthy();
    });

    it('shows an honest message when the slide image is unavailable', () => {
      render(
        <ImageSurface
          image={undefined}
          page={5}
          quote="Some quote"
          color="var(--insight)"
          kindLabel="STAT"
          title="A stat"
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(/Slide 5 image unavailable/i)).toBeTruthy();
    });

    it('shows an honest message when the slide image fails to decode', () => {
      const { container } = render(
        <ImageSurface
          image={image}
          page={4}
          quote="q"
          color="var(--danger)"
          kindLabel="RISK"
          title="A risk"
          onClose={vi.fn()}
        />,
      );
      const img = container.querySelector('.prism-slide-img') as HTMLImageElement;
      fireEvent.error(img);
      expect(screen.getByText(/Couldn’t load this slide image/i)).toBeTruthy();
    });

    it('scales the displayed image with zoom instead of stretching it via CSS width:100%', async () => {
      const { container } = render(
        <ImageSurface
          image={image}
          page={1}
          quote="q"
          color="var(--presence)"
          kindLabel="FINDING"
          title="A finding"
          onClose={vi.fn()}
        />,
      );
      sizeScroll(container, 800, 1000);
      fireLoaded(container, 1600, 900);

      const stage = () => container.querySelector('.prism-slide-stage') as HTMLDivElement;
      // Fit-width (the default): the stage is sized to fill the padded panel width, not the image's
      // native 1600px — proof the frame is zoom-driven, not a CSS percentage of the container.
      await waitFor(() => expect(parseFloat(stage().style.width)).toBeCloseTo(800 - 32, 4));
      expect(stage().style.display).not.toBe('none');

      // Zoom in: the displayed width grows past plain fit-width, tracking the zoom factor exactly —
      // a CSS width:100% (the old behavior) could never do this, it would stay pinned to the panel.
      const widthAtFit = parseFloat(stage().style.width);
      fireEvent.click(screen.getByLabelText('Zoom in'));
      const widthAfterZoom = parseFloat(stage().style.width);
      expect(widthAfterZoom).toBeCloseTo(widthAtFit * 1.25, 1);
    });

    it('picks a sensible initial zoom from the slide natural size under fit-width', async () => {
      const { container } = render(
        <ImageSurface
          image={image}
          page={1}
          quote="q"
          color="var(--presence)"
          kindLabel="FINDING"
          title="A finding"
          onClose={vi.fn()}
        />,
      );
      sizeScroll(container, 1000, 800);
      fireLoaded(container, 2000, 1125);

      // availW = 1000 - 32 (default padding, no note gutter for images) = 968; zoom = 968 / 2000.
      const stage = () => container.querySelector('.prism-slide-stage') as HTMLDivElement;
      await waitFor(() => expect(parseFloat(stage().style.width)).toBeCloseTo(968, 4));
      await waitFor(() =>
        expect(parseFloat(stage().style.height)).toBeCloseTo(1125 * (968 / 2000), 1),
      );
    });

    it('does not crash mounted at zero width, and sizes correctly once a real width arrives', async () => {
      const fireResize = stubResizeObserver();
      const { container } = render(
        <ImageSurface
          image={image}
          page={1}
          quote="q"
          color="var(--presence)"
          kindLabel="FINDING"
          title="A finding"
          onClose={vi.fn()}
        />,
      );
      // No sizeScroll call — the (layout-less) jsdom container reads clientWidth 0, exactly the
      // hidden-tab/mid-mount case. Must not throw, and the slide still renders once loaded.
      expect(() => fireLoaded(container, 1200, 675)).not.toThrow();
      expect(screen.getByAltText('Slide 1')).toBeTruthy();

      // The panel becomes visible at a real width — the resize observer re-fits against it.
      sizeScroll(container, 700, 900);
      fireResize();
      const stage = () => container.querySelector('.prism-slide-stage') as HTMLDivElement;
      await waitFor(() => expect(parseFloat(stage().style.width)).toBeCloseTo(700 - 32, 4));
    });

    it('keeps the same zoom when a different claim cites the same slide image', async () => {
      const { container, rerender } = render(
        <ImageSurface
          image={image}
          page={1}
          quote="First claim on this slide"
          color="var(--presence)"
          kindLabel="FINDING"
          title="First"
          onClose={vi.fn()}
        />,
      );
      sizeScroll(container, 800, 1000);
      fireLoaded(container, 1600, 900);
      const stage = () => container.querySelector('.prism-slide-stage') as HTMLDivElement;
      await waitFor(() => expect(parseFloat(stage().style.width)).toBeCloseTo(800 - 32, 4));

      fireEvent.click(screen.getByLabelText('Zoom in'));
      const zoomedWidth = parseFloat(stage().style.width);
      expect(zoomedWidth).toBeGreaterThan(800 - 32);

      // Same image bytes, a different claim/quote — the slide never re-decodes, so the reader's zoom
      // survives instead of resetting to fit-width.
      rerender(
        <ImageSurface
          image={image}
          page={1}
          quote="Second claim, same slide"
          color="var(--insight)"
          kindLabel="STAT"
          title="Second"
          onClose={vi.fn()}
        />,
      );
      expect(parseFloat(stage().style.width)).toBeCloseTo(zoomedWidth, 4);
      expect(screen.getByText(/Second claim, same slide/)).toBeTruthy();
    });
  });
});

// camera-intent arbitration in usePanZoom's ResizeObserver.
//
// fit() and frame(bbox) both land on the SAME setCamera, so a naive "just re-fit on resize" handler
// fights any code that called frame() to intentionally tight-frame a region (a briefing beat, an
// answer-first open): the panel opening/closing resizes the stage, the observer fires, and the
// tight frame snaps back to a full-content overview. These pin that the observer instead remembers
// what the camera was last asked to do and repeats THAT on resize — re-fit only while on 'auto',
// re-frame the same box while 'framed', and hands off entirely once the person is panning/zooming.
describe('usePanZoom — camera-intent arbitration', () => {
  /** Stub ResizeObserver with a handle to fire the observed callback, like a real panel resize —
   *  mirrors the helper in the PdfSurface block above. */
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

  /** A viewport element with a stubbed, reassignable size — usePanZoom only ever reads
   *  clientWidth/clientHeight, so these tests shrink/grow them in place to fake a resize. */
  function makeViewport(w: number, h: number): HTMLDivElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: w, writable: true, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: h, writable: true, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    return el;
  }

  /** The camera is written straight to the world element's transform (a pointermove must never
   *  re-render the map), so the DOM node — not a returned object — is where it's readable. */
  function cameraOf(world: HTMLElement): { x: number; y: number; scale: number } {
    const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)$/.exec(
      world.style.transform,
    );
    if (!m) throw new Error(`no camera transform on the world: "${world.style.transform}"`);
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
  }

  /** Mount the hook with a world element already attached, the way PrismOverlay does. */
  function mountPanZoom(
    viewportRef: ReturnType<typeof createRef<HTMLDivElement | null>>,
    opts?: { wheelZoom?: boolean },
  ) {
    const hook = renderHook(() => usePanZoom(viewportRef, 2000, 1600, undefined, opts));
    const world = document.createElement('div');
    act(() => hook.result.current.worldRef(world));
    return { result: hook.result, world };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('usePanZoom — camera-intent arbitration on resize', () => {
    it('re-fits on resize while the camera is on the whole-content fit', () => {
      const fireResize = stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { world } = mountPanZoom(viewportRef);
      const fittedScale = cameraOf(world).scale;

      // Shrink the viewport (as the source panel opening would) and fire the resize tick.
      (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 500;
      act(() => fireResize());

      // Still tracking the whole world — the scale changed to match the new, narrower viewport.
      expect(cameraOf(world).scale).not.toBeCloseTo(fittedScale, 4);
      const expectedScale = Math.min(1.35, (500 - 64) / 2000, (800 - 64) / 1600);
      expect(cameraOf(world).scale).toBeCloseTo(expectedScale, 4);
    });

    it('re-frames the same bbox on resize instead of snapping back to full-content fit', () => {
      const fireResize = stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { result, world } = mountPanZoom(viewportRef);
      const bbox = { x: 100, y: 100, w: 200, h: 150 };
      act(() => result.current.frame(bbox, { maxScale: 2 }));
      const framedScale = cameraOf(world).scale;
      // Sanity: framing a small box zoomed in tighter than a whole-content fit would.
      expect(framedScale).toBeGreaterThan(1);

      // Resize the viewport, then fire the tick — a naive handler would call fit() here and blow the
      // tight frame back out to the whole 2000×1600 world.
      (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 700;
      act(() => fireResize());

      const expectedScale = Math.min(2, (700 - 96) / bbox.w, (800 - 96) / bbox.h);
      expect(cameraOf(world).scale).toBeCloseTo(expectedScale, 4);
      // Confirm it re-framed the bbox, not the whole world (which would yield a much smaller scale).
      const wholeWorldScale = Math.min(1.35, (700 - 64) / 2000, (800 - 64) / 1600);
      expect(cameraOf(world).scale).not.toBeCloseTo(wholeWorldScale, 4);
    });

    it('leaves the camera alone on resize once the person is panning or zooming by hand', () => {
      const fireResize = stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { result, world } = mountPanZoom(viewportRef);

      // A real wheel-zoom gesture — this is the user taking the wheel, not code calling fit()/frame().
      act(() => result.current.zoomBy(1.2));
      const user = cameraOf(world);

      // Resize while the person's gesture is the last thing that touched the camera.
      (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 400;
      act(() => fireResize());

      // Untouched — no re-fit, no re-frame; the resize respects the hand on the wheel.
      expect(cameraOf(world)).toEqual(user);
    });

    it('a pan drag also hands the camera to the user, and resize leaves it alone', () => {
      const fireResize = stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { result, world } = mountPanZoom(viewportRef);

      const target = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
      act(() => {
        result.current.onPointerDown({
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
        } as unknown as React.PointerEvent);
      });
      act(() => {
        // Past the 4px drag threshold — a real gesture, not a click's jitter.
        result.current.onPointerMove({
          pointerId: 1,
          clientX: 40,
          clientY: 10,
          currentTarget: target,
        } as unknown as React.PointerEvent);
      });
      const panned = cameraOf(world);

      act(() => fireResize());

      expect(cameraOf(world)).toEqual(panned);
    });

    // React registers wheel listeners passively at the root, so an onWheel prop can't
    // preventDefault — the browser page-zooms on a trackpad pinch while the map zooms underneath.
    // The hook attaches its own non-passive listener instead, and only once the map is on screen.
    it('zooms on a cancelled native wheel event, and stays off until the map settles', () => {
      stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { world } = mountPanZoom(viewportRef);
      const before = cameraOf(world);

      const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
      act(() => {
        viewportRef.current?.dispatchEvent(wheel);
      });
      expect(wheel.defaultPrevented).toBe(true);
      expect(cameraOf(world).scale).toBeCloseTo(before.scale * 1.12, 4);
    });

    it('ignores the wheel while the map has not settled', () => {
      stubResizeObserver();
      const viewportRef = createRef<HTMLDivElement | null>();
      (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

      const { world } = mountPanZoom(viewportRef, { wheelZoom: false });
      const before = cameraOf(world);

      const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
      act(() => {
        viewportRef.current?.dispatchEvent(wheel);
      });
      expect(wheel.defaultPrevented).toBe(false);
      expect(cameraOf(world)).toEqual(before);
    });
  });
});

// Grab-to-pan on a source panel: dragging the body moves the scroll position, but only when the
// content overflows and the press didn't land on interactive chrome. jsdom has no layout, so the
// element's scroll geometry is mocked.
describe('useDragScroll — grab-to-pan on a source panel', () => {
  function makeScrollEl(overflow: boolean): HTMLDivElement {
    const el = document.createElement('div');
    const dims: Record<string, number> = {
      clientWidth: 100,
      clientHeight: 100,
      scrollWidth: overflow ? 300 : 100,
      scrollHeight: overflow ? 300 : 100,
    };
    for (const [k, v] of Object.entries(dims)) {
      Object.defineProperty(el, k, { value: v, configurable: true });
    }
    el.scrollLeft = 0;
    el.scrollTop = 0;
    el.setPointerCapture = () => {};
    el.releasePointerCapture = () => {};
    document.body.appendChild(el);
    return el;
  }

  function pointer(type: string, props: Record<string, unknown>): Event {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, props);
    return e;
  }

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  describe('useDragScroll', () => {
    it('pans the scroll position when dragging an overflowing body', () => {
      const el = makeScrollEl(true);
      const ref = { current: el };
      renderHook(() => useDragScroll(ref, true));

      el.dispatchEvent(
        pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
      );
      el.dispatchEvent(pointer('pointermove', { clientX: 30, clientY: 20, pointerId: 1 }));

      // dragging left/up by (20, 30) scrolls the content the opposite way.
      expect(el.scrollLeft).toBe(20);
      expect(el.scrollTop).toBe(30);
      expect(el.classList.contains('is-panning')).toBe(true);

      el.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
      expect(el.classList.contains('is-panning')).toBe(false);
    });

    it('does nothing when the content does not overflow', () => {
      const el = makeScrollEl(false);
      const ref = { current: el };
      renderHook(() => useDragScroll(ref, true));

      el.dispatchEvent(
        pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
      );
      el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
      expect(el.scrollLeft).toBe(0);
      expect(el.scrollTop).toBe(0);
    });

    it('ignores a press that lands on interactive chrome (a button)', () => {
      const el = makeScrollEl(true);
      const btn = document.createElement('button');
      el.appendChild(btn);
      const ref = { current: el };
      renderHook(() => useDragScroll(ref, true));

      btn.dispatchEvent(
        pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
      );
      el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
      expect(el.scrollLeft).toBe(0);
      expect(el.scrollTop).toBe(0);
    });

    it('does not pan a click that never crosses the drag threshold', () => {
      const el = makeScrollEl(true);
      const ref = { current: el };
      renderHook(() => useDragScroll(ref, true));

      el.dispatchEvent(
        pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
      );
      el.dispatchEvent(pointer('pointermove', { clientX: 52, clientY: 51, pointerId: 1 })); // <4px
      expect(el.scrollLeft).toBe(0);
      expect(el.scrollTop).toBe(0);
      expect(el.classList.contains('is-panning')).toBe(false);
    });

    it('stays off for a non-pannable (text) surface', () => {
      const el = makeScrollEl(true);
      const ref = { current: el };
      renderHook(() => useDragScroll(ref, false));

      el.dispatchEvent(
        pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
      );
      el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
      expect(el.scrollLeft).toBe(0);
      expect(el.scrollTop).toBe(0);
    });
  });
});

// the standalone #/prism and #/synthesis entry (both mount
// PrismApp.tsx's <div className="prism-app">) must be its OWN scroll container, the same idiom
// gallery.css documents: `height: 100dvh; overflow-y: auto`. The global stylesheet locks
// `html, body { overflow: hidden }` for the app-shell surfaces that manage their own internal
// scroll regions — a standalone route that instead grows past the viewport with `min-height`
// relies on body scroll that lock forbids, so its tail content (Prism's "why trust this" feature
// bullets) becomes permanently unreachable on any window shorter than the page. This is a static
// scan, not a jsdom layout assertion, because jsdom doesn't compute real overflow/scroll geometry.
describe('PrismApp — the standalone route’s scroll container', () => {
  describe('.prism-app is a self-contained scroll container', () => {
    const css = readFileSync(join(__dirname, '../src/live/prism/prism-app.css'), 'utf8');
    // Isolate the .prism-app rule block itself (not a descendant like .prism-app-header).
    const rule = css.match(/(?<!-)\.prism-app\s*\{[^}]*\}/)?.[0] ?? '';

    it('the root rule exists and is bounded + scrollable', () => {
      expect(rule).not.toBe('');
      expect(rule).toMatch(/height:\s*100dvh/);
      expect(rule).toMatch(/overflow-y:\s*auto/);
    });

    it('does not regress to the unbounded min-height that relies on locked body scroll', () => {
      expect(rule).not.toMatch(/min-height/);
    });
  });
});
