// renderBlockBare — render a single extended-library block as its real component, with no card
// wrapper concerns of its own. The figure frame (FigureEmbed) supplies the chrome; this just
// produces the component node from the same registry the live canvas uses, so an embedded figure
// is the *actual* block, never a re-implementation that could drift.
//
// Only the extended library (charts1/charts2/diagrams/learn/code/media — the families that
// `embedClass` marks embeddable) is reachable here; core blocks keep their designed export
// archetypes and never reach the figure path, so the core render switch is not duplicated.
import type { ReactNode } from 'react';
import type { Block } from '../../data/conversation';
import { EXTENDED_REGISTRY } from '../blocks';
import { BlockBoundary } from '../BlockBoundary';
import { FallbackCard } from '../FallbackCard';

/** The minimal block shape the bare renderer needs (the full `Block` union satisfies it). */
export interface BareBlock {
  type: string;
  props?: unknown;
  delay?: number;
}

/**
 * The real component for a block, or its plain-text FallbackCard when the type isn't in the
 * extended registry or the component throws — an exported figure must carry the block's real
 * content, never an empty frame. `delay` is forced to 0 — the reveal stagger is meaningless
 * in a static capture.
 */
export function renderBlockBare(block: BareBlock): ReactNode {
  // FallbackCard only reads type/props/delay, which BareBlock carries by construction.
  const asBlock = block as Block;
  const render = EXTENDED_REGISTRY[block.type];
  if (!render) return <FallbackCard block={asBlock} />;
  return (
    <BlockBoundary fallback={<FallbackCard block={asBlock} />}>
      {render(block.props, { delay: 0 })}
    </BlockBoundary>
  );
}
