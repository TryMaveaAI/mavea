import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { TeachDiagram } from '../src/canvas/blocks/learn/TeachDiagram';
import { claim } from '../src/canvas/focus/stepDriver';
import type { TeachStep } from '../src/canvas/blocks/learn/types';

const STEPS: TeachStep[] = [
  { caption: 'one', add: [{ kind: 'circle', cx: 20, cy: 20, r: 5 }] },
  { caption: 'two', add: [{ kind: 'circle', cx: 50, cy: 50, r: 5 }] },
  { caption: 'three', add: [{ kind: 'circle', cx: 80, cy: 80, r: 5 }] },
];

/** Stub matchMedia so the reduced-motion branch is deterministic per test. */
function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (q: string) =>
      ({
        matches: q.includes('reduce') ? reduce : false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TeachDiagram — reduced motion shows the finished figure with no timers', () => {
  beforeEach(() => stubMotion(true));

  it('renders every step at once and starts no timers', () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    render(<TeachDiagram title="Fig" steps={STEPS} />);
    // All three circles are present immediately — the build is complete.
    expect(document.querySelectorAll('circle[data-kind="circle"]')).toHaveLength(3);
    // No draw-in animation classes under reduced motion.
    expect(document.querySelector('.lr-td-draw')).toBeNull();
    // The component scheduled no auto-advance timer.
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe('TeachDiagram — auto-play builds step by step', () => {
  beforeEach(() => stubMotion(false));

  it('reveals one step, then advances on its timer', () => {
    vi.useFakeTimers();
    render(<TeachDiagram title="Fig" steps={STEPS} />);
    // Starts on step 1 of 3 — only the first shape is drawn.
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(document.querySelectorAll('circle[data-kind="circle"]')).toHaveLength(1);
    // Advance past the first step's dwell.
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(document.querySelectorAll('circle[data-kind="circle"]')).toHaveLength(2);
  });

  it('Replay restarts the build, and ‹ › step manually', () => {
    vi.useFakeTimers();
    render(<TeachDiagram title="Fig" steps={STEPS} />);
    // Step forward manually (pauses autoplay).
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    // Replay returns to the first step.
    fireEvent.click(screen.getByLabelText('Replay the build'));
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('clears its pending timer on unmount (no state update after teardown)', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(<TeachDiagram title="Fig" steps={STEPS} />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('TeachDiagram — driven by an external stepper (stepDriver claim)', () => {
  beforeEach(() => stubMotion(false));

  it('suspends its own word-count timer while claimed, letting setIndex drive the shown step', () => {
    vi.useFakeTimers();
    render(<TeachDiagram title="Fig" steps={STEPS} blockId="driven-1" />);
    expect(screen.getByText('1/3')).toBeInTheDocument();

    let claimed: NonNullable<ReturnType<typeof claim>>;
    act(() => {
      claimed = claim('driven-1')!;
    });
    expect(claimed!).not.toBeNull();

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    // The external driver jumps straight to the last step — no internal timer fights it.
    act(() => claimed!.controller.setIndex(2));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    // Advancing fake time doesn't move it further — the word-count autoplay is suspended, not
    // just coincidentally idle.
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText('3/3')).toBeInTheDocument();

    act(() => claimed!.release());
  });

  it('resumes its own autoplay from wherever the driver left it once released', () => {
    vi.useFakeTimers();
    render(<TeachDiagram title="Fig" steps={STEPS} blockId="driven-2" />);
    let claimed: NonNullable<ReturnType<typeof claim>>;
    act(() => {
      claimed = claim('driven-2')!;
    });
    act(() => claimed!.controller.setIndex(1));
    expect(screen.getByText('2/3')).toBeInTheDocument();

    act(() => claimed!.release());
    // Freed — the internal timer resumes counting down from the step the driver left it on.
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it("exposes the driver's view of the steps (count + spoken/shown captions)", () => {
    render(<TeachDiagram title="Fig" steps={STEPS} blockId="driven-3" />);
    let claimed: NonNullable<ReturnType<typeof claim>>;
    act(() => {
      claimed = claim('driven-3')!;
    });
    expect(claimed!.controller.count).toBe(3);
    expect(claimed!.controller.captionFor(0)).toBe('one');
    expect(claimed!.controller.captionFor(2)).toBe('three');
    // STEPS carries no captionSpoken twin, so the driver falls back to the shown caption.
    expect(claimed!.controller.spokenFor(0)).toBeUndefined();
    act(() => claimed!.release());
  });
});

describe('TeachDiagram — reduced motion stays the finished figure regardless of registration', () => {
  beforeEach(() => stubMotion(true));

  it('still shows every step at once with no timers when it carries a blockId', () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    render(<TeachDiagram title="Fig" steps={STEPS} blockId="driven-reduced" />);
    expect(document.querySelectorAll('circle[data-kind="circle"]')).toHaveLength(3);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    // Registering doesn't change what's on screen — LiveApp is the one that must decline to
    // claim under reduced motion (this only proves the block's own rendering stays inert).
    let claimed: NonNullable<ReturnType<typeof claim>>;
    act(() => {
      claimed = claim('driven-reduced')!;
    });
    expect(claimed!).not.toBeNull();
    expect(document.querySelectorAll('circle[data-kind="circle"]')).toHaveLength(3);
    act(() => claimed!.release());
  });
});
