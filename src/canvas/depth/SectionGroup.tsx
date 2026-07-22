// SectionGroup.tsx — one concept section in the "Go Deeper" teaching canvas.
//
// Renders the section header (order badge + label + "Go deeper" button), the
// standard grid of cards, and the collapsible drawer of deeper authored content.
// The `renderCard` callback is supplied by TopicCanvas so the block chrome
// (spotlight, flashcard, Ask, watch) is identical whether a block lives in the
// main canvas or a deeper drawer — no logic is duplicated here.
import { useState, type ReactNode } from 'react';
import { Icon } from '../../icons/icons';
import type { Block } from '../../data/conversation';
import type { DepthSection } from '../../live/depth/depthLens';
import './depth.css';

interface Props {
  section: DepthSection;
  /** Render a fully-chromed card (col div + block actions) for a block. */
  renderCard: (b: Block, index: number) => ReactNode;
  /** When true every drawer is expanded (Reading mode = find-in-page / screen reader access). */
  readingMode: boolean;
}

export function SectionGroup({ section, renderCard, readingMode }: Props): ReactNode {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = readingMode || localOpen;
  const hasDeeper = section.deeper.length > 0;
  // Stable id for aria-controls: derived from order (always a number) to avoid
  // needing to sanitise an arbitrary label string into a valid HTML id.
  const drawerId = `depth-drawer-${section.order}`;

  return (
    <div className="depth-section">
      {section.label && (
        <div className="depth-section-header">
          {section.order > 0 && (
            <span className="depth-section-num" aria-hidden="true">
              {section.order}
            </span>
          )}
          <span className="depth-section-label">{section.label}</span>
          {hasDeeper && (
            <button
              type="button"
              className={'depth-go-deeper' + (isOpen ? ' is-open' : '')}
              aria-expanded={isOpen}
              aria-controls={drawerId}
              onClick={() => setLocalOpen((o) => !o)}
            >
              <Icon.arrowDown className="depth-deeper-icon" aria-hidden="true" />
              Go deeper
              <span className="depth-deeper-count">({section.deeper.length})</span>
            </button>
          )}
        </div>
      )}
      <div className="card-grid">{section.standard.map((b, i) => renderCard(b, i))}</div>
      {hasDeeper && (
        <div
          className={'depth-drawer' + (isOpen ? ' is-open' : '')}
          id={drawerId}
          aria-hidden={!isOpen}
        >
          <div className="depth-drawer-inner">
            <div className="card-grid depth-drawer-grid">
              {section.deeper.map((b, i) => renderCard(b, section.standard.length + i))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
