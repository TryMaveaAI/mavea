// Opt-in resource-leak tracking for jsdom tests.
//
// jsdom ships no ResizeObserver / IntersectionObserver / Worker, so a component that forgets to
// disconnect one leaks invisibly — the leak guard can't see it. These counting polyfills let a
// mount→unmount test assert every observer/worker is torn down (the hard "no leaks" rule,
// enforced by a test rather than by discipline).
//
// They are installed PER-TEST (install/uninstall in before/afterEach), never globally. Defining
// ResizeObserver for the whole suite changes how shipped components behave in jsdom — e.g.
// `useResponsiveGrid` would run its observer branch, read offsetWidth=0, and collapse to the
// mobile column budget — so the tracking is scoped to the surfaces whose teardown we assert.
// The stubs are inert (callbacks never fire); they only count live instances.

interface ResourceCounts {
  resizeObservers: number;
  intersectionObservers: number;
  workers: number;
}

const live: ResourceCounts = { resizeObservers: 0, intersectionObservers: 0, workers: 0 };

/** Snapshot of currently-live tracked resources. Compare a before/after delta around a mount. */
export function liveResourceCounts(): Readonly<ResourceCounts> {
  return { ...live };
}

class CountingResizeObserver {
  private done = false;
  constructor(_cb: ResizeObserverCallback) {
    live.resizeObservers += 1;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    if (this.done) return; // idempotent: a double-disconnect must not under-count
    this.done = true;
    live.resizeObservers -= 1;
  }
}

class CountingIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  private done = false;
  constructor(_cb: IntersectionObserverCallback) {
    live.intersectionObservers += 1;
  }
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  disconnect(): void {
    if (this.done) return;
    this.done = true;
    live.intersectionObservers -= 1;
  }
}

class CountingWorker extends EventTarget {
  private done = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(_url: string | URL, _opts?: WorkerOptions) {
    super();
    live.workers += 1;
  }
  postMessage(): void {}
  terminate(): void {
    if (this.done) return;
    this.done = true;
    live.workers -= 1;
  }
}

type Patchable = {
  ResizeObserver?: unknown;
  IntersectionObserver?: unknown;
  Worker?: unknown;
};
const slot = globalThis as Patchable;
const original: Patchable = {};
let installed = false;

/** Patch the observer/worker globals with counting stubs and reset the live counts to zero. */
export function installResourceTracking(): void {
  if (installed) return;
  installed = true;
  live.resizeObservers = 0;
  live.intersectionObservers = 0;
  live.workers = 0;
  original.ResizeObserver = slot.ResizeObserver;
  original.IntersectionObserver = slot.IntersectionObserver;
  original.Worker = slot.Worker;
  slot.ResizeObserver = CountingResizeObserver;
  slot.IntersectionObserver = CountingIntersectionObserver;
  slot.Worker = CountingWorker;
}

/** Restore the original globals. Call in afterEach so the tracking never leaks across tests. */
export function uninstallResourceTracking(): void {
  if (!installed) return;
  installed = false;
  slot.ResizeObserver = original.ResizeObserver;
  slot.IntersectionObserver = original.IntersectionObserver;
  slot.Worker = original.Worker;
}
