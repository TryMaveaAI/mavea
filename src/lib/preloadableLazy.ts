import { lazy, type ComponentType, type DOMAttributes, type LazyExoticComponent } from 'react';
import { lazyRetry } from './lazyRetry';

// React.lazy itself constrains components with `ComponentType<any>`; mirroring that here preserves
// each imported component's exact props instead of inferring the props parameter as `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PreloadableLazy<Component extends ComponentType<any>> {
  Component: LazyExoticComponent<Component>;
  /** Starts the same import promise React.lazy will consume. This never mounts the module. */
  preload: () => Promise<void>;
}

/**
 * One cached import shared by intent preloading and React.lazy. Keeping the promise here avoids
 * duplicate chunk requests when pointer, focus, and touch intent arrive close together.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPreloadableLazy<Component extends ComponentType<any>>(
  factory: () => Promise<{ default: Component }>,
): PreloadableLazy<Component> {
  let promise: Promise<{ default: Component }> | undefined;
  const load = (): Promise<{ default: Component }> => {
    promise ??= lazyRetry(factory)();
    return promise;
  };

  return {
    Component: lazy(load),
    preload: () => load().then(() => undefined),
  };
}

interface ConnectionHints {
  saveData?: boolean;
  effectiveType?: string;
}

interface IdleApi {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
}

function currentConnection(): ConnectionHints | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: ConnectionHints }).connection;
}

/** Avoid speculative bytes when the browser says bandwidth matters more than latency. */
export function allowsSpeculativePreload(connection = currentConnection()): boolean {
  if (connection?.saveData) return false;
  return connection?.effectiveType !== 'slow-2g' && connection?.effectiveType !== '2g';
}

/** Event props shared by links, menu rows, cards, and buttons that lead to lazy UI. */
export function preloadIntentProps(
  preload: () => Promise<void>,
): Pick<DOMAttributes<Element>, 'onPointerEnter' | 'onFocus' | 'onTouchStart'> {
  const warm = (): void => {
    if (!allowsSpeculativePreload()) return;
    void preload().catch(() => {
      // React's error boundary owns the user-visible retry if the eventual mount also fails.
    });
  };
  return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm };
}

/** Warm a likely next shell only after the main thread settles, and only on suitable connections. */
export function scheduleIdlePreload(preload: () => Promise<void>, timeout = 1_500): () => void {
  if (typeof window === 'undefined' || !allowsSpeculativePreload()) return () => undefined;

  const warm = (): void => {
    void preload().catch(() => {
      // A speculative fetch is best-effort. Mounting later still flows through the boundary.
    });
  };

  const idleApi = window as unknown as IdleApi;
  if (idleApi.requestIdleCallback && idleApi.cancelIdleCallback) {
    const id = idleApi.requestIdleCallback(warm, { timeout });
    return () => idleApi.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(warm, Math.min(timeout, 500));
  return () => window.clearTimeout(id);
}
