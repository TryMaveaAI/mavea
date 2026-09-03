// Focus mode: one card on a center stage, the rest waiting in a quiet filmstrip — the answer
// paced like a friend across the table. The stage AUTO-FOLLOWS the conversation: the hero is
// whatever block Mavéa is narrating (`spot`), which the existing tour engine already drives beat by
// beat, so following the conversation is free. A tap on a filmstrip card takes the wheel and pins
// it until the next answer. The hero renders through the SAME renderBlock the grid uses, so every
// one of the 269 block types takes the stage at full fidelity.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { answerSignature, type Block, type ConversationSpec } from '../../data/conversation';
import { Icon } from '../../icons/icons';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';
import { blockLabel } from '../blockLabel';
import { defaultHeroId } from './heroSelect';
import { FilmstripRail } from './FilmstripRail';
import { prefersReducedMotion } from './motion';
import './focus.css';

/** How long the outgoing card lingers while it fades + parallaxes out (matches --m-expressive). */
const SWAP_MS = 560;

interface Props {
  data: ConversationSpec;
  /** The viewport-laid-out blocks (already responsive-sized) from TopicCanvas. */
  blocks: Block[];
  /** The block Mavéa is currently narrating (drives the auto-follow). */
  spot: string | null;
  /** TopicCanvas's renderer — the single source of truth for block → component. */
  renderBlock: (b: Block, depth?: number) => ReactNode;
  /** Live-only: tap "ask about this" on the hero to pin it for a follow-up. */
  onAskBlock?: (b: Block) => void;
  selectedBlockIds?: ReadonlySet<string>;
  /** Tapping a filmstrip card asks the surface to speak a line about it (and quiet the auto-tour),
   *  so the stage feels like a friend explaining whatever you point at. */
  onNarrate?: (b: Block) => void;
  /** The block Mavéa is currently narrating — the hero + its rail entry show a quiet "speaking" cue. */
  narratingId?: string | null;
  /** Output is muted: no voice, so the stage reads calmly — the "speaking" cue is dropped and the
   *  caption below the hero falls back to the block's own note. */
  muted?: boolean;
  /** Live-only: the muted walk's written asides so far, in walk order — shown as a trail column
   *  beside the stage ("Mavéa's notes"), each note clickable to bring its card back on stage.
   *  The caption below the hero stays the CURRENT stop's words; the trail is what's been said. */
  walkNotes?: readonly { spot: string; text: string }[];
  /** Present mode: hides the filmstrip, shows a slide nav bar, wires ← → keys. */
  presenting?: boolean;
  /** Live's per-answer counter, fixed while a turn's blocks stream in. Gallery and test mounts
   *  omit it and fall back to a content digest. */
  answerEpoch?: number;
}

