// Semantic zoom — the conversation at two altitudes above the canvas. Pinch out once and the
// session reads as chapters (each row a door, not a summary); pinch out again and the whole
// night is one breath: the real chapter titles in a single line. Pinch in (or tap) descends;
// every word here is derived from what actually happened — the recap model's rows and real
// clocks — never a generated précis.
import { useEffect, useRef, type ReactElement } from 'react';
import { OverlayPortal } from '../../canvas/blocks/overlays/portal';
import { Icon } from '../../icons/icons';
import type { RecapModel } from '../recap/recapModel';
import { useZoomGesture } from './useZoomGesture';
import { useFocusTrap } from '../useFocusTrap';
import './zoom.css';

export type ZoomLevel = 'breath' | 'chapters';

interface Props {
  model: RecapModel;
  level: ZoomLevel;
  onLevel: (level: ZoomLevel) => void;
  /** Dive all the way back in: jump the canvas to a moment and close the deck. */
  onJump: (frameIndex: number) => void;
  onClose: () => void;
}

export function ZoomDeck({ model, level, onLevel, onJump, onClose }: Props): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep keyboard focus inside the deck (Escape is already handled below).
  useFocusTrap(panelRef);

  // Pinching inside the deck keeps zooming: out goes higher, in descends — and descending
  // from chapters lands back on the canvas itself.
  useZoomGesture(panelRef, (dir) => {
    if (dir === 'out') onLevel('breath');
    else if (level === 'breath') onLevel('chapters');
    else onClose();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (level === 'chapters') onLevel('breath');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (level === 'breath') onLevel('chapters');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [level, onClose, onLevel]);

  // The scrim itself carries the click/keyboard "dismiss" affordance (it wraps the whole deck, so
  // it can't be a real <button>); only a click or Enter/Space landing directly on the backdrop
  // closes it — anything that lands on the deck's own content is left alone.
  const closeOnBackdrop = (e: { target: EventTarget; currentTarget: EventTarget }): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <OverlayPortal>
      <div
        className="zoom-scrim"
        role="button"
        tabIndex={0}
        aria-label="Close"
        onClick={closeOnBackdrop}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (e.key === ' ') e.preventDefault();
          closeOnBackdrop(e);
        }}
      >
        <div
          ref={panelRef}
          className={'zoom-deck level-' + level}
          role="dialog"
          aria-modal="true"
          aria-label="Conversation zoomed out"
          tabIndex={-1}
        >
          <header className="zoom-toolbar">
            <div className="zoom-levelbar" role="group" aria-label="Zoom level">
              <button type="button" className="zoom-level" onClick={onClose}>
                Canvas
              </button>
              <button
                type="button"
                className={'zoom-level' + (level === 'chapters' ? ' active' : '')}
                aria-pressed={level === 'chapters'}
                onClick={() => onLevel('chapters')}
              >
                Chapters
              </button>
              <button
                type="button"
                className={'zoom-level' + (level === 'breath' ? ' active' : '')}
                aria-pressed={level === 'breath'}
                onClick={() => onLevel('breath')}
              >
                One breath
              </button>
            </div>
            <button
              type="button"
              className="zoom-close"
              onClick={onClose}
              aria-label="Close zoom"
              title="Close"
            >
              <Icon.x />
            </button>
          </header>
          {level === 'breath' ? (
            <div className="zoom-breath">
              <p className="zoom-breath-line">
                {model.heading.replace(/, so far\.$/, '')}
                {': '}
                {model.rows.map((r, i) => (
                  <button
                    key={r.frameIndex}
                    type="button"
                    className="zoom-breath-topic"
                    onClick={() => onLevel('chapters')}
                  >
                    {r.title}
                    {i < model.rows.length - 1 ? ' · ' : ''}
                  </button>
                ))}
              </p>
              <p className="zoom-meta">{model.meta} · one breath</p>
            </div>
          ) : (
            <div className="zoom-chapters">
              <header className="zoom-head">
                <span className="zoom-title">{model.heading}</span>
                <span className="zoom-meta">{model.meta}</span>
              </header>
              <ul className="zoom-rows">
                {model.rows.map((r) => (
                  <li key={r.frameIndex}>
                    <button type="button" className="zoom-row" onClick={() => onJump(r.frameIndex)}>
                      <span className="zoom-row-title">
                        {r.title}
                        <span className="zoom-row-clock">{r.clock}</span>
                      </span>
                      <span className="zoom-row-line">{r.line}</span>
                      {r.corrected && <span className="zoom-row-corrected">{r.corrected}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
