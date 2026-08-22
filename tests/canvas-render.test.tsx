import { render, fireEvent, within } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { TOPIC_LIST } from '../src/data/topics';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import { APPLIED_EXAMPLES } from '../src/live/select/examples.applied';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// Exercises the WHOLE visual library with the real, authored demo props that ship in the
// topic specs. Every block the app can render is mounted in isolation through the same
// TopicCanvas path the app uses, so a crashing component, a mis-wired registry key, or a
// prop-shape drift surfaces here rather than in the browser. The heavily-interactive blocks
// (overlay/tabs/table/accordion) get behavior assertions on top of the smoke pass.

/** Wrap one block in the smallest valid spec so TopicCanvas renders exactly it. */
function specForBlock(block: Block): ConversationSpec {
  return {
    id: 'money', // any valid TopicId; canvas never reads it
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
  };
}

function renderBlock(block: Block) {
  return render(
    <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
  );
}

/** Every block authored across the topic corpus and the applied-brief example family. */
const TOPIC_BLOCKS: { topic: string; index: number; block: Block }[] = TOPIC_LIST.flatMap((t) =>
  t.blocks.map((block, index) => ({ topic: t.id, index, block })),
);
const APPLIED_BLOCKS: { topic: string; index: number; block: Block }[] = Object.entries(
  APPLIED_EXAMPLES,
).map(([type, props], index) => ({
  topic: 'applied',
  index,
  // These fixtures are validated against the generated live schema in live-examples.test.ts;
  // this companion path proves the resulting production renderer also mounts cleanly.
  block: { type, props, col: 12, delay: 0 } as Block,
}));
const ALL_BLOCKS = [...TOPIC_BLOCKS, ...APPLIED_BLOCKS];

/** The first authored block of a given type, or fail loudly so the test is never silently empty. */
function firstBlockOfType(type: string): Block {
  const hit = ALL_BLOCKS.find((b) => b.block.type === type);
  if (!hit) throw new Error(`no authored "${type}" block found in any topic spec`);
  return hit.block;
}

describe('TopicCanvas — every authored block renders without crashing', () => {
  it('has a non-trivial corpus to exercise (sanity on the iteration source)', () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(200);
  });

  // One smoke case per (topic, block) so a failure names the exact culprit.
  it.each(ALL_BLOCKS.map((b) => [`${b.topic}#${b.index} (${b.block.type})`, b] as const))(
    'mounts and produces a .card, then unmounts cleanly: %s',
    (_label, { block }) => {
      const { container, unmount } = renderBlock(block);
      // Every block in the library renders a `.card` shell (locked by the family components).
      // The `preview` block is the one intentional exception — it renders a full app frame.
      const card = container.querySelector('.card');
      if (block.type !== 'preview') {
        expect(card).toBeTruthy();
      } else {
        expect(container.querySelector('.card-grid')).toBeTruthy();
      }
      // Unmount must not throw (catches effect-cleanup leaks: listeners, timers, portals).
      expect(() => unmount()).not.toThrow();
      // Portaled overlays (modal/drawer/sheet/commandk) live on <body>; nothing should leak
      // an open overlay after unmount.
      expect(document.body.querySelector('.ov-root')).toBeNull();
    },
  );
});

describe('Extended registry — coverage guarantee', () => {
  it('exercises every one of the registered block types with real props', () => {
    const exercised = new Set<string>(ALL_BLOCKS.map((b) => b.block.type));
    const missing = Object.keys(EXTENDED_REGISTRY).filter((key) => !exercised.has(key));
    expect(missing).toEqual([]);
    // Guards against the registry silently shrinking.
    expect(Object.keys(EXTENDED_REGISTRY).length).toBeGreaterThanOrEqual(150);
  });
});

