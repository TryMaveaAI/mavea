import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDiagramWalk, STEP_FLOOR_MS, STEP_DWELL_MS } from '../src/live/diagramWalk';
import { START_HANG_MS } from '../src/live/walkSync';
import type { StepController } from '../src/canvas/focus/stepDriver';
import type { SpokenLine } from '../src/voice/tts';

function makeController(
  count: number,
  spoken: (i: number) => string | undefined = () => undefined,
): StepController {
  return {
    count,
    setIndex: vi.fn(),
    spokenFor: spoken,
    captionFor: (i) => `caption-${i}`,
  };
}

/** A hand-driven SpokenLine: the test fires `start`/`end` to stand in for real audio events. */
function makeLine(): { handle: SpokenLine; start: (heard: boolean) => void; end: () => void } {
  let start!: (heard: boolean) => void;
  let end!: (ok: boolean) => void;
  const started = new Promise<boolean>((resolve) => {
    start = resolve;
  });
  const finished = new Promise<boolean>((resolve) => {
    end = resolve;
  });
  return { handle: { started, finished }, start, end: () => end(true) };
}

/** speakLine stub that records texts and hands each call its own controllable line. */
function makeSpeaker() {
  const lines: ReturnType<typeof makeLine>[] = [];
  const texts: string[] = [];
  const speakLine = vi.fn((text: string) => {
    texts.push(text);
    const line = makeLine();
    lines.push(line);
    return line.handle;
  });
  return { speakLine, lines, texts };
}

/** Let queued microtasks (the walk's awaits) run under fake timers. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('runDiagramWalk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws each step when its own audio starts, and advances when the line ends', async () => {
    const controller = makeController(2, (i) => (i === 1 ? 'spoken-two' : undefined));
    const release = vi.fn();
    const { speakLine, lines, texts } = makeSpeaker();
    const onDone = vi.fn();

    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => false, isDismissed: () => false },
      onDone,
    );
    await flush();

    // Step 0's line is queued, but the step must NOT draw until the audio actually starts —
    // on a slow machine synthesis alone can take seconds, and drawing early is the desync.
    expect(texts).toEqual(['caption-0']);
    expect(controller.setIndex).not.toHaveBeenCalled();

    lines[0].start(true);
    await flush();
    expect(controller.setIndex).toHaveBeenNthCalledWith(1, 0);

    // The line ends, but the floor still holds the step (anti-flash).
    lines[0].end();
    await flush();
    expect(controller.setIndex).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(STEP_FLOOR_MS);

    // Step 1 speaks its voice twin, draws at ITS audio start.
    expect(texts).toEqual(['caption-0', 'spoken-two']);
    expect(controller.setIndex).toHaveBeenCalledTimes(1);
    lines[1].start(true);
    await flush();
    expect(controller.setIndex).toHaveBeenNthCalledWith(2, 1);

    lines[1].end();
    await vi.advanceTimersByTimeAsync(STEP_FLOOR_MS);
    expect(release).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('complete');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a line that never becomes audible still draws its step at the hang cap, then dwells', async () => {
    const controller = makeController(1);
    const release = vi.fn();
    const { speakLine } = makeSpeaker(); // its line never fires start/end — a wedged server
    const onDone = vi.fn();
    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => false, isDismissed: () => false },
      onDone,
    );
    await flush();
    expect(controller.setIndex).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(START_HANG_MS);
    expect(controller.setIndex).toHaveBeenNthCalledWith(1, 0);
    expect(onDone).not.toHaveBeenCalled();

    // No audio to pace by — the step holds for its reading-length dwell, then completes.
    await vi.advanceTimersByTimeAsync(STEP_DWELL_MS);
    expect(onDone).toHaveBeenCalledWith('complete');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('aborts and releases the instant a dismissal lands, without drawing the pending step', async () => {
    const controller = makeController(5);
    const release = vi.fn();
    const { speakLine, lines } = makeSpeaker();
    const onDone = vi.fn();
    let dismissed = false;
    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => false, isDismissed: () => dismissed },
      onDone,
    );
    await flush();

    lines[0].start(true);
    await flush();
    expect(controller.setIndex).toHaveBeenCalledTimes(1);

    // The user dismisses while step 1's audio is still pending — checked after EVERY wait.
    lines[0].end();
    await vi.advanceTimersByTimeAsync(STEP_FLOOR_MS);
    dismissed = true;
    lines[1].start(true);
    await flush();

    expect(controller.setIndex).toHaveBeenCalledTimes(1); // step 1 never drew
    expect(release).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('dismissed');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a cancellation mid-loop releases the claim without reporting completion', async () => {
    const controller = makeController(4);
    const release = vi.fn();
    const { speakLine, lines } = makeSpeaker();
    const onDone = vi.fn();
    let cancelled = false;
    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => cancelled, isDismissed: () => false },
      onDone,
    );
    await flush();

    cancelled = true;
    lines[0].start(true);
    await flush();

    expect(controller.setIndex).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('cancelled');
  });

  it('never calls speakLine for a step with no caption at all, but still dwells', async () => {
    const controller: StepController = {
      count: 1,
      setIndex: vi.fn(),
      spokenFor: () => undefined,
      captionFor: () => undefined,
    };
    const release = vi.fn();
    const { speakLine } = makeSpeaker();
    const onDone = vi.fn();
    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => false, isDismissed: () => false },
      onDone,
    );
    await flush();
    expect(speakLine).not.toHaveBeenCalled();
    expect(controller.setIndex).toHaveBeenNthCalledWith(1, 0); // a silent step draws right away
    expect(onDone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(STEP_DWELL_MS);
    expect(onDone).toHaveBeenCalledWith('complete');
  });

  it('a zero-step controller completes immediately and releases without ever speaking', async () => {
    const controller = makeController(0);
    const release = vi.fn();
    const { speakLine } = makeSpeaker();
    const onDone = vi.fn();
    runDiagramWalk(
      { controller, release },
      { speakLine, isCancelled: () => false, isDismissed: () => false },
      onDone,
    );
    await flush();
    expect(controller.setIndex).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('complete');
  });
});