export function FocusStage({
  data,
  blocks,
  spot,
  renderBlock,
  onAskBlock,
  selectedBlockIds,
  onNarrate,
  narratingId,
  muted,
  walkNotes,
  presenting,
  answerEpoch,
}: Props) {
  // Only id-bearing blocks can hold the stage or appear in the rail (the spotlightable set).
  const railBlocks = useMemo(() => blocks.filter((b) => !!b.id), [blocks]);

  // A manual pick (tapping a rail card) overrides the auto-tour until the next answer arrives.
  const [pinned, setPinned] = useState<string | null>(null);
  // Keyed on the ANSWER, not `data.id`: a live spec's id is the constant 'live', so a follow-up
  // that MERGES (the canvas is not remounted, and the pinned id is still in the merged blocks)
  // left the stage holding the previous answer's card while Mavéa narrated the new one.
  const answerKey = useMemo(
    () => answerEpoch ?? answerSignature({ id: data.id, blocks: data.blocks }),
    [answerEpoch, data.id, data.blocks],
  );
  useEffect(() => setPinned(null), [answerKey]);

  // Take the wheel on a tap: pin the card AND have Mavéa speak about it (the surface owns TTS +
  // quieting the running tour, so we don't reach across into its speech state from here).
  const handlePick = useCallback(
    (id: string) => {
      setPinned(id);
      const block = railBlocks.find((b) => b.id === id);
      if (block) onNarrate?.(block);
    },
    [railBlocks, onNarrate],
  );

  // The hero: a still-valid manual pick, else whatever Mavéa is narrating, else the resting default.
  const heroId =
    (pinned && railBlocks.some((b) => b.id === pinned) ? pinned : null) ??
    (spot && railBlocks.some((b) => b.id === spot) ? spot : null) ??
    defaultHeroId(railBlocks);
  const heroBlock = railBlocks.find((b) => b.id === heroId) ?? railBlocks[0];

  // The cinematic swap: as the hero changes, the new card glides in (fade + parallax) while the
  // outgoing one briefly lingers and fades out over it — a real crossfade rather than a hard cut.
  // The outgoing layer is kept only for the animation window, then dropped. Reduced motion skips
  // it entirely (an instant cut), so there's never a stale layer lying around.
  const [outgoingId, setOutgoingId] = useState<string | null>(null);
  const prevHeroRef = useRef(heroBlock?.id ?? null);
  useEffect(() => {
    const next = heroBlock?.id ?? null;
    if (next === prevHeroRef.current) return;
    const prev = prevHeroRef.current;
    prevHeroRef.current = next;
    if (!prev || prefersReducedMotion()) {
      setOutgoingId(null);
      return;
    }
    setOutgoingId(prev);
    const t = window.setTimeout(() => setOutgoingId(null), SWAP_MS);
    return () => window.clearTimeout(t);
  }, [heroBlock?.id]);

  const heroPicked = !!heroBlock?.id && !!selectedBlockIds?.has(heroBlock.id);
  // No "speaking" cue when muted — there's no voice to signal.
  const heroSpeaking = !muted && !!heroBlock?.id && narratingId === heroBlock.id;
  const heroCaption = heroBlock?.note || null;
  const outgoingBlock =
    outgoingId && outgoingId !== heroBlock?.id
      ? railBlocks.find((b) => b.id === outgoingId)
      : undefined;

  // Present-mode navigation: index of the current hero within the rail.
  const currentIndex = railBlocks.findIndex((b) => b.id === heroBlock?.id);
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) handlePick(railBlocks[currentIndex - 1].id!);
  }, [currentIndex, railBlocks, handlePick]);
  const handleNext = useCallback(() => {
    if (currentIndex < railBlocks.length - 1) handlePick(railBlocks[currentIndex + 1].id!);
  }, [currentIndex, railBlocks, handlePick]);

  // Keyboard navigation in present mode (← → / Space to advance, the host owns Esc).
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, handlePrev, handleNext]);

  // All hooks above run every render; only now is it safe to bail when there's no hero.
  if (!heroBlock) return null;

  // The muted walk's written trail — newest first, the way notes stack in a margin. Clicking a
  // note brings its card back on stage (the same take-the-wheel path as a filmstrip tap). The
  // full spatial handout lives in Everything view; this column is the Focus-sized cut of it.
  const trailNotes =
    !presenting && walkNotes && walkNotes.length > 0 ? [...walkNotes].reverse() : null;

  return (
    // `has-notes` widens the grid template for the trail column — a class set here rather than
    // a CSS :has() so the layout can never split from the render condition.
    <div className={'focus-stage' + (trailNotes ? ' has-notes' : '')}>
      {trailNotes && (
        <aside className="focus-notes" aria-label="Mavéa's notes">
          <div className="focus-notes-eyebrow">Mavéa’s notes</div>
          <ol className="focus-notes-list">
            {trailNotes.map((n) => (
              <li key={n.spot}>
                <button
                  type="button"
                  className={'focus-note' + (n.spot === heroBlock?.id ? ' active' : '')}
                  onClick={() => handlePick(n.spot)}
                  title="Bring this card back on stage"
                >
                  {n.text}
                </button>
              </li>
            ))}
          </ol>
        </aside>
      )}
      <div className="focus-main">
        <div className="focus-hero">
          {outgoingBlock && (
            <div
              className="focus-hero-card focus-out"
              key={'out-' + outgoingBlock.id}
              aria-hidden="true"
            >
              <BlockBoundary fallback={<FallbackCard block={outgoingBlock} />}>
                {renderBlock(outgoingBlock)}
              </BlockBoundary>
            </div>
          )}
          {/* Keyed by id so a hero change remounts the card and replays its glide-in.
              data-spot-id mirrors the grid wrapper so spot-anchored chrome (the drawn
              annotation layer) finds the hero on this stage too. */}
          <div
            className="focus-hero-card focus-in askable"
            key={heroBlock.id}
            data-spot-id={heroBlock.id}
          >
            {heroSpeaking && (
              <div className="focus-speaking" aria-hidden="true">
                <span className="focus-speaking-bars">
                  <i />
                  <i />
                  <i />
                </span>
                Speaking
              </div>
            )}
            <BlockBoundary fallback={<FallbackCard block={heroBlock} />}>
              {renderBlock(heroBlock)}
            </BlockBoundary>
            {onAskBlock && heroBlock.id && (
              <div className="block-actions">
                <button
                  type="button"
                  className={'block-action-pill block-ask' + (heroPicked ? ' picked' : '')}
                  aria-pressed={heroPicked}
                  aria-label={
                    heroPicked
                      ? `Unpin ${blockLabel(heroBlock)}`
                      : `Ask about ${blockLabel(heroBlock)}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onAskBlock(heroBlock);
                  }}
                >
                  <Icon.chat />
                  <span className="block-pill-label">{heroPicked ? 'Selected' : 'Ask'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {/* The model's one-line explanation of THIS slide — shown beneath it (and spoken by the
            surface as the slide takes the stage). Keyed by hero id so it crossfades in with the
            card. Absent on Demo blocks and any the model omitted, so the stage stays clean. */}
        {heroCaption && (
          <p className="focus-caption" key={'cap-' + heroBlock.id} aria-live="polite">
            {heroCaption}
          </p>
        )}
      </div>
      {presenting ? (
        <>
          {/* Large click zones flanking the slide — invisible at rest, chevron on hover.
              These are the primary mouse affordance; keyboard (← → Space) is wired above. */}
          <button
            type="button"
            className="present-arrow present-arrow-prev"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
            aria-label="Previous slide"
          >
            <Icon.chevL />
          </button>
          <button
            type="button"
            className="present-arrow present-arrow-next"
            onClick={handleNext}
            disabled={currentIndex >= railBlocks.length - 1}
            aria-label="Next slide"
          >
            <Icon.chevR />
          </button>
          {/* Slide counter — centered at the bottom, minimal */}
          <div className="present-nav" aria-label="Slide navigation">
            <span className="present-nav-count" aria-live="polite" aria-atomic="true">
              {currentIndex + 1} <span aria-hidden="true">/</span> {railBlocks.length}
            </span>
          </div>
        </>
      ) : (
        <FilmstripRail
          blocks={railBlocks}
          activeId={heroBlock.id ?? null}
          narratingId={narratingId ?? null}
          onPick={handlePick}
          renderBlock={renderBlock}
        />
      )}
    </div>
  );
}
