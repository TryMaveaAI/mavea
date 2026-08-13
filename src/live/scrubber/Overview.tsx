// The Overview — press the layers button and the conversation zooms out into a place: a frosted
// Mission-Control of one card per chapter, every moment listed, your current spot highlighted. Tap
// a moment to dive back in; Esc (or the backdrop) to surface. Short chats are two cards; a long
// session is a city map of everything you covered.
import { useRef, type ReactElement } from 'react';
import { OverlayPortal } from '../../canvas/blocks/overlays/portal';
import { Icon } from '../../icons/icons';
import { useFocusTrap } from '../useFocusTrap';
import { countMoments, type Chapter } from './chapters';
import './scrubber.css';

interface OverviewProps {
  chapters: Chapter[];
  currentIndex: number;
  /** Jump the canvas to a frame; pass a block id to also scroll to and flash that exact element. */
  onJump: (frameIndex: number, spotId?: string) => void;
  onClose: () => void;
}

export function Overview({
  chapters,
  currentIndex,
  onJump,
  onClose,
}: OverviewProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes, Tab stays inside the dialog, and focus returns to the layers button on close — the
  // same trap every other Live dialog uses. Its effect deps are stable and it reads `onClose`
  // through a ref, so LiveApp re-rendering (it passes an inline arrow) can't re-run the open
  // sequence and yank keyboard focus back to the first moment mid-browse.
  useFocusTrap(panelRef, { onEscape: onClose });

  if (chapters.length === 0) return null;
  const total = countMoments(chapters);
  const accent = chapters.find((c) => c.moments.some((m) => m.frameIndex === currentIndex))?.color;

  return (
    <OverlayPortal accent={accent}>
      <div
        className="ovw-scrim"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="Close conversation overview"
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onClose();
        }}
      >
        {/* Clicks inside the panel are swallowed so they don't bubble to the scrim above and close
            the overview — a propagation guard, not a click affordance, so it has no keyboard twin. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <div
          className="ovw-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Conversation overview"
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="ovw-head">
            <h2 className="ovw-title">Your conversation</h2>
            <p className="ovw-sub">
              {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {total}{' '}
              {total === 1 ? 'moment' : 'moments'} — tap anywhere to dive back in
            </p>
          </header>

          <div className="ovw-grid">
            {chapters.map((ch) => (
              <section
                key={ch.id}
                className="ovw-card"
                style={{ ['--card-c']: ch.color } as React.CSSProperties}
              >
                <div className="ovw-card-head">
                  <span className="ovw-card-dot" />
                  <h3 className="ovw-card-title">{ch.title}</h3>
                  <span className="ovw-card-count">{ch.moments.length}</span>
                </div>
                <ul className="ovw-moments">
                  {ch.moments.map((m) => {
                    const current = m.frameIndex === currentIndex;
                    const Glyph = Icon[m.icon] || Icon.mic;
                    return (
                      <li key={m.frameIndex}>
                        <button
                          type="button"
                          className={'ovw-moment' + (current ? ' is-current' : '')}
                          onClick={() => {
                            onJump(m.frameIndex);
                            onClose();
                          }}
                          aria-current={current ? 'true' : undefined}
                        >
                          <Glyph />
                          <span className="ovw-moment-q">{m.question || 'Moment'}</span>
                        </button>
                        {/* One level deeper: the answer's own blocks, each a jump straight to that
                            card (scroll + flash), not just to the turn. */}
                        {m.elements.length > 0 && (
                          <ul className="ovw-els">
                            {m.elements.map((el) => {
                              const ElGlyph = (el.icon && Icon[el.icon]) || Icon.spark;
                              return (
                                <li key={el.id}>
                                  <button
                                    type="button"
                                    className="ovw-el"
                                    onClick={() => {
                                      onJump(m.frameIndex, el.id);
                                      onClose();
                                    }}
                                    aria-label={`Jump to "${el.label}" in "${
                                      m.question || 'this moment'
                                    }"`}
                                  >
                                    <ElGlyph />
                                    <span className="ovw-el-label">{el.label}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
