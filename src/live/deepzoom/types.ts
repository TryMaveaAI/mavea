// types.ts — data model for the deep-zoom tree surface.
// The session is a tree of zoom levels. The "trunk" is the default 10-level path;
// branches extend from any trunk (or branch) node when the user picks a different chip.

export interface ZoomLevel {
  scale: number;
  multiplier: string;
  scaleLabel: string;
  title: string;
  body: string;
  subtopics: string[];
  selectedIndex: number; // which subtopic the auto-generated path follows by default
}

// Flat node in the tree. Tree structure is via parentId.
export interface ZoomNode {
  id: number;
  parentId: number | null;
  viaSubtopic: string | null; // which chip of the parent triggered this node
  level: ZoomLevel;
  depth: number; // distance from root (root = 0)
}

export interface ZoomTree {
  query: string;
  rangeStart: string;
  nodes: ZoomNode[]; // ALL nodes ever created (trunk + all branches)
  trunkIds: number[]; // root + default-chip chain (the pre-generated trunk)
}
