import { render, cleanup } from '@testing-library/react';
import { Longread } from '../src/canvas/blocks/compose/Longread';
import { IdeaBoard } from '../src/canvas/blocks/compose/IdeaBoard';
import {
  contentBudgetPromptClause,
  DEFAULT_ITEM_LIMIT,
  DEFAULT_TEXT_GRAPHEMES,
  enforceComponentContentBudget,
} from '../src/canvas/blocks/catalog/contentBudget';
import { CATALOG_COMPOSE } from '../src/canvas/blocks/catalog/families/compose';

// The two compose blocks whose whole point is a FRAMING decision, which a snapshot of the
// registry can't protect: longread must never grow document chrome (that's docview's job and
// the reason longread exists), and ideaboard must stay unranked and hold its grouping on
// whatever an answer hands it — three ideas, a full spread, or none with an angle at all.
//
// Both also depend on a promise the catalog has to keep: every Live turn pushes a block's props
// through the shared content budget (engine/liveSchema) before a renderer sees them, and the
// central fallbacks are sized for cards, not for prose. So the size-shaped tests here assert the
// POST-budget shape — what the pipeline can actually deliver — rather than a raw fixture.

afterEach(cleanup);

function metaOf(type: string) {
  const meta = CATALOG_COMPOSE.find((m) => m.type === type);
  if (!meta) throw new Error(`the compose catalog has no entry for "${type}"`);
  return meta;
}

/** Props as a renderer really receives them on a live turn. The cast mirrors that seam: the
 *  budget walks untyped JSON and only ever shortens strings and arrays, never reshapes them. */
function throughBudget<P extends Record<string, unknown>>(type: string, props: P): P {
  return enforceComponentContentBudget(type, props, metaOf(type)) as P;
}

