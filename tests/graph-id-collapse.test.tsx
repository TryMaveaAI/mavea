// graph-id-collapse.test.tsx — an id the model never wrote must not cost a figure its layout.
//
// Reported from production: a "Production process" answer came back as a datapipeline whose
// stages carried no `id`. The layout keyed its placement map by that id, so every stage resolved
// to ONE slot — one stage was placed, the rest kept their (0,0) seed, and the reader got a
// cluster of overlapping truncated labels in the SVG's top-left corner, a lone hexagon at the
// bottom, and a card grown one row taller per stage.
//
// Two independent failures behind one screenshot, both closed at a seam rather than in the
// component: the layered engine keys by array INDEX (canvas/blocks/diagrams/layered), and the
// validator settles ids and the references that name them before any renderer sees the block
// (engine/itemIdentity, driven by the catalog's own ItemSpec).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import { endpointIndex } from '../src/canvas/blocks/diagrams/layered';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { identitySpecs } from '../src/engine/itemIdentity';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { STRUCTURAL_REFERENCES } from '../src/canvas/blocks/catalog/structures.generated';
import type { ComponentMeta } from '../src/canvas/blocks/catalog/meta';
import { ALL_FIXTURES } from './lib/stressFixtures';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import type { DataPipelineStage } from '../src/canvas/blocks/diagrams/types';
import type { Block, ConversationSpec } from '../src/data/conversation';

primeExtendedRegistry(EXTENDED_REGISTRY);

/** The screenshot's own pipeline: five stages, not one `id` between them, and edges that name
 *  the labels the model could see. "Petroleum Jelly" is the stage that was left alone at the
 *  bottom of the card while the other four piled up at the origin. */
const PRODUCTION_PROCESS = {
  stages: [
    { label: 'Crude Oil', kind: 'source' as const },
    { label: 'Distillation', kind: 'transform' as const },
    { label: 'Dewaxing', kind: 'transform' as const },
    { label: 'Hydrotreating', kind: 'transform' as const },
    { label: 'Petroleum Jelly', kind: 'sink' as const },
  ],
  edges: [
    { from: 'Crude Oil', to: 'Distillation' },
    { from: 'Distillation', to: 'Dewaxing' },
    { from: 'Dewaxing', to: 'Hydrotreating' },
    { from: 'Hydrotreating', to: 'Petroleum Jelly' },
  ],
};

/** What the model actually sent. `id` is required by the prop type and absent from the answer —
 *  which is the case this whole file is about, so the shape is asserted rather than authored. */
function asStages(stages: Omit<DataPipelineStage, 'id'>[]): DataPipelineStage[] {
  return stages as DataPipelineStage[];
}

interface Spot {
  label: string;
  x: number;
  y: number;
}

/** Where each stage was drawn. The label carries the node's own centre on the x axis and tracks
 *  it on the y, so it reads the placement the layout actually committed to. */
function spots(container: HTMLElement): Spot[] {
  return [...container.querySelectorAll('text.dp-label')].map((t) => ({
    label: t.textContent ?? '',
    x: Number(t.getAttribute('x')),
    y: Number(t.getAttribute('y')),
  }));
}

function viewBox(container: HTMLElement): { w: number; h: number } {
  const raw = container.querySelector('svg.dg-svg')?.getAttribute('viewBox') ?? '';
  const [, , w, h] = raw.split(/\s+/).map(Number);
  return { w, h };
}

/** Every stage placed somewhere real, and somewhere of its own. */
function expectAllPlaced(found: Spot[], count: number): void {
  expect(found).toHaveLength(count);
  for (const spot of found) {
    expect(Number.isFinite(spot.x)).toBe(true);
    expect(Number.isFinite(spot.y)).toBe(true);
    // The origin is the pile: an unplaced node keeps the seed it was created with.
    expect(spot.x).toBeGreaterThan(0);
    expect(spot.y).toBeGreaterThan(0);
  }
  expect(new Set(found.map((s) => `${s.x}:${s.y}`)).size).toBe(count);
}

