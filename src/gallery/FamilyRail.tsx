// The family filter as one scrollable row. A dozen-plus chips would wrap the sticky bar taller than
// a phone's viewport, so the row scrolls — and says so: the edge that has more fades out and carries
// an arrow, because `overflow-x: auto` alone is a capability a mouse cannot see. The native
// scrollbar stays hidden; a grey bar under a row of chips read as stray browser chrome.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons/icons';

/** How far one press travels: most of a screenful, keeping a chip or two for continuity. */
const NUDGE = 0.8;

interface Props {
  label: string;
  children: ReactNode;
}

export function FamilyRail({ label, children }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Bring the checked chip into view once, on mount — a family picked from the hash can sit past
  // the right edge, and a filter the reader cannot see looks like no filter at all. Only the row
  // moves: the page is its own scroll container and must not jump.
  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!list || !active) return;
    const room = list.getBoundingClientRect();
    const chip = active.getBoundingClientRect();
    if (chip.left >= room.left && chip.right <= room.right) return;
    list.scrollLeft += chip.left - room.left - (room.width - chip.width) / 2;
  }, []);

  // Which way there is more to see. Re-read on scroll and on resize, and once on mount.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const read = (): void =>
      setEdges({
        start: list.scrollLeft > 2,
        end: list.scrollLeft + list.clientWidth < list.scrollWidth - 2,
      });
    read();
    list.addEventListener('scroll', read, { passive: true });
    // Absent in jsdom, and the rail is usable without it — the scroll listener keeps the arrows
    // honest once anything moves.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(list);
    return () => {
      list.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, []);

  const nudge = (dir: 1 | -1): void => {
    const list = listRef.current;
    list?.scrollBy({ left: dir * list.clientWidth * NUDGE, behavior: 'smooth' });
  };

  return (
    <div
      className="vlib-rail"
      // Fade only the side that can actually move; fading both ends at rest dims the "All" chip.
      data-edge={
        edges.start && edges.end ? 'both' : edges.start ? 'start' : edges.end ? 'end' : undefined
      }
    >
      {edges.start && (
        <button
          type="button"
          className="vlib-rail-nudge is-start"
          aria-label="Show earlier families"
          onClick={() => nudge(-1)}
        >
          <Icon.chevL />
        </button>
      )}
      <div className="vlib-chips" role="radiogroup" aria-label={label} ref={listRef}>
        {children}
      </div>
      {edges.end && (
        <button
          type="button"
          className="vlib-rail-nudge is-end"
          aria-label="Show more families"
          onClick={() => nudge(1)}
        >
          <Icon.chevR />
        </button>
      )}
    </div>
  );
}
