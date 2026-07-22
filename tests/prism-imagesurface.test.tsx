// prism-imagesurface.test.tsx — the source panel for an image-exported deck. The slides are
// pictures, and the only source for a highlight box is the vision model's guessed pixel coordinates,
// which proved unreliable (wrong place, or missing). So the panel does NOT draw a box: it shows the
// real slide — at its own resolution, scaled by the shared fit/zoom engine — and the verbatim quote
// (the accurate proof). These pin that behavior, plus the zoom/fit/resize machinery ImageSurface adds
// on top of the old plain <img width:100%> (which blurred by stretching a fixed raster to the panel).
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSurface } from '../src/live/prism/ImageSurface';

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