describe('a pipeline whose stages carry no ids', () => {
  it('places every stage, each at its own point, none at the origin', () => {
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={asStages(PRODUCTION_PROCESS.stages)}
        edges={PRODUCTION_PROCESS.edges}
      />,
    );
    expectAllPlaced(spots(container), 5);
  });

  it('keeps the card as tall as the rows it actually draws', () => {
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={asStages(PRODUCTION_PROCESS.stages)}
        edges={PRODUCTION_PROCESS.edges}
      />,
    );
    // One row of five: 130 of node + 113 of padding either side. The bug stacked all five into
    // one column, which is 1172 units of card for one hexagon's worth of content.
    expect(viewBox(container).h).toBe(356);
    expect(viewBox(container).w).toBe(1130);
  });

  it('reads left to right, ending on the stage the pipeline produces', () => {
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={asStages(PRODUCTION_PROCESS.stages)}
        edges={PRODUCTION_PROCESS.edges}
      />,
    );
    const found = spots(container);
    expect(found.map((s) => s.label)).toEqual([
      'Crude Oil',
      'Distillation',
      'Dewaxing',
      'Hydrotreating',
      'Petroleum Jelly',
    ]);
    const xs = found.map((s) => s.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // One row, so every stage shares a baseline — nothing is stranded below the others.
    expect(new Set(found.map((s) => s.y)).size).toBe(1);
  });

  it('still lays the stages out when not one edge resolves', () => {
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={asStages(PRODUCTION_PROCESS.stages)}
        // Endpoints naming nothing at all: the authored order is the only reading left.
        edges={[
          { from: 's1', to: 's2' },
          { from: 's2', to: 's3' },
        ]}
      />,
    );
    const found = spots(container);
    expectAllPlaced(found, 5);
    expect(found.map((s) => s.label)[4]).toBe('Petroleum Jelly');
    // With no flow to widen it for, the figure stays inside the frame it declared: four columns
    // fit, so the fifth stage wraps under the first and reads on from the row above — not into
    // the middle of a column of its own, level with nothing.
    expect(viewBox(container)).toEqual({ w: 1000, h: 560 });
    expect(new Set(found.slice(0, 4).map((s) => s.y)).size).toBe(1);
    expect(found[4].x).toBe(found[0].x);
    expect(found[4].y).toBeGreaterThan(found[0].y);
  });

  it('still lays the stages out when every stage repeats one id', () => {
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={PRODUCTION_PROCESS.stages.map((s) => ({ ...s, id: 'stage' }))}
        edges={[{ from: 'stage', to: 'stage' }]}
      />,
    );
    expectAllPlaced(spots(container), 5);
    expect(viewBox(container)).toEqual({ w: 1000, h: 560 });
  });
});

describe('the figure fits whatever number of stages it is given', () => {
  // A column needs a node's width plus a gap, or same-row stages paint over each other's labels.
  const MIN_COL_SPACING = 226;
  it.each([2, 6, 12])('%i stages sit one row deep, none closer than a node width', (count) => {
    const stages = Array.from({ length: count }, (_, i) => ({
      label: `Stage ${i + 1}`,
      kind: 'transform' as const,
    }));
    const { container } = render(
      <DataPipeline
        title="Production process"
        stages={asStages(stages)}
        edges={stages.slice(1).map((s, i) => ({ from: stages[i].label, to: s.label }))}
      />,
    );
    const found = spots(container);
    expectAllPlaced(found, count);
    // One row however long the chain is, so the card never grows a row per stage.
    expect(viewBox(container).h).toBe(356);
    for (let i = 1; i < found.length; i++) {
      expect(found[i].x - found[i - 1].x).toBeGreaterThanOrEqual(MIN_COL_SPACING);
    }
    // And the whole figure stays inside the box it declared.
    const { w } = viewBox(container);
    for (const spot of found) expect(spot.x).toBeLessThanOrEqual(w);
  });

  it.each([
    [2, 1],
    [6, 2],
    [12, 3],
  ])('%i unlinked stages wrap into %i rows without widening the frame', (count, rows) => {
    // Nothing to rank, so the stages read row-major inside the declared frame. Widening it a
    // column per stage instead would paint twelve stages 2712 units across and their labels at
    // about 4px on a card — under the 9px floor — where the one-column stack it replaced was
    // at least legible.
    const stages = Array.from({ length: count }, (_, i) => ({
      label: `Stage ${i + 1}`,
      kind: 'transform' as const,
    }));
    const { container } = render(
      <DataPipeline title="Production process" stages={asStages(stages)} edges={[]} />,
    );
    const found = spots(container);
    expectAllPlaced(found, count);
    expect(viewBox(container).w).toBe(1000);
    expect(new Set(found.map((s) => s.y)).size).toBe(rows);
    // Row-major: the authored order still reads left to right, then down.
    for (let i = 1; i < found.length; i++) {
      const sameRow = found[i].y === found[i - 1].y;
      if (sameRow) expect(found[i].x).toBeGreaterThan(found[i - 1].x);
      else expect(found[i].y).toBeGreaterThan(found[i - 1].y);
    }
  });
});

