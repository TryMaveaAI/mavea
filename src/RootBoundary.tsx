// RootBoundary.tsx — the last line of defense above every surface.
//
// A surface is a lazy chunk (routes.ts): a stale deploy, a dropped connection, or a genuine
// render bug can keep it from mounting. Modeled on canvas/BlockBoundary, but user-facing — where
// a failed block silently disappears into its siblings, a failed SURFACE has nothing left to fall
// back to, so this tells the person what happened and hands them a way back. Tokens only, so the
// fallback reads correctly in whichever theme was already applied before this ever runs.
import { Component, type ReactNode } from 'react';
import './rootBoundary.css';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

export class RootBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  // Required so React treats this as an error boundary and stops the error here.
  override componentDidCatch(error: unknown): void {
    console.error('[RootBoundary] a surface failed to render:', error);
  }

  override render(): ReactNode {
    return this.state.failed ? <CrashFallback /> : this.props.children;
  }
}

function CrashFallback() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div className="root-fallback" role="alert">
      <div className="root-fallback-mark" aria-hidden="true" />
      <p className="root-fallback-title">Mavéa hit a snag</p>
      <p className="root-fallback-body">
        {offline
          ? "You're offline — reconnect and reload to pick up where you left off."
          : 'Something went wrong loading this. A reload usually fixes it.'}
      </p>
      <button
        type="button"
        className="root-fallback-action"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}

/** Instant, dependency-free placeholder shown while a surface's chunk downloads. Pure CSS — no
 *  font, icon, or data dependency — so it paints the moment this render pass reaches it, even on
 *  the slowest connection. Announced as a polite status so a screen-reader user hears that a
 *  load is underway instead of landing on a silent, empty page. */
export function SurfaceFallback() {
  return (
    <div
      className="surface-fallback"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading…"
    >
      <div className="surface-fallback-orb" aria-hidden="true" />
    </div>
  );
}
