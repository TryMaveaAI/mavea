import { createElement, type ComponentType, type ReactNode } from 'react';

/** Render `common` forwarded to every extended block (the renderer narrows what it passes). */
export interface BlockCommon {
  delay?: number;
  spotlight?: boolean;
  dimmed?: boolean;
  /** The block's own id, when it has one — lets a block register itself with an external driver
   *  (see canvas/focus/stepDriver.ts) keyed on the same id the spotlight/dim wrapper already
   *  uses. Most entries ignore it; `entry()` only forwards `delay`. */
  blockId?: string;
  /** Report that this block cannot render any real content and should be dropped from the canvas
   *  so the grid reflows (no empty cell / broken placeholder). Only a block that loads external
   *  content it can't fall back from — today just `photo` when every candidate URL fails to
   *  decode AND it carries no caption/title to degrade to — calls this; the canvas removes the id
   *  and re-tiles. Most entries ignore it. */
  onUnrenderable?: (id: string) => void;
}

/**
 * Build a registry entry from a component for the common case: forward `delay` and cast the
 * registry's `unknown` props to the component's own prop type. Because the prop type is
 * INFERRED from the component, a mismatched component/props pairing is caught at build —
 * unlike a free `p as SomeProps` cast, which would silently accept the wrong type. An entry
 * that needs spotlight/dimmed or extra wiring stays an explicit arrow function.
 */
export function entry<P>(Comp: ComponentType<P & { delay?: number }>) {
  return (props: unknown, common: BlockCommon): ReactNode =>
    createElement(Comp, { ...(props as P), delay: common.delay });
}

/**
 * A family registry maps a block `type` key → a render fn. `props` is `unknown` at the
 * registry boundary; each entry casts to its own typed props (e.g. `p as TreemapProps`).
 * Spotlight/dim is applied by the grid WRAPPER (via the block `id`), so most entries only
 * forward `delay`.
 *
 * This is the RENDER contract. The machine-readable description Live reasons over — which
 * block fits an ask, what props it needs, and how to coerce loose model JSON into them — is
 * the ComponentMeta catalog (`catalog/meta.ts` + `catalog/catalog.data.ts`), the single
 * source of truth for the block standard. See docs/ADDING-A-COMPONENT.md.
 */
export type BlockRegistry = Record<string, (props: unknown, common: BlockCommon) => ReactNode>;
