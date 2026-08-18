// SectionGroup.tsx — one concept section in the "Go Deeper" teaching canvas.
//
// Renders the section header (order badge + label + "Go deeper" button), the
// standard grid of cards, and the collapsible drawer of deeper authored content.
// The `renderCard` callback is supplied by TopicCanvas so the block chrome
// (spotlight, flashcard, Ask, watch) is identical whether a block lives in the
// main canvas or a deeper drawer — no logic is duplicated here.
//
// Drawer content that arrived WITH the spec (a baked demo, a restored session, an
// answer that carried it inline) renders directly, exactly as before. A live answer
// arrives without it now — the eager turn no longer pays for drawers nobody opens —
// so a section the current live turn produced (deepenOffered: content-matched, never
// a surface flag) offers the same button, requests its blocks on the FIRST expand,
// shows the canvas skeleton while they stream in, and caches them for every later
// open. A section matching no live turn (the tour, demos, restored specs with no
// drawer content) simply doesn't offer a drawer — and can never fire a model call.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../icons/icons';
import type { Block } from '../../data/conversation';
import type { DepthSection } from '../../live/depth/depthLens';
import { deepenOffered } from '../../live/depth/deepenStore';
import { CanvasSkeleton } from '../CanvasSkeleton';
import './depth.css';

interface Props {
  section: DepthSection;
  /** Render a fully-chromed card (col div + block actions) for a block. */
  renderCard: (b: Block, index: number) => ReactNode;
  /** When true every drawer is expanded (Reading mode = find-in-page / screen reader access). */
  readingMode: boolean;
}

/** Placeholder tracks while a drawer's blocks are authored — the same skeleton
 *  vocabulary the canvas uses while a family chunk loads (shape over spinner). */
const DRAWER_SKELETON = [{ col: 6 }, { col: 6 }];

export function SectionGroup({ section, renderCard, readingMode }: Props): ReactNode {
  const [localOpen, setLocalOpen] = useState(false);
  // Drawer blocks authored on demand for THIS section. Component-local on purpose: the spec is
  // never mutated, so a replay/save stays byte-identical to what the turn produced; a remount
  // re-requests and lands on ./deepen's in-flight/persistent cache instead of a second call.
  const [fetched, setFetched] = useState<Block[] | null>(null);
  const [pending, setPending] = useState(false);
  // Guards setState after unmount. The request itself is deliberately NOT aborted: the tokens
  // are already being spent, and letting it finish banks the result in the persistent cache.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const deeper = section.deeper.length > 0 ? section.deeper : (fetched ?? []);
  // On-demand authoring is offered only when the drawer arrived empty AND this section's cards
  // match the live turn that parked a deepen context (deepenStore) — content addressing, so a
  // baked demo/tour/restored spec matches nothing and keeps today's exact behavior.
  const fetchable =
    section.deeper.length === 0 &&
    fetched === null &&
    deepenOffered(section.label, section.standard);
  const hasDeeper = deeper.length > 0 || fetchable;
  // Reading mode expands drawers that HAVE content; it never fires N requests at once.
  const isOpen = (readingMode && deeper.length > 0) || localOpen;
  // Stable id for aria-controls: derived from order (always a number) to avoid
  // needing to sanitise an arbitrary label string into a valid HTML id.
  const drawerId = `depth-drawer-${section.order}`;

  const toggle = (): void => {
    const opening = !localOpen;
    setLocalOpen(opening);
    if (!opening || !fetchable || pending) return;
    setPending(true);
    // Dynamic import: ./deepen reaches the engine + providers, which must stay out of the
    // canvas chunk (tests/eager-bundle.test.ts). A drawer can only open after a live turn
    // already loaded them, so this resolves from the module cache.
    void import('../../live/depth/deepen')
      .then(({ deepenSection }) => deepenSection(section.label, section.standard))
      .then((blocks) => {
        if (!alive.current) return;
        setPending(false);
        // Nothing usable — put the affordance back and say nothing (a press later retries;
        // failures are never memoised). Mirrors the world's expand-chip behavior.
        if (blocks && blocks.length > 0) setFetched(blocks);
        else setLocalOpen(false);
      })
      .catch(() => {
        if (!alive.current) return;
        setPending(false);
        setLocalOpen(false);
      });
  };

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
              aria-busy={pending || undefined}
              onClick={toggle}
            >
              <Icon.arrowDown className="depth-deeper-icon" aria-hidden="true" />
              Go deeper
              {deeper.length > 0 && <span className="depth-deeper-count">({deeper.length})</span>}
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
            <div className="card-grid depth-drawer-grid" aria-busy={pending || undefined}>
              {pending && deeper.length === 0 ? (
                <CanvasSkeleton blocks={DRAWER_SKELETON} />
              ) : (
                deeper.map((b, i) => renderCard(b, section.standard.length + i))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
