// prism-slidesurface.test.tsx — SlideSurface (a PowerPoint slide with real text) is the first
// non-PDF surface with a fixed-shape, transform-scaled "page" instead of either a raster (PDF) or a
// reflowable column (TextSurface). Three things could silently break: a slide whose outline parsing
// found nothing (its text lives in a table/chart the title/body reader doesn't look at) must still
// show the real page text instead of going blank; the 960×540 canvas must default to FIT-SCREEN (not
// useFitZoom's own fit-width default, which would crop a wide/short panel) and still track manual
// zoom; and the located quote must anchor to real DOM marks the shared useAnchoredRects/AnnotationLayer
// machinery can highlight, exactly like TextSurface's own test proves for reflowable text.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlideSurface } from '../src/live/prism/SlideSurface';
import { makeZip, toAttachment } from './helpers/officeZip';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Give the (layout-less) jsdom scroll container a concrete size for the fit math to read. */
function sizeScroll(container: HTMLElement, w: number, h: number): HTMLDivElement {
  const scroll = container.querySelector('.prism-page-scroll') as HTMLDivElement;
  Object.defineProperty(scroll, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(scroll, 'clientHeight', { value: h, configurable: true });
  return scroll;
}

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

/** Stub ResizeObserver, firing EVERY observed instance's callback — SlideSurface attaches two
 *  independent observers (useFitZoom's, for the fixed-shape frame, and useAnchoredRects', for the
 *  located <mark>s) in the same tree, so a single shared handle would only fire whichever attached
 *  last (mirrors TextSurface's own test for the same reason). */
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

/** A one-slide .pptx with a title placeholder + two body paragraphs — the same fixture shape
 *  officeDoc's own slideOutlines test uses. */
function deckWithOutline(): ReturnType<typeof toAttachment> {
  const slide =
    '<p:sld><p:cSld><p:spTree>' +
    '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    '<p:txBody><a:p><a:r><a:t>Q3 Results</a:t></a:r></a:p></p:txBody></p:sp>' +
    '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    '<p:txBody>' +
    '<a:p><a:r><a:t>Revenue grew 38 percent</a:t></a:r></a:p>' +
    '<a:p><a:r><a:t>Costs held flat</a:t></a:r></a:p>' +
    '</p:txBody></p:sp>' +
    '</p:spTree></p:cSld></p:sld>';
  const zip = makeZip({
    'ppt/presentation.xml': '<p:presentation/>',
    'ppt/slides/slide1.xml': slide,
  });
  return toAttachment('deck.pptx', zip);
}

/** A one-slide .pptx whose only text lives in a table (`<p:graphicFrame>`), not a `<p:sp>` shape —
 *  officeDoc's title/body reader never looks inside those, so `slideOutlines[0]` comes back as
 *  `{ body: [] }` even though the flattened grounding page text is real and non-empty. */
function deckWithoutOutline(): ReturnType<typeof toAttachment> {
  const slide =
    '<p:sld><p:cSld><p:spTree>' +
    '<p:graphicFrame><a:tbl><a:tr><a:tc><a:txBody>' +
    '<a:p><a:r><a:t>Table-only content, no title placeholder</a:t></a:r></a:p>' +
    '</a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame>' +
    '</p:spTree></p:cSld></p:sld>';
  const zip = makeZip({
    'ppt/presentation.xml': '<p:presentation/>',
    'ppt/slides/slide1.xml': slide,
  });
  return toAttachment('table-deck.pptx', zip);
}

describe('SlideSurface — title/body hierarchy', () => {
  it('renders the outline as a title + body list, with the located quote marked', async () => {
    const { container } = render(
      <SlideSurface
        doc={deckWithOutline()}
        source={0}
        page={1}
        quote="Revenue grew 38 percent"
        color="var(--presence)"
        kindLabel="FINDING"
        title="Q3 deck"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
    expect(container.querySelector('.prism-slide-title')?.textContent).toContain('Q3 Results');
    const bodyLines = container.querySelectorAll('.prism-slide-body-line');
    expect(bodyLines).toHaveLength(2);
    expect(bodyLines[0].textContent).toContain('Revenue grew 38 percent');
    expect(bodyLines[1].textContent).toContain('Costs held flat');
    // no flat fallback rendered alongside the hierarchy
    expect(container.querySelector('.prism-slide-flat')).toBeNull();

    const mark = container.querySelector('mark[data-prism-anchor="primary"]');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toContain('Revenue grew 38 percent');
    expect(screen.getByText(/verbatim quote, on its real slide/i)).toBeTruthy();
  });

  it('falls back to the plain page text, never a blank slide, when outline parsing finds nothing', async () => {
    const { container } = render(
      <SlideSurface
        doc={deckWithoutOutline()}
        source={0}
        page={1}
        quote="Table-only content"
        color="var(--insight)"
        kindLabel="STAT"
        title="A table slide"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
    // never blank: the flattened page text still renders
    expect(container.querySelector('.prism-slide-title')).toBeNull();
    expect(container.querySelector('.prism-slide-body')).toBeNull();
    const flat = container.querySelector('.prism-slide-flat');
    expect(flat).toBeTruthy();
    expect(flat?.textContent).toContain('Table-only content, no title placeholder');
    expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
      'Table-only content',
    );
  });

  it('shows an honest fallback message when the file can’t be read, without crashing', async () => {
    const doc = toAttachment('broken.pptx', new TextEncoder().encode('not a zip'));
    render(
      <SlideSurface
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
    await waitFor(() => expect(screen.getByText(/Couldn.t read this slide/i)).toBeTruthy());
  });
});

describe('SlideSurface — fixed 960×540 surface, scaled by zoom', () => {
  it('defaults to fit-SCREEN (the whole slide fits the panel) rather than useFitZoom’s fit-width', async () => {
    const fireResize = stubResizeObserver();
    const { container } = render(
      <SlideSurface
        doc={deckWithOutline()}
        source={0}
        page={1}
        quote=""
        color="var(--presence)"
        kindLabel="FINDING"
        title="Q3 deck"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());

    // A short, wide panel: fit-width would blow the frame's height way past what's available
    // (960×540 stretched to fill 2000 wide → 1125 tall); fit-screen instead binds on the SHORTER
    // axis, keeping the whole slide visible.
    sizeScroll(container, 2000, 400);
    act(() => fireResize());

    const frame = () => container.querySelector('.prism-slide-frame') as HTMLDivElement;
    const availH = 400 - 32; // useFitZoom's default padding, no note gutter here
    await waitFor(() => expect(parseFloat(frame().style.height)).toBeCloseTo(availH, 1));
    const expectedZoom = availH / 540;
    expect(parseFloat(frame().style.width)).toBeCloseTo(960 * expectedZoom, 1);

    const canvas = container.querySelector('.prism-slide-canvas') as HTMLDivElement;
    const scaleMatch = canvas.style.transform.match(/scale\(([\d.]+)\)/);
    expect(Number(scaleMatch?.[1])).toBeCloseTo(expectedZoom, 3);
  });

  it('zooming in scales the frame by the same factor at every zoom level', async () => {
    const fireResize = stubResizeObserver();
    const { container } = render(
      <SlideSurface
        doc={deckWithOutline()}
        source={0}
        page={1}
        quote=""
        color="var(--presence)"
        kindLabel="FINDING"
        title="Q3 deck"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
    sizeScroll(container, 1200, 900);
    act(() => fireResize());

    const frame = () => container.querySelector('.prism-slide-frame') as HTMLDivElement;
    await waitFor(() => expect(parseFloat(frame().style.width)).toBeGreaterThan(0));
    const widthAtFit = parseFloat(frame().style.width);

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(parseFloat(frame().style.width)).toBeCloseTo(widthAtFit * 1.25, 1);

    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(parseFloat(frame().style.width)).toBeCloseTo(widthAtFit, 1);
  });
});

describe('SlideSurface — anchored highlight rects', () => {
  it('records a REAL rect (not empty geometry) when annotated, with pageImage left empty', async () => {
    const fireResize = stubResizeObserver();
    const onAnnotated = vi.fn();
    const { container } = render(
      <SlideSurface
        doc={deckWithOutline()}
        source={1}
        page={1}
        quote="Costs held flat"
        color="var(--insight)"
        kindLabel="FINDING"
        title="Q3 deck"
        penOn
        onAnnotated={onAnnotated}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
    const canvas = container.querySelector('.prism-slide-canvas') as HTMLElement;
    const mark = container.querySelector('mark[data-prism-anchor="primary"]') as HTMLElement;
    // jsdom never lays anything out — stub the two elements useAnchoredRects actually reads, then
    // force its ResizeObserver to remeasure them (mirrors TextSurface's identical test).
    canvas.getBoundingClientRect = () => domRect(0, 0, 960, 540);
    mark.getBoundingClientRect = () => domRect(80, 300, 140, 24);
    act(() => fireResize());

    await waitFor(() => expect(onAnnotated).toHaveBeenCalled());
    const geo = onAnnotated.mock.calls.at(-1)![0];
    expect(geo.pageImage).toBe(''); // no raster to snapshot — a fixed-layout "page", not a rendered one
    expect(geo.rects).toEqual([{ x: 80, y: 300, w: 140, h: 24 }]);
    expect(geo.imgW).toBe(960);
    expect(geo.imgH).toBe(540);
    expect(geo.isFigure).toBe(false);
  });
});
