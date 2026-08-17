// World preview — the slim marker a living answer leaves in the canvas. The world is a VIEW of the
// answer now (the header's "View as living answer", peer to Focus and the spatial canvas), so this card is
// no longer the way in: it is the way the world TRAVELS. Keeping the `world` block in spec.blocks is
// what carries the causal web into the library, a replay, a share, an export and the demo baker —
// and this strip is what that block looks like when the cards are simply being read.
//
// So it stays deliberately small and cheap: what the world explains, how much of it is receipted,
// and a second door into the view. The explorable surface — morphing representations, provenance
// cards, what-if levers — lives in live/world's overlay and is reached through the openWorld
// registry, so this card carries no live/ overlay and no morph stage, and renders perfectly well in
// the gallery, an export, or a replay where nothing can open it.
//
// Most of the time there is no world to open yet: a turn OFFERS one for free (the question and the
// answer's headline, which it already had) and the model call that builds it runs when the reader
// enters the view. So the unbuilt state is the normal one, and it says so plainly rather than
// pretending to a web it hasn't paid for.
//
// Not one figure FROM the world is printed here. A node's value only means something next to its
// receipt, and this strip has no room for one — so it counts structure and evidence, and leaves
// every measured number to the surface that can prove it.
import { useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import {
  hasWorldOpener,
  requestOpenWorld,
  subscribeWorldOpener,
} from '../../../live/world/openWorld';
import { STATUS_LABEL } from '../../../live/trust/display';
import { isReal } from '../../../live/ground/types';
import type { WorldSpec } from '../../../live/world/types';
import type { WorldPreviewProps } from './types';

/** How much of this world is actually backed: every verified receipt on a node or an edge. A
 *  count of the evidence, never a figure from it. */
function receiptCount(spec: WorldSpec): number {
  let n = 0;
  for (const node of spec.nodes) {
    if (node.receipt) n += 1;
    if (node.series?.receipt) n += 1;
    for (const point of node.series?.points ?? []) if (point.receipt) n += 1;
    for (const child of node.children ?? []) if (child.receipt) n += 1;
  }
  for (const edge of spec.edges) {
    n += edge.receipts?.length ?? (edge.receipt ? 1 : 0);
    if (edge.counter) n += 1;
  }
  return n;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

type Props = WorldPreviewProps & { delay?: number; blockId?: string };

export function WorldPreview({ title, world, outcome, delay, blockId }: Props) {
  const receipts = useMemo(() => (world ? receiptCount(world) : 0), [world]);
  // Per-instance subscription, not a context: arming the button must re-render this card only.
  const openable = useSyncExternalStore(subscribeWorldOpener, hasWorldOpener, () => false);

  const illustrative = world?.provenance.illustrative === true;
  const outcomeNode = world?.nodes.find((n) => n.id === world.outcomeId);
  const explains = outcomeNode?.label ?? outcome;
  const grounded = world?.nodes.some((n) => isReal(n.tier)) === true;

  return (
    <div
      className="card reveal dg-card wp-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.globe className="ic" style={{ color: 'var(--presence)' }} /> Living answer
        {illustrative && <span className="wp-badge">{STATUS_LABEL.illustrative}</span>}
      </div>

      <h3 className="wp-question">{title}</h3>

      {explains && <p className="wp-outcome">Explains: {explains}</p>}

      {world ? (
        <p className="wp-meta">
          {plural(world.nodes.length, 'cause', 'causes')} ·{' '}
          {plural(world.edges.length, 'link', 'links')} ·{' '}
          {receipts > 0
            ? plural(receipts, 'receipt', 'receipts')
            : grounded
              ? 'no receipts yet'
              : 'structure only, no numbers'}
        </p>
      ) : (
        // The cost model, said plainly on the card that would spend it: the answer above was
        // billed once, and this world is built only if the reader actually wants it.
        <p className="wp-meta">Built when you open it — one model call, then it's kept.</p>
      )}

      {openable && blockId && (
        <button type="button" className="wp-open" onClick={() => requestOpenWorld(blockId)}>
          Open the world
          <Icon.chevR className="ic" />
        </button>
      )}
    </div>
  );
}