function specFor(blocks: Block[]): ConversationSpec {
  return {
    id: 'money',
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

function validateOne(type: string, props: Record<string, unknown>): Block | null {
  const r = validateLiveResponse(
    { title: 'T', narration: 'N.', blocks: [{ type, props }] },
    new Set([type]),
    6,
    true, // grounded — the honesty gates are not what this exercises
  );
  return r?.blocks.find((b) => b.type === type) ?? null;
}

describe('the validator settles ids before a renderer ever sees them', () => {
  it('derives a stage id from its label and points the edges at it', () => {
    const block = validateOne('datapipeline', {
      title: 'Production process',
      ...PRODUCTION_PROCESS,
    });
    expect(block).not.toBeNull();
    const props = block!.props as { stages: { id: string }[]; edges: { from: string }[] };
    const ids = props.stages.map((s) => s.id);
    expect(ids).toEqual([
      'crude-oil',
      'distillation',
      'dewaxing',
      'hydrotreating',
      'petroleum-jelly',
    ]);
    // The edges named labels; they leave validation naming stages.
    expect(props.edges.map((e) => e.from)).toEqual([
      'crude-oil',
      'distillation',
      'dewaxing',
      'hydrotreating',
    ]);
  });

  it('leaves an authored id alone and makes only the repeat unique', () => {
    const block = validateOne('datapipeline', {
      title: 'Production process',
      stages: [
        { id: 'raw', label: 'Crude Oil' },
        { id: 'raw', label: 'Distillation' },
      ],
      edges: [{ from: 'raw', to: 'Distillation' }],
    });
    const props = block!.props as { stages: { id: string }[]; edges: { to: string }[] };
    // The first writer keeps the key, so an edge that already names it still means what it meant.
    expect(props.stages.map((s) => s.id)).toEqual(['raw', 'distillation']);
    expect(props.edges[0].to).toBe('distillation');
  });
});

/** Where an item's identity lives, per array — read off the validator's own rule (the entry's
 *  declaration, and `id` for every array its reference fixture keys by one), so an entry that
 *  forgets `idField` still has to survive losing its ids: the default exists because forgetting
 *  was the failure. */
function keyedArrays(meta: ComponentMeta): { prop: string; idField: string }[] {
  const reference = STRUCTURAL_REFERENCES[meta.type];
  if (!reference || typeof reference !== 'object') return [];
  return identitySpecs(meta, reference).flatMap((spec) =>
    spec.idField ? [{ prop: spec.prop, idField: spec.idField }] : [],
  );
}

const ID_KEYED = RAW_CATALOG.flatMap((m) => {
  const arrays = keyedArrays(m);
  return arrays.length ? [{ type: m.type, arrays }] : [];
});
const TYPICAL = new Map(
  ALL_FIXTURES.filter((f) => f.mode === 'typical').map((f) => [f.type, f.block]),
);

describe('every id-keyed component survives losing its ids', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers the whole id-keyed catalog, declared or not', () => {
    const types = ID_KEYED.map((m) => m.type);
    // The ones that had no declaration at all before the reference-derived default — a binary
    // tree, a state machine, a circuit — are exactly the ones this sweep has to reach.
    expect(types).toEqual(
      expect.arrayContaining(['datastructure', 'binarytree', 'statemachine', 'logicgates']),
    );
    expect(ID_KEYED.find((m) => m.type === 'logicgates')?.arrays.map((a) => a.prop)).toEqual([
      'inputs',
      'gates',
    ]);
    expect(types.length).toBeGreaterThanOrEqual(32);
    // An id that is a closed vocabulary — a five-forces slot, a body region — is a name the
    // renderer looks up, not a key the validator can invent, so those arrays are not defaulted.
    expect(types).not.toContain('fiveforces');
    expect(types).not.toContain('bodymap');
    // And an id the reader SEES — a commit hash, painted beside its message — is content: anyone
    // who knows git would read an invented one as wrong, so no id is derived for a git graph.
    expect(types).not.toContain('gitgraph');
    expect(ID_KEYED.filter((m) => !TYPICAL.has(m.type))).toEqual([]);
  });

  it.each(ID_KEYED.map((m) => [m.type, m.arrays] as const))(
    'id-less items still validate and render: %s',
    (type, arrays) => {
      const props = structuredClone(TYPICAL.get(type)!.props) as Record<string, unknown>;
      for (const { prop, idField } of arrays) {
        const items = props[prop];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (item && typeof item === 'object') delete (item as Record<string, unknown>)[idField];
        }
      }
      const block = validateOne(type, props);
      // Losing the ids must not cost the block: the validator invents them.
      expect(block).not.toBeNull();
      for (const { prop, idField } of arrays) {
        const items = (block!.props as Record<string, unknown>)[prop];
        if (!Array.isArray(items)) continue;
        const ids = items.map((i) => (i as Record<string, unknown>)[idField]);
        for (const id of ids) expect(typeof id === 'string' && id.trim()).toBeTruthy();
        expect(new Set(ids).size).toBe(ids.length);
      }
      const { container, unmount } = render(
        <TopicCanvas data={specFor([block!])} spot={null} built={{}} onProve={() => {}} />,
      );
      expect(container.querySelector('.card, .card-grid, .fb-card')).not.toBeNull();
      unmount();
    },
  );
});

