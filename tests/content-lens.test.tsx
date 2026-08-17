// content-lens.test.tsx — the join between meaning and the 608.
//
// A lens reads a ContentGraph subgraph, asks the CATALOG which components accept that shape and speak
// a prop contract it can fill, and compiles props for the winner. The two things that make it a
// choice rather than a lottery are pinned here: the catalog's own domain metadata (a parse tree over
// a revenue breakdown is structurally valid and semantically nonsense), and the registry (a part with
// no resolvable figure cannot be sized, so it is dropped rather than drawn at zero).
//
// The last test is the one that keeps this honest. `requires` names a component's prop KEYS, not
// their inner types — so "speaks the contract" is a claim about the catalog that only actually
// rendering can settle. Every candidate the lens would ever choose is mounted with lens-compiled
// props; a component whose `root` means something else fails here rather than in front of a reader.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { worldToContent } from '../src/live/content/fromWorld';
import {
  componentsFor,
  hierarchyLens,
  ROOT_CONTRACT,
  ROOT_MEANS_SOMETHING_ELSE,
} from '../src/live/content/lens';
import type { ContentGraph } from '../src/live/content/types';
import { buildRegistry } from '../src/live/trust';
import type { WorldValue } from '../src/live/trust';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { allWorldScenario } from '../src/live/world/scenarios/index';

afterEach(cleanup);

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the app).
// Priming makes every lookup synchronous, exactly as the gallery does it.
primeExtendedRegistry(EXTENDED_REGISTRY);

/** One block in the minimal spec TopicCanvas expects. */
const specFor = (block: Block): ConversationSpec => ({
  id: 'money',
  workspace: 'Test',
  title: 'Title',
  sub: 'Sub',
  opener: '',
  context: [{ name: 'Source', color: 'var(--presence)' }],
  blocks: [block],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [],
  keywords: [],
});

/** The components the lens is allowed to choose. Mirrors SPEAKS_ROOT; the first test below fails if
 *  the catalog grows a candidate that is in neither list. */
const VERIFIED = ['sunburst', 'treemap', 'citationchain'];

/** A grounded figure, the only kind a lens is allowed to size anything by. */
const figure = (id: string, label: string, value: number): WorldValue => ({
  id,
  label,
  kind: 'grounded',
  resolution: {
    ok: true,
    tier: 'T2',
    value,
    raw: String(value),
    receipt: { quote: `${label} measured ${value}.`, host: 'example.test' },
    surface: 'web',
  },
});

/** A subject with three parts, two of which carry a figure. */
function graph(domain?: string): ContentGraph {
  return {
    title: 'Where the money went',
    entities: [
      { id: 'spend', label: 'Total spend', role: 'measure', ...(domain ? { domain } : {}) },
      { id: 'spend.rent', label: 'Rent', parentId: 'spend' },
      { id: 'spend.wages', label: 'Wages', parentId: 'spend' },
      { id: 'spend.other', label: 'Everything else', parentId: 'spend' },
    ],
    relations: [],
    facts: [
      { valueId: 'v:rent', entityId: 'spend.rent' },
      { valueId: 'v:wages', entityId: 'spend.wages' },
    ],
    trust: buildRegistry(
      new Map([
        ['v:rent', figure('v:rent', 'Rent', 40)],
        ['v:wages', figure('v:wages', 'Wages', 60)],
      ]),
      [],
    ),
  };
}

describe('componentsFor', () => {
  it('asks the catalog rather than naming a favourite', () => {
    const types = componentsFor('hierarchy', ['root', 'title']).map((f) => f.type);
    expect(types.length).toBeGreaterThan(1);
    expect(types).toContain('sunburst');
    expect(types).toContain('treemap');
  });

  it("respects the catalog's DOMAIN metadata in both directions", () => {
    // A component that declares domains is not a candidate outside them — a phylogenetic tree is
    // structurally valid over a revenue split and semantically nonsense …
    expect(componentsFor('hierarchy', ROOT_CONTRACT).map((f) => f.type)).not.toContain('phylotree');
    // … and inside its own domain it outranks the general ones, because there it IS the better
    // drawing. (Whether the lens can fill it is the separate question below.)
    expect(componentsFor('hierarchy', ROOT_CONTRACT, 'science')[0].type).toBe('phylotree');
    expect(componentsFor('hierarchy', ROOT_CONTRACT, 'code')[0].type).toBe('recursiontree');
  });

  it('offers nothing for a contract no component speaks', () => {
    expect(componentsFor('hierarchy', ['not-a-prop'])).toEqual([]);
  });
});

