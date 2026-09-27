import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { ZoomDeck } from '../src/live/zoom/ZoomDeck';
import { useZoomGesture } from '../src/live/zoom/useZoomGesture';
import type { RecapModel } from '../src/live/recap/recapModel';

// Semantic zoom: both altitudes render only real recap-derived words; rows dive back to
// their frame; the pinch gesture (ctrl+wheel) fires once per accumulated step.

afterEach(cleanup);

const model: RecapModel = {
  heading: 'Tonight, so far.',
  meta: '8:12 PM – 8:31 PM · 19m · 2 topics · 4 moments',
  rows: [
    { title: 'Refi math', clock: '8:12 PM', line: 'Flips at 5.9%.', frameIndex: 0 },
    {
      title: 'Week 11 lineup',
      clock: '8:20 PM',
      line: 'Lineup set.',
      frameIndex: 2,
      corrected: 'Corrected — the projection: was 121.4, now 118.9',
    },
  ],
};

describe('ZoomDeck', () => {
  it('exposes visible level controls for canvas, chapters, and one breath', () => {
    const onLevel = vi.fn();
    const onClose = vi.fn();
    render(
      <ZoomDeck
        model={model}
        level="chapters"
        onLevel={onLevel}
        onJump={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'One breath' }));
    expect(onLevel).toHaveBeenCalledWith('breath');

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('chapters level lists every real row and jumps to its frame', () => {
    const onJump = vi.fn();
    render(
      <ZoomDeck
        model={model}
        level="chapters"
        onLevel={vi.fn()}
        onJump={onJump}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Week 11 lineup'));
    expect(onJump).toHaveBeenCalledWith(2);
    expect(screen.getByText(/was 121\.4, now 118\.9/)).toBeInTheDocument();
  });

  it('breath level reads the night as one line of real chapter titles', () => {
    render(
      <ZoomDeck
        model={model}
        level="breath"
        onLevel={vi.fn()}
        onJump={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Refi math/)).toBeInTheDocument();
    expect(screen.getByText(/one breath/)).toBeInTheDocument();
  });

  it('Escape closes the deck', () => {
    const onClose = vi.fn();
    render(
      <ZoomDeck
        model={model}
        level="chapters"
        onLevel={vi.fn()}
        onJump={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('left/right arrows move between levels without needing a gesture', () => {
    const onLevel = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <ZoomDeck
        model={model}
        level="chapters"
        onLevel={onLevel}
        onJump={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onLevel).toHaveBeenCalledWith('breath');

    rerender(
      <ZoomDeck
        model={model}
        level="breath"
        onLevel={onLevel}
        onJump={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onLevel).toHaveBeenLastCalledWith('chapters');

    rerender(
      <ZoomDeck
        model={model}
        level="chapters"
        onLevel={onLevel}
        onJump={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('useZoomGesture', () => {
  function Host({ onZoom }: { onZoom: (d: 'out' | 'in') => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useZoomGesture(ref, onZoom);
    return <div ref={ref} data-testid="zone" />;
  }

  it('accumulates ctrl+wheel into single out/in steps; plain wheel is ignored', () => {
    const onZoom = vi.fn();
    render(<Host onZoom={onZoom} />);
    const zone = screen.getByTestId('zone');
    fireEvent.wheel(zone, { deltaY: 200 }); // no ctrl → scroll, not zoom
    expect(onZoom).not.toHaveBeenCalled();
    fireEvent.wheel(zone, { deltaY: 50, ctrlKey: true });
    fireEvent.wheel(zone, { deltaY: 50, ctrlKey: true }); // crosses the step once
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenCalledWith('out');
    fireEvent.wheel(zone, { deltaY: -120, ctrlKey: true });
    expect(onZoom).toHaveBeenLastCalledWith('in');
  });

  // Two fingers `gap` px apart on a horizontal line, as a touchscreen reports them.
  const fingers = (gap: number) => [
    { identifier: 0, clientX: 200 - gap / 2, clientY: 300 },
    { identifier: 1, clientX: 200 + gap / 2, clientY: 300 },
  ];

  it('treats a two-finger touch pinch as the same steps: closing is out, spreading is in', () => {
    const onZoom = vi.fn();
    render(<Host onZoom={onZoom} />);
    const zone = screen.getByTestId('zone');
    fireEvent.touchStart(zone, { touches: fingers(300) });
    fireEvent.touchMove(zone, { touches: fingers(250) }); // 50px: under one step
    expect(onZoom).not.toHaveBeenCalled();
    fireEvent.touchMove(zone, { touches: fingers(200) }); // 100px closed: one step out
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenLastCalledWith('out');
    fireEvent.touchMove(zone, { touches: fingers(320) }); // 120px spread: one step in
    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(onZoom).toHaveBeenLastCalledWith('in');
  });

  it('keeps the browser from page-zooming on a pinch, and leaves a one-finger scroll alone', () => {
    render(<Host onZoom={vi.fn()} />);
    const zone = screen.getByTestId('zone');
    fireEvent.touchStart(zone, { touches: fingers(300) });
    // fireEvent returns false when the listener called preventDefault.
    expect(fireEvent.touchMove(zone, { touches: fingers(280) })).toBe(false);
    fireEvent.touchEnd(zone, { touches: [fingers(280)[0]] });
    expect(
      fireEvent.touchMove(zone, { touches: [{ identifier: 0, clientX: 100, clientY: 200 }] }),
    ).toBe(true);
  });

  it('drops a half-made pinch when a finger lifts, so the next pinch starts from zero', () => {
    const onZoom = vi.fn();
    render(<Host onZoom={onZoom} />);
    const zone = screen.getByTestId('zone');
    fireEvent.touchStart(zone, { touches: fingers(300) });
    fireEvent.touchMove(zone, { touches: fingers(240) }); // 60px of a 90px step
    fireEvent.touchEnd(zone, { touches: [] });
    fireEvent.touchStart(zone, { touches: fingers(300) });
    fireEvent.touchMove(zone, { touches: fingers(240) }); // another 60px, a fresh pinch
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('removes every listener it added when the surface unmounts', () => {
    const onZoom = vi.fn();
    const { unmount } = render(<Host onZoom={onZoom} />);
    const zone = screen.getByTestId('zone');
    unmount();
    fireEvent.touchStart(zone, { touches: fingers(300) });
    fireEvent.touchMove(zone, { touches: fingers(100) });
    fireEvent.wheel(zone, { deltaY: 500, ctrlKey: true });
    expect(onZoom).not.toHaveBeenCalled();
  });
});
