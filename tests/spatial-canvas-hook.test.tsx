import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSpatialCanvas } from '../src/canvas/spatial/useSpatialCanvas';
import type { Bbox } from '../src/canvas/spatial/camera';
import {
  installResourceTracking,
  liveResourceCounts,
  uninstallResourceTracking,
} from './helpers/resourceTracking';

/** jsdom returns a zero rect for everything; give the viewport a real size for the fit math. */
function stubRect(el: Element, w: number, h: number, left = 0, top = 0): void {
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      left,
      top,
      right: left + w,
      bottom: top + h,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function Harness({ content }: { content: Bbox }): React.ReactElement {
  const sc = useSpatialCanvas({ clamp: { min: 0.01, max: 100 } });
  return (
    <div>
      <div ref={sc.viewportRef} data-testid="vp" />
      <button onClick={() => sc.fitTo(content)}>fit</button>
      <button onClick={() => sc.zoomAtClient(2, 100, 100)}>zoom</button>
      <output data-testid="t">{sc.transform}</output>
    </div>
  );
}

describe('useSpatialCanvas — auto-fit', () => {
  it('fits content into the viewport, centered (the auto-zoom-out)', () => {
    const { getByTestId, getByText } = render(<Harness content={{ x: 0, y: 0, w: 100, h: 100 }} />);
    stubRect(getByTestId('vp'), 200, 200);
    fireEvent.click(getByText('fit'));
    // 100-wide content into a 200 viewport → scale 2, content centered at the origin.
    expect(getByTestId('t').textContent).toBe('translate(0px, 0px) scale(2)');
  });

  it('zooms while keeping the focus point fixed on screen', () => {
    const { getByTestId, getByText } = render(<Harness content={{ x: 0, y: 0, w: 100, h: 100 }} />);
    stubRect(getByTestId('vp'), 200, 200);
    fireEvent.click(getByText('fit')); // camera {0,0,2}
    fireEvent.click(getByText('zoom')); // zoom ×2 at screen (100,100)
    expect(getByTestId('t').textContent).toBe('translate(-100px, -100px) scale(4)');
  });
});

describe('useSpatialCanvas — reserved foot', () => {
  function BandHarness({ content }: { content: Bbox }): React.ReactElement {
    const sc = useSpatialCanvas({ clamp: { min: 0.01, max: 100 }, insetBottom: 100 });
    return (
      <div>
        <div ref={sc.viewportRef} data-testid="vp" />
        <button onClick={() => sc.fitTo(content)}>fit</button>
        <output data-testid="t">{sc.transform}</output>
      </div>
    );
  }

  it('fits above chrome that floats over the foot of the canvas', () => {
    // The mindshape action bar is painted INSIDE the canvas, so a fit that uses the whole box
    // draws the map's bottom row right where the pills are. 200×200 viewport less a 100px band
    // → 100-tall content fits at 1× and sits in the top half, leaving the band clear.
    const { getByTestId, getByText } = render(
      <BandHarness content={{ x: 0, y: 0, w: 100, h: 100 }} />,
    );
    stubRect(getByTestId('vp'), 200, 200);
    fireEvent.click(getByText('fit'));
    expect(getByTestId('t').textContent).toBe('translate(50px, 0px) scale(1)');
  });
});

describe('useSpatialCanvas — resource cleanup', () => {
  beforeEach(installResourceTracking);
  afterEach(uninstallResourceTracking);

  it('disconnects its ResizeObserver on unmount (no leak)', () => {
    const before = liveResourceCounts().resizeObservers;
    const { unmount } = render(<Harness content={{ x: 0, y: 0, w: 10, h: 10 }} />);
    expect(liveResourceCounts().resizeObservers).toBe(before + 1);
    unmount();
    expect(liveResourceCounts().resizeObservers).toBe(before);
  });
});