describe('longread', () => {
  it('typesets a headed piece with its spine, reading time, and copy affordances', () => {
    const { container, getByText } = render(
      <Longread
        title="Why the tide turns"
        standfirst="A short standfirst that sets the piece up."
        copySections
        sections={[
          { heading: 'The pull', paragraphs: ['One two three four five.', 'Second paragraph.'] },
          { paragraphs: ['A continuation with no heading of its own.'] },
        ]}
        footer="Note the footer."
      />,
    );
    expect(container.querySelector('.lgr-piece--spine')).toBeTruthy();
    expect(container.querySelectorAll('.lgr-section')).toHaveLength(2);
    expect(container.querySelectorAll('.lgr-para')).toHaveLength(3);
    expect(getByText(/min read/)).toBeTruthy();
    // one for the whole piece, one for the single headed section
    expect(container.querySelectorAll('.copy-btn')).toHaveLength(2);
  });

  it('drops the spine when nothing is headed, and skips blank or empty sections', () => {
    const { container } = render(
      <Longread
        title="Flat"
        sections={[
          { paragraphs: ['Only prose.'] },
          { paragraphs: ['', '   '] },
          { paragraphs: [] },
        ]}
      />,
    );
    expect(container.querySelector('.lgr-piece--spine')).toBeNull();
    expect(container.querySelectorAll('.lgr-section')).toHaveLength(1);
  });

  it('shows the empty state rather than a bare reading column', () => {
    const { container } = render(<Longread title="Empty" sections={[]} />);
    expect(container.querySelector('.cx-empty')).toBeTruthy();
  });

  it('renders body text as escaped React text nodes, never as markup', () => {
    const { container } = render(
      <Longread title="X" sections={[{ paragraphs: ['<img src=x onerror=alert(1)>'] }]} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  // The one job the block exists for. `paragraphs` matches none of the key regexes in
  // contentBudget.ts, so without the catalog's own limits every paragraph of a piece that
  // advertises 400–1500 words is cut at the 240-grapheme default — mid-sentence, and silently.
  it('carries a real long-form piece through the turn budget uncut', () => {
    const standfirst =
      'A standfirst that keeps going past the default before its second sentence lands. '.repeat(3);
    const paragraph =
      'The tide is a slow argument between the moon and the coast, and it always finishes. '.repeat(
        8,
      );
    expect(Array.from(standfirst).length).toBeGreaterThan(DEFAULT_TEXT_GRAPHEMES);
    expect(Array.from(paragraph).length).toBeGreaterThan(DEFAULT_TEXT_GRAPHEMES);

    const props = throughBudget('longread', {
      title: 'Why the tide turns',
      standfirst,
      sections: Array.from({ length: 6 }, (_, i) => ({
        heading: `Part ${i + 1}`,
        paragraphs: [paragraph, paragraph],
      })),
    });

    expect(props.standfirst).toBe(standfirst);
    expect(props.sections).toHaveLength(6);
    expect(props.sections.at(-1)?.paragraphs[1]).toBe(paragraph);

    const { container } = render(<Longread {...props} />);
    const paras = [...container.querySelectorAll('.lgr-para')];
    expect(paras).toHaveLength(12);
    expect(paras[0].textContent).toBe(paragraph);
    expect(container.querySelector('.lgr-standfirst')?.textContent).toBe(standfirst.trim());
  });

  it('still bounds a runaway piece at the calibrated ceiling', () => {
    const props = throughBudget('longread', {
      title: 'Runaway',
      sections: Array.from({ length: 40 }, (_, i) => ({
        heading: `Part ${i + 1}`,
        paragraphs: ['x'.repeat(5_000)],
      })),
    });

    expect(props.sections).toHaveLength(20);
    expect(Array.from(props.sections[0].paragraphs[0])).toHaveLength(1_600);
    const { container } = render(<Longread {...props} />);
    expect(container.querySelectorAll('.lgr-section')).toHaveLength(20);
  });
});

describe('ideaboard', () => {
  it('groups ideas by angle in first-appearance order, with no rank marks', () => {
    const { container } = render(
      <IdeaBoard
        title="Names"
        ask="What should we call the launch?"
        ideas={[
          { label: 'Northlight', angle: 'Safe', note: 'Plain, easy to say.' },
          { label: 'Cinder', angle: 'Bold' },
          { label: 'Harbour', angle: 'Safe' },
          { label: 'Nine of Cups', angle: 'Left-field' },
        ]}
      />,
    );
    const angles = [...container.querySelectorAll('.ibd-angle-label')].map((n) => n.textContent);
    expect(angles).toEqual(['Safe', 'Bold', 'Left-field']);
    const counts = [...container.querySelectorAll('.ibd-angle-count')].map((n) => n.textContent);
    expect(counts).toEqual(['2', '1', '1']);
    expect(container.querySelectorAll('.ibd-idea')).toHaveLength(4);
  });

  it('falls back to one flat spread when no idea carries an angle', () => {
    const { container } = render(
      <IdeaBoard title="Ideas" ideas={[{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]} />,
    );
    expect(container.querySelectorAll('.ibd-angle')).toHaveLength(1);
    expect(container.querySelector('.ibd-angle-head')).toBeNull();
    expect(container.querySelectorAll('.ibd-idea')).toHaveLength(3);
  });

  it('drops label-less ideas and shows the empty state when none survive', () => {
    const { container } = render(
      <IdeaBoard title="Ideas" ideas={[{ label: '   ' }, { label: '' }]} />,
    );
    expect(container.querySelector('.cx-empty')).toBeTruthy();
  });

  // The block advertises breadth, so the breadth has to survive the turn: the catalog lifts the
  // 16-item default to the 24 the menu clause teaches, and the grouping holds at that full size.
  it('holds its grouping across the full spread a turn can deliver', () => {
    const props = throughBudget('ideaboard', {
      title: 'Many',
      ideas: Array.from({ length: 40 }, (_, i) => ({
        label: `Idea ${i}`,
        angle: `Angle ${i % 7}`,
      })),
    });

    expect(props.ideas.length).toBeGreaterThan(DEFAULT_ITEM_LIMIT);
    expect(props.ideas).toHaveLength(24);

    const { container } = render(<IdeaBoard {...props} />);
    expect(container.querySelectorAll('.ibd-angle')).toHaveLength(7);
    expect(container.querySelectorAll('.ibd-idea')).toHaveLength(24);
    const counts = [...container.querySelectorAll('.ibd-angle-count')].map((n) =>
      Number(n.textContent),
    );
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(24);
  });

  // Both halves of one contract: a menu that promised more breadth than the validator kept would
  // just teach the model to write ideas that get thrown away.
  it('teaches the model the same spread size the runtime keeps', () => {
    expect(contentBudgetPromptClause(metaOf('ideaboard'))).toContain('ideas≤24');
  });

  it('bounds a runaway note so one tile cannot stretch its whole row', () => {
    const props = throughBudget('ideaboard', {
      title: 'Names',
      ideas: [{ label: 'Northlight', note: 'a note that will not stop. '.repeat(40) }],
    });

    const { container } = render(<IdeaBoard {...props} />);
    const note = container.querySelector('.ibd-idea-note')?.textContent ?? '';
    expect(Array.from(note)).toHaveLength(140);
  });
});
