import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Renders full-screen overlays (modal / confirm / drawer / sheet / command palette) into
 * <body>, so their `position: fixed` escapes the transformed/animated card-grid ancestor and
 * lands relative to the VIEWPORT — giving a true centered dialog + full-screen backdrop scrim.
 * `accent` is forwarded as the --ov-c custom property since the portaled node no longer inherits
 * it from the trigger card. Theme tokens still apply (they live on :root, above <body>).
 */
export function OverlayPortal({ accent, children }: { accent?: string; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ov-root" style={{ ['--ov-c' as string]: accent } as CSSProperties}>
      {children}
    </div>,
    document.body,
  );
}
