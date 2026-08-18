// The shared AudioContext is created on the first click of the session and used only while
// something is actually playing — so an idle tab (a typing-only session included) must not keep a
// real-time audio thread alive. These pin the refcount: held while audio is in flight, suspended
// 30s after the last release, and awake again before anything is scheduled on it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  onAudioSuspended,
  sharedAudioContext,
  tapPlaybackNode,
  unlockAudio,
  voiceEnergyTap,
} from '../src/voice/voiceEnergy';

const IDLE_MS = 30_000;

/** Resume/suspend resolve on a microtask, like the real thing — code that assumes `resume()` has
 *  already landed when it returns is exactly what this module must not do. */
class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  destination = { kind: 'destination' } as unknown as AudioDestinationNode;
  resume = vi.fn(() =>
    Promise.resolve().then(() => {
      this.state = 'running';
    }),
  );
  suspend = vi.fn(() =>
    Promise.resolve().then(() => {
      this.state = 'suspended';
    }),
  );
  createAnalyser = vi.fn(() => ({
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 8,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }));
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
}

let ctx: FakeAudioContext;

// The shared graph is a module singleton built on first use, so every test in this file shares one
// context — the same lifetime the app gives it, and the reason the suspension state carries from
// one test to the next below.
vi.stubGlobal('AudioContext', function AudioContextStub() {
  ctx = new FakeAudioContext();
  return ctx; // `new` yields the returned object, so the test holds the very context in use
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  // Leave the context awake and idle-armed for the next test rather than mid-window.
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

describe('idle AudioContext suspension', () => {
  it('suspends 30s after the unlock gesture when nothing ever plays', async () => {
    const suspended = vi.fn();
    const unsubscribe = onAudioSuspended(suspended);

    expect(unlockAudio()).toBe(false); // resume() is async — the first gesture can only ask
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.state).toBe('running');
    expect(unlockAudio()).toBe(true);

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(ctx.state).toBe('running'); // still inside the window
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.state).toBe('suspended');
    expect(suspended).toHaveBeenCalledTimes(1); // the surface can re-arm its gesture unlock
    unsubscribe();
  });

  it('never suspends under a clip that is still playing', async () => {
    const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const release = tapPlaybackNode(node);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.state).toBe('running'); // the tap woke it

    await vi.advanceTimersByTimeAsync(IDLE_MS * 3); // a long answer is still an answer
    expect(ctx.state).toBe('running');

    release();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(ctx.state).toBe('suspended');
    release(); // idempotent — a double release must not unbalance the count
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(ctx.state).toBe('suspended');
  });

  it('refuses to route an element through a context that is not running', async () => {
    expect(ctx.state).toBe('suspended');
    const element = {} as HTMLAudioElement;
    const release = voiceEnergyTap(element);
    // Routing through a suspended context silences the clip, and resume() may not land at all
    // outside a gesture — the clip plays straight to the speakers instead, face on CSS fallback.
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
    expect(() => {
      release();
      release();
    }).not.toThrow();

    // Once it is awake the tap is taken as usual.
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.state).toBe('running');
    voiceEnergyTap(element)();
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  // Last on purpose: handing the context out raw stands the idle timer down for the rest of the
  // session, which is module state no later test could undo.
  it('stands down for a consumer that takes the context raw', async () => {
    expect(ctx.state).toBe('suspended');
    expect(sharedAudioContext()).toBe(ctx as unknown as AudioContext);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.state).toBe('running'); // woken for whatever it is about to schedule

    // The reel's audible preview loops for as long as its sheet is open and the reel export plays
    // a buffer for the whole recording — neither takes a lease, and suspending under either would
    // silence it. Nothing here can see when they end, so the timer does not run at all.
    await vi.advanceTimersByTimeAsync(IDLE_MS * 4);
    expect(ctx.state).toBe('running');

    // …not even after an unrelated leased clip comes and goes.
    tapPlaybackNode({ connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode)();
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(ctx.state).toBe('running');
  });
});

describe('gesture unlock re-arming', () => {
  it('main.tsx puts its unlock listener back when the context suspends', () => {
    // Safari only honors resume() inside a user gesture, so the listener that removes itself once
    // the context is confirmed running has to come back the moment it stops running. Checked by
    // source scan: importing main.tsx would boot the whole app.
    const source = readFileSync(join(__dirname, '..', 'src', 'main.tsx'), 'utf8');
    expect(source).toMatch(/onAudioSuspended\(\s*arm\s*\)/);
    expect(source).toMatch(/const arm = \(\): void =>[^;]*addEventListener/s);
  });
});
