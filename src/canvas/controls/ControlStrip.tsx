import type { ReactNode } from 'react';

/**
 * The container for a viz block's live controls. The `.viz-controls` class is the single hook the
 * export pipeline keys off: `FigureEmbed` stamps `data-static` on an embedded block and
 * `controls.css` then hides anything inside `.viz-controls`, so a PDF/slide captures the clean
 * static figure (seed state) while the live canvas keeps the sliders. Keep every interactive
 * affordance — sliders, toggles, the drag readout — inside this strip.
 */
export function ControlStrip({ children }: { children: ReactNode }) {
  return <div className="viz-controls">{children}</div>;
}
