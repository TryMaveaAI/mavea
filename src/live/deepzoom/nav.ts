// nav.ts — pure navigation + scale-ladder model for the deep-zoom surface.
//
// Everything here is side-effect-free so it can be unit-tested in isolation: the
// scale-colour spectrum, the default-path walk, the zoom-in planner (the fork /
// resume / branch decision), and the scale-ladder view model the UI renders from.
import type { ZoomLevel, ZoomNode, ZoomTree } from './types';

// ── scale colour ────────────────────────────────────────────────────────
// The ten --dz-* accents form the descent spectrum. Depth cycles the ten so a
// branch that drills past level 10 keeps a distinct, moving colour rather than
// flat-lining on the last hue.
const SCALE_COLOR_COUNT = 10;

export function scaleColor(depth: number): string {
  const i = ((depth % SCALE_COLOR_COUNT) + SCALE_COLOR_COUNT) % SCALE_COLOR_COUNT;
  return `var(--dz-${i})`;
}

// ── default-path walk ───────────────────────────────────────────────────
// From a node, follow each level's default-selected chip down through already
// generated children — the pre-baked "trunk" path the model laid out.
export function buildDefaultPath(nodes: ZoomNode[], start: ZoomNode): ZoomNode[] {
  const path = [start];
  let cur = start;
  for (;;) {
    const topic = cur.level.subtopics[cur.level.selectedIndex];
    const child = nodes.find((n) => n.parentId === cur.id && n.viaSubtopic === topic);
    if (!child) break;
    path.push(child);
    cur = child;
  }
  return path;
}

// ── zoom-in planner ─────────────────────────────────────────────────────
// Deciding what "zoom into <chip>" does at a given depth is the one piece of
// real branching logic. Kept pure so the component just applies the result.
export type ZoomPlan =
  | { kind: 'navigate'; navPath: number[]; chipSels: number[]; target: number }
  | {
      kind: 'branch';
      navPath: number[];
      chipSels: number[];
      parentId: number;
      subtopic: string;
      parentLevel: ZoomLevel;
      parentDepth: number;
    };

/**
 * Resolve what should happen when the reader zooms in from `atIdx`.
 * - `navigate`: the deeper path already exists (resume it, or fork onto a
 *   sibling chip whose subtree was generated earlier).
 * - `branch`: nothing exists for the chosen chip yet — the caller must generate
 *   ten more levels. The returned path is already truncated to the fork point so
 *   any stale forward history is dropped the moment we commit to the new branch.
 * Returns `null` when there is nothing to do (missing node).
 */
export function planZoomIn(
  tree: ZoomTree,
  navPath: number[],
  chipSels: number[],
  atIdx: number,
): ZoomPlan | null {
  const currentId = navPath[atIdx];
  const currentNode = tree.nodes.find((n) => n.id === currentId);
  if (!currentNode) return null;

  const chipIdx = chipSels[atIdx] ?? currentNode.level.selectedIndex;
  const topic = currentNode.level.subtopics[chipIdx] ?? currentNode.level.subtopics[0];

  // The path already continues along this exact chip — just walk forward.
  const nextId = navPath[atIdx + 1];
  if (nextId !== undefined) {
    const nextNode = tree.nodes.find((n) => n.id === nextId);
    if (nextNode?.viaSubtopic === topic) {
      return { kind: 'navigate', navPath, chipSels, target: atIdx + 1 };
    }
  }

  // A previously generated subtree exists for this chip (a sibling fork) — resume it.
  const child = tree.nodes.find((n) => n.parentId === currentId && n.viaSubtopic === topic);
  if (child) {
    const chain = buildDefaultPath(tree.nodes, child);
    const navHead = navPath.slice(0, atIdx + 1);
    const selHead = chipSels.slice(0, atIdx + 1);
    return {
      kind: 'navigate',
      navPath: [...navHead, ...chain.map((n) => n.id)],
      chipSels: [...selHead, ...chain.map((n) => n.level.selectedIndex)],
      target: atIdx + 1,
    };
  }

  // Nothing generated for this chip yet — request a fresh branch from the fork point.
  return {
    kind: 'branch',
    navPath: navPath.slice(0, atIdx + 1),
    chipSels: chipSels.slice(0, atIdx + 1),
    parentId: currentId,
    subtopic: topic,
    parentLevel: currentNode.level,
    parentDepth: currentNode.depth,
  };
}

// ── scale-ladder view model ─────────────────────────────────────────────
// The single navigator: one stop per level on the active path, each carrying its
// power-of-ten readout, poetic scale label, and spectrum colour.
export interface ScaleStop {
  id: number;
  index: number;
  multiplier: string;
  label: string;
  title: string;
  color: string;
  state: 'past' | 'current' | 'future';
}

export function scaleStops(navNodes: ZoomNode[], current: number): ScaleStop[] {
  return navNodes.map((node, i) => ({
    id: node.id,
    index: i,
    multiplier: node.level.multiplier,
    label: node.level.scaleLabel,
    title: node.level.title,
    color: scaleColor(node.depth),
    state: i === current ? 'current' : i < current ? 'past' : 'future',
  }));
}
