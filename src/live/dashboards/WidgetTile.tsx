// WidgetTile — one dashboard widget, rendered read-only: its
// (projected) Block wrapped in a minimal ConversationSpec and mounted through TopicCanvas, so it
// inherits the card / reveal / overflow / theme system exactly like a live canvas card. The tile's
// column span is owned by the OUTER dashboard grid (so the user's S/M/L layout is authoritative);
// edit chrome lives outside the block and is added by the detail view in edit mode.
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { TopicCanvas } from '../../canvas';
import type { Block, ConversationSpec } from '../../data/conversation';
import { projectWidgetBlock } from './project';
import type { Dashboard, Widget } from './types';

function tileSpec(block: Block): ConversationSpec {
  return {
    id: 'dash-' + (block.id ?? block.type),
    workspace: 'Dashboards',
    title: '',
    sub: '',
    opener: '',
    context: [],
    blocks: [{ ...block, col: 12, delay: 0 } as Block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

export function WidgetTile({
  dashboard,
  widget,
  editing,
  dragging,
  children,
  footer,
}: {
  dashboard: Dashboard;
  widget: Widget;
  /** Edit mode adds the chrome border + makes the tile a reorder target. */
  editing?: boolean;
  /** This tile is the one being dragged (lifted styling). */
  dragging?: boolean;
  /** Edit-mode chrome (drag handle / span / remove), overlaid by the detail view. */
  children?: ReactNode;
  /** Optional control rendered below the widget (e.g. fill-in for a user-supplied metric). */
  footer?: ReactNode;
}): ReactElement {
  // projectWidgetBlock rebuilds a fresh props object for chrome/metric-linked widgets (their whole
  // point is projecting live state, not passing a stored value through) — memoize it so `block`'s
  // identity stays stable across a re-render that didn't actually change this widget's data (e.g.
  // the header's 30s clock tick, or the store updating a SIBLING widget). Without this, `block` (and
  // the `spec`/`data.blocks` derived from it below) recreate every render, which resets
  // useBlockFamilies' effect deps on every render too — tearing down and restarting its
  // load-then-rerender cycle before an in-flight family import ever gets to call back, so an
  // extended-library block (thesis/alignmentgauge/standingalerts/sourceslineage, or anything a
  // template pins) can end up stuck on the empty "still loading" placeholder forever.
  const block = useMemo(() => projectWidgetBlock(dashboard, widget), [dashboard, widget]);
  const spec = useMemo(() => tileSpec(block), [block]);
  const cls = [
    'dash-tile',
    `dash-span-${widget.span}`,
    editing ? 'dash-tile--editing' : '',
    dragging ? 'dash-tile--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-dash-widget={widget.id}>
      {children}
      <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} />
      {footer}
    </div>
  );
}
