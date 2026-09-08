// The Lens's filmstrip: every card in the answer, along the foot of the stage, with a control at
// each end for the part that is off screen.
//
// The rail itself is Focus's (FilmstripRail) — real miniatures, a roving tab stop, arrow-key
// walking. What this adds is the scrolling story. The native scrollbar reads as stray browser
// chrome under a row of thumbnails, but hiding it and leaving only a fade meant the strip looked
// like it ended where the tiles did. A button at each end says "there is more this way" in a way
// a fade cannot, and unlike a scrollbar it is reachable from the keyboard.
//
// Each control renders only while that direction can actually move, so the strip shows nothing at
// all when the whole answer already fits — a control that can never do anything teaches the reader
// to stop looking.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Block } from '../../data/conversation';
import { Icon } from '../../icons/icons';
import { FilmstripRail } from '../focus/FilmstripRail';

/** How far one press travels: most of a screenful, keeping a tile or two for continuity. */
const NUDGE = 0.8;

interface Props {
  blocks: Block[];
  activeId: string | null;
  onPick: (id: string) => void;
  renderBlock: (b: Block, depth?: number) => ReactNode;
}

export function LensStrip({ blocks, activeId, onPick, renderBlock }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const listOf = useCallback(
    () => hostRef.current?.querySelector<HTMLElement>('.filmstrip-list') ?? null,
    [],
  );

  // Which way there is more to see. Re-read on scroll and on resize, and once on mount — the rail
  // scrolls itself when the active tile changes, so this cannot only listen to the reader.
  useEffect(() => {
    const list = listOf();
    if (!list) return;
    const read = (): void =>
      setEdges({
        start: list.scrollLeft > 2,
        end: list.scrollLeft + list.clientWidth < list.scrollWidth - 2,
      });
    read();
    list.addEventListener('scroll', read, { passive: true });
    // Absent in jsdom, and the strip is perfectly usable without it — the scroll listener still
    // keeps the controls honest once anything moves.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(list);
    return () => {
      list.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, [listOf, blocks, activeId]);

  const nudge = (dir: 1 | -1): void => {
    const list = listOf();
    list?.scrollBy({ left: dir * list.clientWidth * NUDGE, behavior: 'smooth' });
  };

  return (
    <div
      className="lens-strip"
      ref={hostRef}
      // Fade only the side that can actually move. Fading both ends unconditionally dimmed the
      // first tile — usually the card the reader is looking at — while it sat at rest.
      data-edge={
        edges.start && edges.end ? 'both' : edges.start ? 'start' : edges.end ? 'end' : undefined
      }
    >
      <FilmstripRail
        blocks={blocks}
        activeId={activeId}
        onPick={onPick}
        renderBlock={renderBlock}
      />
      {edges.start && (
        <button
          type="button"
          className="lens-strip-nudge is-start"
          aria-label="Show earlier cards"
          onClick={() => nudge(-1)}
        >
          <Icon.chevL />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          className="lens-strip-nudge is-end"
          aria-label="Show later cards"
          onClick={() => nudge(1)}
        >
          <Icon.chevR />
        </button>
      )}
    </div>
  );
}
