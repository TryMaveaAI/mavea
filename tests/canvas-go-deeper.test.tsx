import { render, fireEvent, screen } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// Regression coverage for the concept-section "Go deeper" drawer and its bulk
// "Expand/Collapse sections" toggle: neither had a click-behavior test before, only the
// pure depthLens partitioning (tests/live-depth-lens.test.ts). These lock the actual DOM
// contract a user hits — clicking must flip aria-hidden and reveal the deeper block.
function spec(blocks: Block[]): ConversationSpec {
  return {
    id: 't',
    workspace: 'T',
    title: 'T',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

const headline: Block = {
  type: 'insight',
  id: 'headline',
  col: 6,
  num: '1',
  section: 'Overview',
  order: 1,
  depth: 1,
  props: { title: 'Headline', summary: 'The gist.' },
} as Block;
const deeper: Block = {
  type: 'insight',
  id: 'extra',
  col: 6,
  num: '2',
  section: 'Overview',
  order: 1,
  depth: 2,
  props: { title: 'Worked example', summary: 'More detail.' },
} as Block;

describe('TopicCanvas — Go deeper drawer', () => {
  it('starts collapsed, opens on click, and closes on a second click', () => {
    render(
      <TopicCanvas data={spec([headline, deeper])} spot={null} built={{}} onProve={() => {}} />,
    );
    const drawer = document.querySelector('.depth-drawer') as HTMLElement;
    expect(drawer).toBeTruthy();
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.className).not.toMatch(/is-open/);

    const goDeeper = screen.getByRole('button', { name: /go deeper/i });
    fireEvent.click(goDeeper);
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(drawer.className).toMatch(/is-open/);
    expect(goDeeper.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(goDeeper);
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(goDeeper.getAttribute('aria-expanded')).toBe('false');
  });

  it('the bulk "Expand sections" toggle opens every drawer and relabels to "Collapse sections"', () => {
    render(
      <TopicCanvas data={spec([headline, deeper])} spot={null} built={{}} onProve={() => {}} />,
    );
    const drawer = document.querySelector('.depth-drawer') as HTMLElement;
    const expandAll = screen.getByRole('button', { name: /expand sections/i });

    fireEvent.click(expandAll);
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByRole('button', { name: /collapse sections/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /collapse sections/i }));
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders neither toggle when no block has depth>=2 content (a plain section, no drawer to hide)', () => {
    const plain: Block = { ...headline, depth: undefined } as Block;
    render(<TopicCanvas data={spec([plain])} spot={null} built={{}} onProve={() => {}} />);
    expect(screen.queryByRole('button', { name: /go deeper/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /expand sections/i })).toBeNull();
  });
});
