// The Focus-mode filmstrip: the quiet rail of every card in the answer, each shown as its kind, its
// title, and a live thumbnail (a real miniature of the card — see FilmstripThumb). The card on the
// stage is highlighted; tapping any entry — or walking the rail with the arrow keys — takes the wheel
// and pins it on the stage. The rail keeps the active entry scrolled into view as the hero glides beat
// to beat, and shows a quiet "speaking" pulse on whichever card Mavéa is currently describing.
import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Block } from '../../data/conversation';
import { blockKind, blockLabel } from '../blockLabel';
import { FilmstripThumb } from './FilmstripThumb';
import { prefersReducedMotion } from './motion';

/** A glanceable rail is a handful of cards, not a phone book — cap the worst case (a huge canvas)
 *  and surface the remainder honestly rather than silently dropping it. */
const RAIL_CAP = 24;

interface Props {
  blocks: Block[];
  activeId: string | null;
  /** The card Mavéa is currently narrating, so its entry shows a quiet "speaking" pulse. */
  narratingId?: string | null;
  onPick: (id: string) => void;
  renderBlock: (b: Block, depth?: number) => ReactNode;
}

export function FilmstripRail({ blocks, activeId, narratingId, onPick, renderBlock }: Props) {
  const shown = blocks.slice(0, RAIL_CAP);
  const overflow = blocks.length - shown.length;
  const listRef = useRef<HTMLDivElement>(null);

  // The single tab stop in the rail: the active entry (or the first), so it reads as one control and
  // the arrow keys move within it (a roving-tabindex listbox-style pattern over the existing buttons).
  const rovingIndex = Math.max(
    0,
    shown.findIndex((b) => b.id === activeId),
  );

  // Keep the active entry in view as the hero auto-follows the conversation. Coalesced behind a short
  // timer so a rapid scrub settles to ONE smooth scroll (to the card you land on) instead of a stack
  // of competing smooth scrolls fighting each other.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const el = listRef.current?.querySelector<HTMLElement>('.filmstrip-entry.active');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [activeId]);

  // Arrow / Home / End walk the rail and pick as they go — the pick is debounced upstream, so holding
  // a key scrubs visually and speaks once on release, exactly like a fast mouse scrub. Enter/Space
  // activation lives on each entry itself (below), so this handler only owns navigation.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const count = shown.length;
    if (!count) return;
    const focused = document.activeElement;
    const attr = focused instanceof HTMLElement ? focused.dataset.idx : undefined;
    const cur = attr !== undefined ? Number(attr) : rovingIndex;
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = Math.min(count - 1, cur + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = Math.max(0, cur - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${next}"]`)?.focus();
    const id = shown[next].id;
    if (id) onPick(id);
  };

  return (
    <aside className="filmstrip-rail" aria-label="All cards in this view">
      <div className="filmstrip-eyebrow">In this view</div>
      <div className="filmstrip-list" ref={listRef} role="toolbar" onKeyDown={onKeyDown}>
        {shown.map((b, i) => {
          const active = b.id === activeId;
          const speaking = !!b.id && b.id === narratingId;
          return (
            // A div (not a <button>): each entry's live thumbnail is a REAL card that may contain its
            // own buttons/links, which can't legally nest inside a <button>. role="button" + the
            // roving tabindex + its own Enter/Space handler give it full button semantics; the
            // rail's key handler above owns arrow/Home/End navigation between entries.
            <div
              key={b.id}
              role="button"
              data-idx={i}
              tabIndex={i === rovingIndex ? 0 : -1}
              className={
                'filmstrip-entry' + (active ? ' active' : '') + (speaking ? ' speaking' : '')
              }
              aria-current={active ? 'true' : undefined}
              aria-label={`${blockKind(b)} — ${blockLabel(b)}`}
              onClick={() => onPick(b.id as string)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(b.id as string);
                }
              }}
            >
              <FilmstripThumb block={b} renderBlock={renderBlock} />
              {speaking && <span className="filmstrip-speaking" aria-hidden="true" />}
              <span className="filmstrip-meta">
                <span className="filmstrip-kind">{blockKind(b)}</span>
                <span className="filmstrip-title">{blockLabel(b)}</span>
              </span>
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="filmstrip-more">
            +{overflow} more card{overflow === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </aside>
  );
}
