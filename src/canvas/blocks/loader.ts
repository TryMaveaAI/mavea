// loader.ts — the async boundary that lets a canvas render load only the block families it
// actually uses. The merged library (blocks/index.ts) is ~1.5 MB of components; splitting it
// per family means a typical answer fetches ~4-8 small chunks instead of everything, which is
// the difference between "instant" and "parse storm" on an old machine. Surfaces that truly
// want the whole library at once (the gallery, tests) prime the merged registry instead and
// stay fully synchronous.
import type { BlockRegistry, BlockCommon } from './registry-types';
import type { ReactNode } from 'react';
import { FAMILY_OF, type BlockFamily } from './familyMap';
import { lazyRetry } from '../../lib/lazyRetry';

// One explicit line per family (mirrors blocks/index.ts) so Rollup sees 24 static import()
// targets and emits one chunk per family — a computed path would defeat the split.
const FAMILY_IMPORTS: Record<BlockFamily, () => Promise<BlockRegistry>> = {
  charts1: lazyRetry(() => import('./charts1/registry').then((m) => m.charts1Registry)),
  charts2: lazyRetry(() => import('./charts2/registry').then((m) => m.charts2Registry)),
  stats: lazyRetry(() => import('./stats/registry').then((m) => m.statsRegistry)),
  tables: lazyRetry(() => import('./tables/registry').then((m) => m.tablesRegistry)),
  flows: lazyRetry(() => import('./flows/registry').then((m) => m.flowsRegistry)),
  docs: lazyRetry(() => import('./docs/registry').then((m) => m.docsRegistry)),
  ai: lazyRetry(() => import('./ai/registry').then((m) => m.aiRegistry)),
  briefs: lazyRetry(() => import('./briefs/registry').then((m) => m.briefsRegistry)),
  media: lazyRetry(() => import('./media/registry').then((m) => m.mediaRegistry)),
  layout: lazyRetry(() => import('./layout/registry').then((m) => m.layoutRegistry)),
  status: lazyRetry(() => import('./status/registry').then((m) => m.statusRegistry)),
  overlays: lazyRetry(() => import('./overlays/registry').then((m) => m.overlaysRegistry)),
  forms: lazyRetry(() => import('./forms/registry').then((m) => m.formsRegistry)),
  pickers: lazyRetry(() => import('./pickers/registry').then((m) => m.pickersRegistry)),
  nav: lazyRetry(() => import('./nav/registry').then((m) => m.navRegistry)),
  display: lazyRetry(() => import('./display/registry').then((m) => m.displayRegistry)),
  diagrams: lazyRetry(() => import('./diagrams/registry').then((m) => m.diagramsRegistry)),
  learn: lazyRetry(() => import('./learn/registry').then((m) => m.learnRegistry)),
  compose: lazyRetry(() => import('./compose/registry').then((m) => m.composeRegistry)),
  everyday: lazyRetry(() => import('./everyday/registry').then((m) => m.everydayRegistry)),
  reference: lazyRetry(() => import('./reference/registry').then((m) => m.referenceRegistry)),
  code: lazyRetry(() => import('./code/registry').then((m) => m.codeRegistry)),
  dashboard: lazyRetry(() => import('./dashboard/registry').then((m) => m.dashboardRegistry)),
  finance: lazyRetry(() => import('./finance/registry').then((m) => m.financeRegistry)),
};

const loaded = new Map<BlockFamily, BlockRegistry>();
const inflight = new Map<BlockFamily, Promise<void>>();
// A family whose chunk genuinely failed (past lazyRetry's one reload): its blocks render as
// absent cells — the same graceful meaning an unknown type already has — and siblings keep going.
const failed = new Set<BlockFamily>();
// Sync escape hatch: the gallery (and the test suites that mount TopicCanvas directly) already
// hold the whole merged registry — priming it makes every lookup synchronous with zero fetches.
let primed: BlockRegistry | null = null;

/** How deep familiesFor follows nested blocks (composite regions) — mirrors renderBlock's cap. */
const MAX_NEST = 2;

type BlockLike = { type: string; props?: unknown };

function collect(blocks: readonly BlockLike[], into: Set<BlockFamily>, depth: number): void {
  for (const b of blocks) {
    const fam = FAMILY_OF[b.type];
    if (fam) into.add(fam);
    if (depth >= MAX_NEST) continue;
    // A composite hosts other blocks in its regions — their families load with it.
    const regions = (b.props as { regions?: unknown } | undefined)?.regions;
    if (Array.isArray(regions)) {
      const nested = regions
        .map((r) => (r && typeof r === 'object' ? (r as { block?: unknown }).block : null))
        .filter((n): n is BlockLike => !!n && typeof (n as BlockLike).type === 'string');
      if (nested.length) collect(nested, into, depth + 1);
    }
  }
}

/** The set of families an answer's blocks resolve to (core-union types resolve to none). */
export function familiesFor(blocks: readonly BlockLike[]): Set<BlockFamily> {
  const fams = new Set<BlockFamily>();
  collect(blocks, fams, 0);
  return fams;
}

/** True when every family is already available (loaded, primed, or known-failed) — i.e. a
 *  render right now would show everything it's ever going to. */
export function familiesReady(fams: Iterable<BlockFamily>): boolean {
  if (primed) return true;
  for (const f of fams) if (!loaded.has(f) && !failed.has(f)) return false;
  return true;
}

/** Fetch every family in `fams` (deduped against in-flight loads). Resolves when all have
 *  settled — a failed family marks itself and never blocks its siblings. */
export function loadFamilies(fams: Iterable<BlockFamily>): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const f of fams) {
    if (loaded.has(f) || failed.has(f)) continue;
    let p = inflight.get(f);
    if (!p) {
      p = FAMILY_IMPORTS[f]()
        .then((reg) => {
          loaded.set(f, reg);
        })
        .catch(() => {
          failed.add(f);
        })
        .finally(() => {
          inflight.delete(f);
        });
      inflight.set(f, p);
    }
    waits.push(p);
  }
  return waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve();
}

/** Kick off the fetches for an answer's families without waiting — called from the turn
 *  pipeline while the answer is still streaming/thinking, so the chunks overlap that time. */
export function preloadBlockFamilies(blocks: readonly BlockLike[]): void {
  void loadFamilies(familiesFor(blocks));
}

/** The renderer for an extended block type, or null while its family hasn't loaded (or the
 *  type is unknown) — the caller renders nothing, exactly like an unknown type today. */
export function extendedRender(
  type: string,
): ((props: unknown, common: BlockCommon) => ReactNode) | null {
  if (primed) return primed[type] ?? null;
  const fam = FAMILY_OF[type];
  if (!fam) return null;
  return loaded.get(fam)?.[type] ?? null;
}

/** Make every lookup synchronous by handing the loader the already-merged registry — for the
 *  gallery (which statically imports every family anyway) and for tests that mount TopicCanvas
 *  and assert on the same tick. */
export function primeExtendedRegistry(registry: BlockRegistry): void {
  primed = registry;
}
