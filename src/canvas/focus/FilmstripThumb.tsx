// A real, miniature render of a block for the Focus-mode filmstrip — not an icon. We render the
// actual component at a comfortable design width and let CSS scale the whole thing down into the
// rail box (a transform, exactly like the Story stage's Camera). Because it's the genuine card,
// the thumbnail always matches what taking the stage will show.
import { memo } from 'react';
import type { ReactNode } from 'react';
import type { Block } from '../../data/conversation';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';

/** The width the real card renders at before CSS scales it into the thumb box (matches the Story
 *  stage's DESIGN_WIDTH idea — render at a real card width, then shrink). */
const THUMB_DESIGN_W = 340;

interface Props {
  block: Block;
  renderBlock: (b: Block, depth?: number) => ReactNode;
}

function FilmstripThumbBase({ block, renderBlock }: Props) {
  // `inert` so this decorative mini-render is fully non-interactive: its real card can contain
  // buttons/links (source chips, "prove it"), which must never take focus or tab order here, and —
  // since the entry itself is the control — must not nest as interactive-in-interactive.
  return (
    <span className="filmstrip-thumb" aria-hidden="true" inert>
      <span className="filmstrip-thumb-design" style={{ width: THUMB_DESIGN_W }}>
        <BlockBoundary fallback={<FallbackCard block={block} />}>
          {renderBlock(block)}
        </BlockBoundary>
      </span>
    </span>
  );
}

// Memoized on the BLOCK only. `renderBlock` is a fresh closure every TopicCanvas render (it closes
// over the live `spot`), so a default memo would re-render every thumbnail on every narration beat.
// The thumbnail's output depends only on the block — the live spotlight/dim treatment is neutralized
// in CSS and the active-card ring lives on the wrapping entry, never here — so ignoring renderBlock's
// identity is correct and keeps the rail cheap as the hero glides beat to beat.
export const FilmstripThumb = memo(FilmstripThumbBase, (prev, next) => prev.block === next.block);
