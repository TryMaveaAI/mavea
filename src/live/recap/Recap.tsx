// The recap overlay: the session as a page of settled threads, each row a door back to
// its moment, with the share path one tap away. Reads like the end of a good meeting —
// what we covered, where each thread landed.
import { useEffect, useRef, type ReactElement } from 'react';
import type { RecapModel } from './recapModel';
import { useFocusTrap } from '../useFocusTrap';
import './recap.css';

export function Recap({
  model,
  onJump,
  onShare,
  onClose,
}: {
  model: RecapModel;
  onJump: (frameIndex: number) => void;
  onShare?: () => void;
  onClose: () => void;
}): ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="recap-scrim"
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label="Close session recap"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClose();
      }}
    >
      {/* Clicks inside the panel are swallowed so they don't bubble to the scrim above and close
          the dialog — a propagation guard, not a click affordance, so it has no keyboard twin. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className="recap-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Session recap"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="recap-head">
          <h2 className="recap-title voice-text">{model.heading}</h2>
          <p className="recap-meta">{model.meta}</p>
        </header>
        <ul className="recap-rows">
          {model.rows.map((r) => (
            <li key={r.frameIndex}>
              <button type="button" className="recap-row" onClick={() => onJump(r.frameIndex)}>
                <span className="recap-row-key">
                  {r.title}
                  <span className="recap-row-clock">{r.clock}</span>
                </span>
                <span className="recap-row-line">{r.line}</span>
                {r.corrected && <span className="recap-row-corrected">{r.corrected}</span>}
              </button>
            </li>
          ))}
        </ul>
        <footer className="recap-actions">
          {onShare && (
            <button type="button" className="recap-share" onClick={onShare}>
              Share as Story
            </button>
          )}
          <button type="button" className="recap-keep" onClick={onClose}>
            Keep talking
          </button>
        </footer>
      </section>
    </div>
  );
}
