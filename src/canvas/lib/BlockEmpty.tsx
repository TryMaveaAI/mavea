// Shared sparse/empty placeholder component for the canvas blocks.
//
// The audit flagged charts that drew their frame around an empty dataset, and "2 marks in a
// wide card" that looked stranded. <BlockEmpty> is the one on-brand placeholder a block
// renders instead, so every block degrades the same calm way. The `hasData` guard that gates
// it lives in empty.ts (pure logic).

import type { ReactNode } from 'react';

interface BlockEmptyProps {
  /** Short message, e.g. "No data for this range". */
  message?: string;
  /** Optional secondary line. */
  hint?: string;
}

/**
 * A calm, centered empty state sized to fill its card so the block never shows a bare frame or
 * a stranded handful of marks. Token-only; height comes from the fluid spacing scale.
 */
export function BlockEmpty({ message = 'No data to show', hint }: BlockEmptyProps): ReactNode {
  return (
    <div className="cx-empty" role="status">
      <span className="cx-empty-msg">{message}</span>
      {hint && <span className="cx-empty-hint">{hint}</span>}
    </div>
  );
}