describe('hierarchyLens', () => {
  it('places only the parts the registry can size, and never one at zero', () => {
    const plan = hierarchyLens.compile(graph(), 'spend')!;
    const root = (plan.block.props as { root: { value: number; children: { label: string }[] } })
      .root;
    // "Everything else" has no figure. Drawn at zero it would read as a measured nothing.
    expect(root.children.map((c) => c.label)).toEqual(['Rent', 'Wages']);
    // The container takes the sum of its parts — its own field is empty, and sizing a hierarchy node
    // off that instead of a children-rollup is the bug the canvas rubric names.
    expect(root.value).toBe(100);
  });

  it('refuses a subject with fewer than two sizeable parts', () => {
    const thin = graph();
    const one = {
      ...thin,
      trust: buildRegistry(new Map([['v:rent', figure('v:rent', 'Rent', 40)]]), []),
    };
    expect(hierarchyLens.fitness(one, 'spend')).toBeNull();
    expect(hierarchyLens.compile(one, 'spend')).toBeNull();
  });

  it('refuses an entity with no parts at all', () => {
    expect(hierarchyLens.fitness(graph(), 'spend.rent')).toBeNull();
  });

  it('terminates on a cycle in parentId rather than compiling forever', () => {
    const looped = graph();
    const cyclic: ContentGraph = {
      ...looped,
      entities: looped.entities.map((e) =>
        e.id === 'spend' ? { ...e, parentId: 'spend.rent' } : e,
      ),
    };
    expect(() => hierarchyLens.compile(cyclic, 'spend')).not.toThrow();
  });

  it('names the question it answers, which is one no causal view does', () => {
    expect(hierarchyLens.questionAnswered).toBe('What is this made of?');
    expect(hierarchyLens.compile(graph(), 'spend')!.answers).toBe(hierarchyLens.questionAnswered);
  });
});

describe('a real world, through the lens', () => {
  it('offers the break-apart on the corpus world that has a breakdown', () => {
    // The seed carries one node with parts, which is what "break apart" is for. Its figures are
    // illustrative, and illustrative figures still resolve — the caveat is the banner's job.
    const spec = allWorldScenario('seed-2008')!.spec;
    const content = worldToContent(spec, worldToMorph(spec));
    const withParts = spec.nodes.find((n) => (n.children?.length ?? 0) >= 2)!;
    const plan = hierarchyLens.compile(content, withParts.id);
    expect(plan, `${withParts.id} has parts but compiled nothing`).not.toBeNull();
    expect(plan!.type).toBe('sunburst');
  });
});

describe('the verified contract, enforced in both directions', () => {
  // `requires` names prop KEYS, so "speaks the contract" is a claim only rendering can settle. Every
  // catalog component requiring root+title must be either verified (it renders the compiled node) or
  // deliberately excluded with a reason — a new hierarchy component is then a test failure naming
  // exactly what to decide, never a card that mounts and draws nothing.
  const catalogCandidates = [
    ...componentsFor('hierarchy', ROOT_CONTRACT),
    ...componentsFor('hierarchy', ROOT_CONTRACT, 'science'),
    ...componentsFor('hierarchy', ROOT_CONTRACT, 'code'),
    ...componentsFor('hierarchy', ROOT_CONTRACT, 'education'),
  ];
  const types = [...new Set(catalogCandidates.map((f) => f.type))];

  it('accounts for every catalog component that requires root + title', () => {
    const unaccounted = types.filter(
      (t) => !VERIFIED.includes(t) && ROOT_MEANS_SOMETHING_ELSE[t] === undefined,
    );
    expect(
      unaccounted,
      `new hierarchy component(s): verify they read {label, value, children} and add to SPEAKS_ROOT, ` +
        `or say what their root means in ROOT_MEANS_SOMETHING_ELSE`,
    ).toEqual([]);
  });

  it('excludes only components whose root genuinely means something else', () => {
    for (const [type, why] of Object.entries(ROOT_MEANS_SOMETHING_ELSE)) {
      expect(types, `${type} is excluded but no longer in the catalog`).toContain(type);
      expect(why.length, `${type} needs a reason, not a placeholder`).toBeGreaterThan(20);
    }
  });

  it.each(VERIFIED)('%s renders the node the lens compiled', (type) => {
    const plan = hierarchyLens.compile(graph(), 'spend')!;
    const block = { ...plan.block, type } as typeof plan.block;
    const { container, unmount } = render(
      <TopicCanvas data={specFor(block)} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.textContent ?? '').not.toMatch(/NaN|undefined/);
    // A component that mounts and prints none of the compiled labels has not drawn this data — the
    // exact failure that took phylotree and recursiontree out of the candidate set.
    expect(container.textContent, `${type} printed no compiled label`).toContain('Wages');
    unmount();
  });

  it('only ever chooses a verified component', () => {
    for (const domain of [undefined, 'science', 'code', 'education']) {
      const subject = graph(domain);
      const plan = hierarchyLens.compile(subject, 'spend');
      expect(plan, `no plan for domain ${String(domain)}`).not.toBeNull();
      expect(VERIFIED, `${String(domain)} chose an unverified component`).toContain(plan!.type);
    }
  });
});