describe('a binary tree keeps its shape when the model names children by value', () => {
  it('keys id-less children by their value and lands left/right and highlight on them', () => {
    const block = validateOne('datastructure', {
      title: 'BST',
      kind: 'bst',
      // The root's id is repeated on the second node and absent on the third; the children are
      // named by the values the reader sees, which is what the model tends to write.
      nodes: [{ id: 'n', value: 8, left: '3', right: '10' }, { id: 'n', value: 3 }, { value: 10 }],
      highlight: 10,
    });
    expect(block).not.toBeNull();
    const props = block!.props as {
      nodes: { id: string; left?: string; right?: string }[];
      highlight?: unknown;
    };
    expect(props.nodes.map((n) => n.id)).toEqual(['n', '3', '10']);
    expect(props.nodes[0]).toMatchObject({ left: '3', right: '10' });
    expect(props.highlight).toBe('10');
  });
});

describe('a commit graph keeps the hashes the model wrote', () => {
  it('drops the commit that carries no hash rather than naming it', () => {
    const block = validateOne('gitgraph', {
      title: 'Release history',
      commits: [
        { id: 'e4f5a6b', message: 'Release', branch: 'main', parents: ['b7c8d9e'] },
        // No id. A slug of the message would paint in the hash column as though it were one.
        { message: 'Fix typo', branch: 'main', parents: ['a1b2c3d'] },
        { id: 'a1b2c3d', message: 'Add login', branch: 'main', parents: ['0e1f2a3'] },
      ],
    });
    // One commit short is a shorter history; a fabricated hash is a wrong one.
    expect(block).not.toBeNull();
    const props = block!.props as { commits: { id: string; message: string }[] };
    expect(props.commits.map((c) => c.id)).toEqual(['e4f5a6b', 'a1b2c3d']);
    expect(props.commits.map((c) => c.message)).toEqual(['Release', 'Add login']);
  });
});

describe('a decision tree with two branches the reader reads as the same word', () => {
  /** Both "Yes" leaves are named only by their verdict, which is what a model writes for a leaf —
   *  so the ids they end up with are derived from the same word. */
  const DEPLOY_TREE = {
    title: 'Should I deploy?',
    rootId: 'root',
    nodes: [
      { id: 'root', question: 'Are the tests green?', yes: 'Yes', no: 'No' },
      { outcome: 'Yes' },
      { outcome: 'Yes' },
      { outcome: 'No' },
    ],
  };

  it('gives every leaf a key of its own and leaves the ambiguous branch as authored', () => {
    const block = validateOne('decisiontree', structuredClone(DEPLOY_TREE));
    expect(block).not.toBeNull();
    const props = block!.props as { nodes: { id: string; yes?: string; no?: string }[] };
    expect(props.nodes.map((n) => n.id)).toEqual(['root', 'yes', 'yes-2', 'no']);
    // "Yes" names two leaves, so it names neither: taking the first would send the reader down a
    // branch nobody wrote, and one branch drawn short is cheaper than one drawn wrong. The single
    // "No" leaf is unambiguous, so that arrow still lands.
    expect(props.nodes[0].yes).toBe('Yes');
    expect(props.nodes[0].no).toBe('no');
  });

  it('is read the same way by the layout that draws the arrows', () => {
    // The renderer resolves endpoints itself, against the ids validation just derived, and the
    // two have to agree — an endpoint the validator refused must not come back as node 0 here.
    const at = endpointIndex([
      { id: 'yes', label: 'Yes' },
      { id: 'yes-2', label: 'Yes' },
      { id: 'no', label: 'No' },
    ]);
    expect(at('Yes')).toBeNull();
    expect(at('No')).toBe(2);
    // An exact id is a key, never a label, so it resolves whatever the labels around it repeat.
    expect(at('yes')).toBe(0);
  });
});
