// BlockBoundary.tsx — isolate a single canvas block's render failures.
//
// Live composes blocks from a real model's loose JSON across the whole component
// library. The coercers and the prompt keep that output well-formed, but a component
// can still meet a prop shape it didn't expect. This boundary guarantees that one block
// which throws swaps to its `fallback` (FallbackCard: the block's real text as a plain
// card) — its siblings, the spotlight tour, and the voice all keep going, and the
// answer's content never silently vanishes. Callers that render blocks with no content
// worth salvaging omit `fallback` and keep the old render-as-nothing behavior. It is
// transparent when nothing fails (no wrapper element, no styling), so it is safe to
// wrap every block in both Live and the demo.
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered in place of the block when it throws — pass the block's FallbackCard so
   *  the content survives the failure. Omitted → the failed cell renders as nothing. */
  fallback?: ReactNode;
}
interface State {
  failed: boolean;
}

export class BlockBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  // Required so React treats this as an error boundary and stops the error here. A single
  // malformed block must never take down the canvas; the cell degrades to the fallback
  // (or is absorbed by the surrounding layout when there is none).
  override componentDidCatch(error: unknown): void {
    console.error('[BlockBoundary] block render failed — showing fallback:', error);
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
