// MindMapViewerDrawer.tsx — re-open the "Watch Me Think" map that produced an answer, read-only.
//
// Answers grown from a thinking-map keep that map on their TurnFrame (history.ts). From the
// session rail the user can click into a slide-in drawer that shows the map exactly as it settled
// — no ✕, no action buttons (MindShape with asBlock=true is inherently read-only) — and click the
// X (or the scrim) to go back to the answer. Reuses the shared `.drawer` chrome (see LiveEvidence).
import { type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import { MindShape } from '../../canvas/blocks/diagrams/MindShape';
import type { MindShapeSpec } from './types';

interface MindMapViewerDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The settled map to show. Kept while closing so the slide-out still has content. */
  spec: MindShapeSpec | null;
}

export function MindMapViewerDrawer({
  open,
  onClose,
  spec,
}: MindMapViewerDrawerProps): ReactElement {
  return (
    <>
      <div
        className={'scrim' + (open ? ' show' : '')}
        onClick={onClose}
        role="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label="Close the map"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            onClose();
          }
        }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
      ></div>
      {/* `inert` keeps the closed subtree unfocusable/unclickable mid-transition (matches the
          evidence drawer — otherwise focus inside it can scroll the overflow-hidden shell). */}
      <aside className={'drawer' + (open ? ' show' : '')} aria-hidden={!open} inert={!open}>
        <button className="drawer-x" onClick={onClose} aria-label="Close the map">
          <Icon.x />
        </button>
        <div className="drawer-head">
          <div className="drawer-eyebrow">
            <Icon.sparkle style={{ width: 14, height: 14 }} /> The thinking behind this
          </div>
          {spec?.center && <div className="drawer-claim">{spec.center}</div>}
        </div>
        <div className="drawer-body">
          {spec && (
            <MindShape
              asBlock
              center={spec.center}
              atoms={spec.atoms}
              links={spec.links}
              clusters={spec.clusters}
              unsaid={spec.unsaid}
            />
          )}
        </div>
      </aside>
    </>
  );
}
