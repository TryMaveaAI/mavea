import { Component, Suspense, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import './async-surface.css';

export function PendingShell({
  label = 'Opening…',
  overlay = false,
}: {
  label?: string;
  overlay?: boolean;
}): ReactElement {
  return (
    <div
      className={`async-pending${overlay ? ' async-pending-overlay' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="async-pending-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  label: string;
  overlay: boolean;
}

interface BoundaryState {
  error: boolean;
}

class LazyLoadBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: false };

  static getDerivedStateFromError(): BoundaryState {
    return { error: true };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // The retry UI is intentional; global logging still observes the uncaught import rejection.
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className={`async-pending async-pending-error${
            this.props.overlay ? ' async-pending-overlay' : ''
          }`}
          role="alert"
        >
          <span>Couldn’t open {this.props.label.toLowerCase()}.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Immediate, accessible acknowledgement for every user-triggered lazy boundary. */
export function AsyncSurface({
  children,
  label = 'Feature',
  overlay = false,
}: {
  children: ReactNode;
  label?: string;
  overlay?: boolean;
}): ReactElement {
  return (
    <LazyLoadBoundary label={label} overlay={overlay}>
      <Suspense
        fallback={<PendingShell label={`Opening ${label.toLowerCase()}…`} overlay={overlay} />}
      >
        {children}
      </Suspense>
    </LazyLoadBoundary>
  );
}