describe('Interactive blocks — behavior, not just mounting', () => {
  it('modal: opens the dialog on its trigger, closes on Escape and on backdrop', () => {
    const { container } = renderBlock(firstBlockOfType('modal'));

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    const trigger = container.querySelector<HTMLButtonElement>('.ov-trigger')!;
    expect(trigger).toBeTruthy();

    // Open
    fireEvent.click(trigger);
    expect(document.body.querySelector('[role="dialog"]')).toBeInTheDocument();

    // Escape closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // Re-open, then click the backdrop to close
    fireEvent.click(trigger);
    const backdrop = document.body.querySelector<HTMLDivElement>('.ov-backdrop')!;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('tabs: switching tabs swaps the selected tab and the panel body', () => {
    const { container } = renderBlock(firstBlockOfType('tabs'));

    const tabButtons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabButtons.length).toBeGreaterThan(1);

    const panel = container.querySelector('[role="tabpanel"]')!;
    const firstSelected = container.querySelector('[role="tab"][aria-selected="true"]')!;
    expect(firstSelected).toBe(tabButtons[0]); // defaultTab: 0
    const firstBody = panel.textContent;

    // Click the last tab — it must become selected and the others must not be.
    const last = tabButtons[tabButtons.length - 1];
    fireEvent.click(last);
    expect(last).toHaveAttribute('aria-selected', 'true');
    expect(tabButtons[0]).toHaveAttribute('aria-selected', 'false');

    // Panel content changes to the newly active tab's body.
    const switchedBody = container.querySelector('[role="tabpanel"]')!.textContent;
    expect(switchedBody).not.toBe(firstBody);
  });

  it('datatable: clicking a header re-sorts; toggling the active header flips direction', () => {
    const { container } = renderBlock(firstBlockOfType('datatable'));

    const headers = container.querySelectorAll<HTMLTableCellElement>('.dt-th');
    expect(headers.length).toBeGreaterThan(1);

    const cellsInFirstColumn = () =>
      Array.from(container.querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('td')!.textContent,
      );

    const firstHeader = headers[0];
    // Sort by the first column ascending (it's not the default sort key).
    fireEvent.click(firstHeader);
    const ascOrder = cellsInFirstColumn();
    const meta = container.querySelector('.tbl-foot-meta')!;
    expect(meta.textContent).toContain('sorted by');

    // Clicking the same header again flips direction → the rows reverse.
    fireEvent.click(firstHeader);
    const descOrder = cellsInFirstColumn();
    expect(descOrder).toEqual([...ascOrder].reverse());
    expect(descOrder).not.toEqual(ascOrder); // real reordering happened
  });

  it('datatable: the search box filters rows and shows an empty state for no matches', () => {
    const { container } = renderBlock(firstBlockOfType('datatable'));

    const rowCount = () => container.querySelectorAll('tbody tr.dt-row').length;
    const total = rowCount();
    expect(total).toBeGreaterThan(0);

    const search = container.querySelector<HTMLInputElement>('.tbl-search input')!;
    fireEvent.change(search, { target: { value: 'zzz-no-such-row-zzz' } });

    expect(rowCount()).toBe(0);
    expect(container.querySelector('.dt-empty')).toBeInTheDocument();
  });

  it('faq/accordion: a closed item expands on click and toggles back closed', () => {
    const { container } = renderBlock(firstBlockOfType('faq'));

    const questions = container.querySelectorAll<HTMLButtonElement>('.lay-faq-q');
    expect(questions.length).toBeGreaterThan(1);

    // defaultOpen: 0 → item 0 is open, item 1 is closed. Use the closed one.
    const closed = questions[1];
    expect(closed).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-expanded', 'true');
    // Single-open mode: opening item 1 closes item 0.
    expect(questions[0]).toHaveAttribute('aria-expanded', 'false');

    // Clicking the now-open item collapses it again.
    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TopicCanvas — header, context and grid scaffolding', () => {
  it('renders the title, sub and one context pill per source', () => {
    const spec = specForBlock(firstBlockOfType('faq'));
    const { container } = render(
      <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} />,
    );
    const header = within(container.querySelector('.canvas-header')!);
    expect(header.getByText('Title')).toBeInTheDocument();
    expect(header.getByText('Sub')).toBeInTheDocument();
    expect(container.querySelectorAll('.context-row .context-pill').length).toBe(
      spec.context.length,
    );
  });

  it('applies the spotlight/dim wrapper classes by block id', () => {
    // An insight block always carries an id, so it can be spotlit/dimmed.
    const insight = firstBlockOfType('insight');
    const id = (insight as Extract<Block, { type: 'insight' }>).id;

    const spotlit = render(
      <TopicCanvas data={specForBlock(insight)} spot={id} built={{}} onProve={() => {}} />,
    );
    expect(spotlit.container.querySelector(`[data-spot-id="${id}"]`)!.className).toContain(
      'spotlit',
    );
    spotlit.unmount();

    // A different spot id dims this block instead.
    const dimmed = render(
      <TopicCanvas
        data={specForBlock(insight)}
        spot="some-other-id"
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(dimmed.container.querySelector(`[data-spot-id="${id}"]`)!.className).toContain('dimmed');
  });
});
