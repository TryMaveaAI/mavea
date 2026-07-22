// A hand-authored Deep Zoom telescope, so the walkthrough can show the feature working with NO
// model call and NO key. The real feature generates its levels live; this is one curated,
// illustrative descent (a leaf, from the plant down to a photon of light) — clearly a demo, using
// the exact same ZoomTree the live surface renders. DeepZoomApp loads it on `#/deepzoom?demo=1`.
import type { ZoomLevel, ZoomNode, ZoomTree } from './types';

const MULT = ['×1', '×10', '×100', '×1k', '×10k', '×100k', '×1M', '×10M'];

/** The trunk levels, broadest first — each zooms into `subtopics[selectedIndex]` of the one above. */
const RAW: Omit<ZoomLevel, 'scale' | 'multiplier'>[] = [
  {
    scaleLabel: 'THE PLANT',
    title: 'A plant, quietly eating light',
    body: 'Every green thing you can see is running the same trick: turning sunlight, air, and water into sugar. The work happens where the light lands — the leaves.',
    subtopics: ['The leaves', 'The roots', 'The stem', 'The flowers'],
    selectedIndex: 0,
  },
  {
    scaleLabel: 'THE LEAF',
    title: 'One leaf, a solar panel',
    body: 'A single leaf spreads thin and flat to catch as much sun as it can. Veins pipe water in, tiny pores let air in, and the green comes from the layer inside.',
    subtopics: ['The waxy surface', 'The veins', 'The inner tissue', 'The pores'],
    selectedIndex: 2,
  },
  {
    scaleLabel: 'THE TISSUE',
    title: 'Cells stacked like bricks of green',
    body: 'Just under the surface, cells sit shoulder to shoulder, each stuffed with green specks. Gaps between them let carbon dioxide drift in to be caught.',
    subtopics: ['Column-shaped cells', 'Air spaces', 'Guard cells'],
    selectedIndex: 0,
  },
  {
    scaleLabel: 'THE CELL',
    title: 'Inside a single plant cell',
    body: 'A stiff wall holds the cell’s shape while everything important floats inside. Dozens of green ovals drift through it — the cell’s own power plants.',
    subtopics: ['The cell wall', 'The chloroplasts', 'The nucleus', 'The water sac'],
    selectedIndex: 1,
  },
  {
    scaleLabel: 'THE CHLOROPLAST',
    title: 'The green engine',
    body: 'This oval is where sunlight actually becomes food. Inside it, membranes fold into neat stacks of discs, packed with the pigment that makes the whole thing green.',
    subtopics: ['Stacks of discs', 'The fluid around them', 'The outer membranes'],
    selectedIndex: 0,
  },
  {
    scaleLabel: 'THE MEMBRANE',
    title: 'Stacked discs that trap the sun',
    body: 'Each disc is a sheet studded with light-catching machines, stacked like coins to pack in as many as possible. Light hits here and the energy starts to move.',
    subtopics: ['The light-catchers', 'The chlorophyll', 'The electron relay'],
    selectedIndex: 1,
  },
  {
    scaleLabel: 'THE MOLECULE',
    title: 'A single chlorophyll molecule',
    body: 'Here is the green itself: a flat ring of carbon cradling one magnesium atom at its centre. That ring is shaped to grab a particle of light and hold its energy.',
    subtopics: ['The magnesium core', 'The carbon ring', 'The long tail'],
    selectedIndex: 0,
  },
  {
    scaleLabel: 'THE PHOTON',
    title: 'Where light becomes life',
    body: 'A single packet of sunlight strikes the ring and is gone — swapped for a jolt of energy in one of the molecule’s electrons. That one kick begins everything that feeds the plant, and eventually, us.',
    subtopics: ['The strike', 'The excited electron', 'The handoff'],
    selectedIndex: 1,
  },
];

const levels: ZoomLevel[] = RAW.map((l, i) => ({
  ...l,
  scale: i,
  multiplier: MULT[i] ?? `×${10 ** i}`,
}));

const nodes: ZoomNode[] = levels.map((level, i) => ({
  id: i,
  parentId: i === 0 ? null : i - 1,
  viaSubtopic: i === 0 ? null : (levels[i - 1].subtopics[levels[i - 1].selectedIndex] ?? null),
  level,
  depth: i,
}));

export const DEEPZOOM_DEMO_TREE: ZoomTree = {
  query: 'How does a leaf make food?',
  rangeStart: 'All of life',
  nodes,
  trunkIds: nodes.map((n) => n.id),
};
