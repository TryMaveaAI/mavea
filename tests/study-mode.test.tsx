import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { StudyStage } from '../src/canvas/study/StudyStage';
import { deriveStudyScene, deskObjects } from '../src/canvas/study/scene';
import { BACK_CAP } from '../src/canvas/study/slots';
import { studyVoices } from '../src/live/content/studyVoices';

function block(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    // The validator stamps a real insight col 4 (COL_BY_TYPE) — and the desk now READS col to
    // judge wideness, so the fixture has to carry a realistic one.
    col: 4,
    num: id,
    props: { title, summary: `${title} summary`, conf: 'inferred' },
  } as Block;
}

function spec(blocks: Block[], id = 'study-turn'): ConversationSpec {
  return {
    id,
    workspace: 'Study test',
    title: 'Pressure test',
    sub: 'One answer, one desk',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

const blocks = [
  block('a', 'Revenue'),
  block('b', 'Retention'),
  block('c', 'Margins'),
  block('d', 'Competition'),
  block('e', 'Execution'),
  block('f', 'Valuation'),
];

describe('deriveStudyScene', () => {
  it('keeps the conversational focus foregrounded and alternates its closest neighbors', () => {
    const scene = deriveStudyScene(blocks, 'c');
    expect(scene.active?.id).toBe('c');
    expect(scene.nearby.map((actor) => actor.id)).toEqual(['d', 'b', 'e', 'a', 'f']);
    expect(scene.horizon).toEqual([]);
    expect(scene.intensity).toBe('immersive');
  });

  it('fills exactly the back arc and overflows the rest to the horizon', () => {
    const many = Array.from({ length: 9 }, (_, index) => block(`m-${index}`, `Object ${index}`));
    const scene = deriveStudyScene(many, 'm-0');
    expect(scene.nearby).toHaveLength(BACK_CAP);
    expect(scene.horizon).toHaveLength(many.length - 1 - BACK_CAP);
  });

  it('keeps every object reachable when an answer is larger than the back arc', () => {
    const many = Array.from({ length: 24 }, (_, index) =>
      block(`block-${index}`, `Object ${index + 1}`),
    );
    const scene = deriveStudyScene(many, 'block-0');
    const reachable = [scene.active, ...scene.nearby, ...scene.horizon]
      .filter((actor) => actor !== null)
      .map((actor) => actor.id);

    expect(reachable).toHaveLength(many.length);
    expect(new Set(reachable)).toEqual(new Set(many.map((item) => item.id)));
  });
});

describe('StudyStage', () => {
  const renderBlock = (item: Block) => (
    <div className="card">
      <span>{item.id}</span>
      <span>{'title' in item.props ? String(item.props.title) : ''}</span>
    </div>
  );

  it('pulls a back-arc object onto the desk without creating a new answer', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        renderBlock={renderBlock}
        onNarrate={onNarrate}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Bring Retention forward' }), {
      key: 'Enter',
    });

    expect(container.querySelector('.study-card.is-front')?.textContent).toContain('Retention');
    expect(onNarrate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('keeps a promoted card the SAME element, so the travel is a slot transition — not a cut', () => {
    const { container } = render(
      <StudyStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    const before = container.querySelector('[data-study-actor="b"]');
    expect(before?.classList.contains('is-back')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Bring Retention forward' }));

    const after = container.querySelector('[data-study-actor="b"]');
    // Same DOM node: React keyed the card by block id, so the promotion changed its slot
    // variables and classes in place and CSS transitions carry it to the front of the desk.
    expect(after).toBe(before);
    expect(after?.classList.contains('is-front')).toBe(true);
  });

  it('uses Shift activation to keep context while leaving the desk in place', () => {
    const onAskBlock = vi.fn();
    const { container } = render(
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        renderBlock={renderBlock}
        onAskBlock={onAskBlock}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Bring Retention forward' }), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(onAskBlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(container.querySelector('.study-card.is-front')?.textContent).toContain('Revenue');
  });

  it('keeps doorways off the desk — a world preview is not an object to examine', () => {
    // The world card's whole content is "there is more elsewhere". On the desk it would take a
    // slot, a beat and four notes to say it; on the grid it is a doorway, which is what it is.
    const world = {
      type: 'world',
      id: 'w',
      col: 12,
      num: 'w',
      props: { title: 'Teach me about regimes' },
    } as unknown as Block;
    const { container } = render(
      <StudyStage
        data={spec([...blocks, world])}
        blocks={[...blocks, world]}
        spot="a"
        renderBlock={renderBlock}
      />,
    );
    expect(container.querySelector('[data-study-actor="w"]')).toBeNull();
    expect(container.querySelectorAll('.study-beat')).toHaveLength(blocks.length);
  });

  it('contains no capture controls or permission-triggering media inputs', () => {
    const { container } = render(
      <StudyStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    expect(
      container.querySelector('video, input[accept*="video"], input[accept*="audio"]'),
    ).toBeNull();
    expect(container.textContent).not.toMatch(/camera|record|listen in background/i);
  });

  it('walks the teaching notes without duplicating the global Presence', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        renderBlock={renderBlock}
        asides={{
          a: [
            { text: 'This rests on the summary beneath it.', kind: 'caution' },
            { text: 'Revenue is the lead signal.', kind: 'insight' },
            { text: 'No sources are attached to this answer.', kind: 'evidence' },
            { text: 'What would have to change for this to stop being true?', kind: 'question' },
          ],
          b: [{ text: 'This figure traces to the source.', kind: 'evidence' }],
        }}
        onNarrate={onNarrate}
      />,
    );

    expect(container.querySelector('.presence')).toBeNull();
    expect(screen.getByText('Assumption')).toBeTruthy();

    // Four voices about ONE object, paged in place — one chip per note, wearing its own kind,
    // so the reader picks what they want to hear rather than paging blindly. The set is FIXED
    // (assumption · pattern · evidence · pressure-test), so the chips are a row you learn.
    expect(container.querySelector('.study-note-footer')?.textContent).toContain('01 / 04');
    expect(container.querySelectorAll('.study-note-nav button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Pressure-test' }));
    expect(screen.getByText('Pressure-test')).toBeTruthy();
    expect(container.querySelector('.study-note-nav .is-now')?.textContent).toBe('?');
    expect(container.querySelector('.study-card.is-front')?.textContent).toContain('Revenue');

    // Moving the desk swaps the whole note set and starts its pages over.
    fireEvent.click(screen.getByRole('button', { name: 'Bring Retention forward' }));
    expect(container.querySelector('.study-card.is-front')?.textContent).toContain('Retention');
    expect(screen.getByText('Evidence check')).toBeTruthy();
    expect(onNarrate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('offers every object as a beat, in answer order, with the active one marked', () => {
    const many = Array.from({ length: 24 }, (_, index) =>
      block(`block-${index}`, `Object ${index + 1}`),
    );
    const { container } = render(
      <StudyStage data={spec(many)} blocks={many} spot="block-0" renderBlock={renderBlock} />,
    );

    // The beat bar is the reachability guarantee: the arc holds BACK_CAP objects, the beat bar
    // holds them ALL — never truncated, provider output is dynamic.
    const chips = container.querySelectorAll('.study-beat');
    expect(chips).toHaveLength(many.length);
    expect(container.querySelector('.study-beat[aria-current="step"]')?.textContent).toContain(
      'Object 1',
    );

    fireEvent.click(screen.getByRole('button', { name: `Beat 24 of 24: Object 24` }));
    expect(container.querySelector('.study-card.is-front')?.textContent).toContain('Object 24');
    expect(container.querySelector('.study-beat[aria-current="step"]')?.textContent).toContain(
      'Object 24',
    );
  });

  it('stamps the pen target on the desk object alone, and re-stamps as the desk re-casts', () => {
    const { container } = render(
      <StudyStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    // AnnotationLayer resolves a mark's host by data-spot-id ALONE, and its rect math assumes an
    // unscaled host. A back card lives behind a rotateY+scale transform where a painted stroke
    // would land doubled — so only the front card is a target, and each object becomes one the
    // moment it arrives on the desk.
    const marked = () =>
      [...container.querySelectorAll('[data-spot-id]')].map((el) =>
        el.getAttribute('data-spot-id'),
      );
    expect(marked()).toEqual(['a']);

    fireEvent.click(screen.getByRole('button', { name: 'Bring Retention forward' }));
    expect(marked()).toEqual(['b']);
  });

  it('hides the blurred scenery from assistive tech and names the object on its button', () => {
    const { container } = render(
      <StudyStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    // A blurred card at 44% scale is scenery, not content: its accessible name lives on the
    // card button, its readable name on the beat chip — never an unreadable miniature offered
    // as if it were legible.
    for (const back of container.querySelectorAll('.study-card.is-back')) {
      expect(back.getAttribute('role')).toBe('button');
      expect(back.getAttribute('aria-label')).toMatch(/^Bring .+ forward$/);
      expect(back.querySelector('.study-card-face')?.getAttribute('aria-hidden')).toBe('true');
    }
    const front = container.querySelector('.study-card.is-front');
    expect(front?.getAttribute('role')).toBeNull();
    expect(front?.querySelector('.study-card-face')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('fills the app viewport reliably and leaves with Escape', () => {
    const { container } = render(
      <StudyStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fill the screen with this study' }));
    expect(container.querySelector('.study-stage.is-fullscreen')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Leave full screen' })).toBeTruthy();

    const underneath = vi.fn();
    window.addEventListener('keydown', underneath);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.study-stage.is-fullscreen')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(underneath).not.toHaveBeenCalled();
    window.removeEventListener('keydown', underneath);
  });
});

describe('TopicCanvas — Live Study path', () => {
  it('renders provider answer objects in the Study and keeps Live callbacks connected', () => {
    const onAskBlock = vi.fn();
    const onViewMode = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec(blocks)}
        spot="a"
        built={{}}
        onProve={() => {}}
        onAskBlock={onAskBlock}
        viewMode="study"
        onViewMode={onViewMode}
      />,
    );

    expect(screen.getByRole('region', { name: 'The Study' })).toBeTruthy();
    expect(container.querySelector('.study-stage')).not.toBeNull();
    expect(container.querySelector('.card-grid')).toBeNull();

    // The desk object carries no button tray. A floating toolbar under it reads as chrome bolted
    // to a scene whose whole point is that there is nothing between the reader and the thing.
    expect(container.querySelector('.study-hero-actions')).toBeNull();
    expect(container.textContent).not.toMatch(/Keep in context|Move aside/);

    // Shift-click is the surviving route to the grounded multi-block follow-up: it holds an
    // object in context WITHOUT stealing the desk, which is what a plain click does.
    const back = container.querySelector('.study-card.is-back');
    expect(back).not.toBeNull();
    fireEvent.click(back as Element, { shiftKey: true });
    expect(onAskBlock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
    expect(onViewMode).toHaveBeenCalledWith('everything');
  });
});

describe('the walk note joins the margin without costing a scrawl', () => {
  // A guided walk writes its own line beside the object on the desk. It takes the left slot,
  // because it is what Mavéa just said about that card — but it used to REPLACE whatever the
  // model had written there, so a slide silently lost one of its own scrawls the moment the
  // walk reached it. And it was condensed with an ellipsis, which renders as handwriting cut
  // off mid-thought ("Your needs are the non-negotiables, like…").
  const scrawled: Block[] = [
    {
      ...block('a', 'Needs'),
      study: {
        scrawls: ['rent is the only fixed one', 'groceries flex first', 'utilities swing'],
      },
    } as Block,
    block('b', 'Wants'),
  ];

  function open(walk: { spot: string; text: string }[]) {
    render(
      <StudyStage
        data={spec(scrawled)}
        blocks={scrawled}
        spot="a"
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        asides={{ a: studyVoices(scrawled[0], 0, null, 'standard') }}
        walkNotes={walk}
      />,
    );
  }

  it('keeps every model scrawl when the walk writes its own line', () => {
    open([{ spot: 'a', text: 'Rent is the one to watch.' }]);
    const texts = [...document.querySelectorAll('.study-mark')].map((n) => n.textContent ?? '');
    expect(texts).toContain('Rent is the one to watch.');
    for (const scrawl of scrawled[0].study!.scrawls!) expect(texts).toContain(scrawl);
  });

  it('never shows a scrawl cut off mid-thought', () => {
    open([
      {
        spot: 'a',
        text: 'Your needs are the non-negotiables, like housing and utilities and transport',
      },
    ]);
    const texts = [...document.querySelectorAll('.study-mark')].map((n) => n.textContent ?? '');
    for (const text of texts) expect(text).not.toContain('…');
    // The line that could not fit is simply left out; the model's own scrawls still stand.
    for (const scrawl of scrawled[0].study!.scrawls!) expect(texts).toContain(scrawl);
  });
});

describe('a follow-up answers IN PLACE, and the desk shows it', () => {
  // Continuity 'augment' keeps the spec id and appends blocks, so none of the per-answer resets
  // fire — measured live, the desk sat on the previous answer's card with its old beat lit while
  // the title bar already named the new question. The desk must bring the first NEW block
  // forward the moment it lands, and hand the wheel back the moment the walk moves on.
  const two = [block('a', 'Old lead'), block('b', 'Old detail')];
  const three = [...two, block('c', 'The follow-up answer')];

  function desk(blocks: Block[], spot: string | null) {
    return (
      <StudyStage
        data={spec(blocks, 'same-turn')}
        blocks={blocks}
        spot={spot}
        answerEpoch={0}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
  }

  const frontTitle = (): string | null =>
    document.querySelector('.study-card.is-front')?.textContent?.replace(/\s+/g, ' ').trim() ??
    null;

  it('brings the first new block to the desk when the follow-up settles', () => {
    const { rerender } = render(desk(two, 'a'));
    expect(frontTitle()).toContain('Old lead');
    rerender(desk(three, 'a'));
    expect(frontTitle()).toContain('The follow-up answer');
  });

  it('yields to the walk the moment the spot next moves', () => {
    const { rerender } = render(desk(two, 'a'));
    rerender(desk(three, 'a'));
    expect(frontTitle()).toContain('The follow-up answer');
    // The walk starts narrating the new content: the desk follows the voice, not the recast.
    rerender(desk(three, 'b'));
    expect(frontTitle()).toContain('Old detail');
  });

  it('recasts ONCE per burst while an answer streams in card by card', () => {
    // A streamed answer appends blocks one partial at a time. Recasting per appended card
    // re-dealt the desk over and over while the answer arrived — the reader watched the cards
    // gather and fan for every block.
    const { rerender } = render(desk(two, 'a'));
    rerender(desk(three, 'a'));
    expect(frontTitle()).toContain('The follow-up answer');
    // More cards stream in behind it: the desk holds the burst's first card.
    const four = [...three, block('d', 'Later detail')];
    const five = [...four, block('e', 'Even later')];
    rerender(desk(four, 'a'));
    expect(frontTitle()).toContain('The follow-up answer');
    rerender(desk(five, 'a'));
    expect(frontTitle()).toContain('The follow-up answer');
    // The walk moving on ends the burst — and a NEXT follow-up recasts afresh.
    rerender(desk(five, 'd'));
    expect(frontTitle()).toContain('Later detail');
    rerender(desk([...five, block('f', 'Second follow-up')], 'd'));
    expect(frontTitle()).toContain('Second follow-up');
  });

  it('does not disturb a desk whose blocks did not change', () => {
    const { rerender } = render(desk(three, 'b'));
    rerender(desk(three, 'b'));
    expect(frontTitle()).toContain('Old detail');
  });

  it('keeps the reader pin, visited notes and open crib through an augment', () => {
    const walkNotes = [
      { spot: 'a', text: 'Lead note.' },
      { spot: 'b', text: 'Detail note.' },
    ];
    const view = (cast: Block[], spot: string, streaming: boolean) => (
      <StudyStage
        data={spec(cast, 'same-turn')}
        blocks={cast}
        spot={spot}
        streaming={streaming}
        answerEpoch={0}
        walkNotes={walkNotes}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
    const { container, rerender } = render(view(two, 'a', false));
    fireEvent.click(screen.getByRole('button', { name: 'Bring Old detail forward' }));
    fireEvent.click(screen.getByRole('button', { name: '✎ Notes (2)' }));
    expect(container.querySelector('.study-crib')).toBeTruthy();

    rerender(view(three, 'a', true));
    expect(frontTitle()).toContain('Old detail');
    expect(container.querySelector('.study-crib')).toBeTruthy();
    rerender(view(three, 'a', false));
    expect(frontTitle()).toContain('The follow-up answer');
    expect(container.querySelectorAll('.study-crib-line')).toHaveLength(2);

    // Once the narrated walk moves, the temporary recast yields to the reader's surviving pin.
    rerender(view(three, 'c', false));
    expect(frontTitle()).toContain('Old detail');
    expect(container.querySelector('.study-crib')).toBeTruthy();
  });
});

describe('a block built for width gets the wide desk', () => {
  // At the standard 560px a twelve-column table truncated every cell ("Retail & E-co…") while
  // dead parchment sat either side — truncation is the one thing the desk must never do to the
  // object it is presenting. The judgment is the block's own catalog span, not a kept list.
  const wideBlock = {
    type: 'datatable',
    id: 'w',
    col: 12,
    props: {
      title: 'Entrants',
      columns: [
        { key: 'sector', label: 'Sector' },
        { key: 'strategy', label: 'Entry strategy' },
      ],
      rows: [{ sector: 'Retail & E-commerce', strategy: 'Virtual try-on experiences' }],
    },
  } as unknown as Block;
  const narrow = block('n', 'One figure');

  function frontWidth(blocks: Block[], spot: string): string {
    render(
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot={spot}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />,
    );
    const front = document.querySelector<HTMLElement>('.study-card.is-front')!;
    return front.style.width;
  }

  it('widens the desk for a wide-span block, and only the front card', () => {
    expect(frontWidth([wideBlock, narrow], 'w')).toBe('700px');
    const back = document.querySelector<HTMLElement>('.study-card.is-back')!;
    expect(back.style.width).toBe('560px');
  });

  it('keeps the standard desk for an ordinary block', () => {
    expect(frontWidth([narrow, wideBlock], 'n')).toBe('560px');
  });
});

describe('a streaming answer deals the desk once, not once per card', () => {
  // Watching the arc reshuffle and the beat bar grow for every arriving card read as the desk
  // re-rendering over and over. While the turn streams, the desk shows the answer's FIRST card
  // and holds still; the full cast deals once, when the stream settles.
  const beats = (): number => document.querySelectorAll('.study-beat').length;

  function desk(blocks: Block[], spot: string | null, streaming: boolean) {
    return (
      <StudyStage
        data={spec(blocks, 'stream-turn')}
        blocks={blocks}
        spot={spot}
        streaming={streaming}
        answerEpoch={1}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
  }

  it('LOADS ALL, THEN SHOWS: a first answer shows one card, the cast deals whole at settle', () => {
    const a = block('a', 'First');
    const stream = [a, block('b', 'Second'), block('c', 'Third'), block('d', 'Fourth')];
    const { rerender } = render(desk([a], 'a', true));
    expect(document.querySelectorAll('.study-card').length).toBe(1);
    // Three more cards arrive while streaming: the desk HOLDS — no per-card churn at all.
    rerender(desk(stream, 'a', true));
    expect(document.querySelectorAll('.study-card').length).toBe(1);
    // Settle: the whole cast deals at once.
    rerender(desk(stream, 'a', false));
    expect(document.querySelectorAll('.study-card').length).toBe(4);
    expect(beats()).toBeGreaterThanOrEqual(4);
  });

  it('a follow-up streams behind the SETTLED desk, untouched until settle', () => {
    const prior = [block('a', 'Settled lead'), block('b', 'Settled detail')];
    const grown = [...prior, block('c', 'New card'), block('d', 'Newer card')];
    const { rerender } = render(desk(prior, 'a', false));
    rerender(desk(grown, 'a', true));
    // The streaming follow-up changes NOTHING on the desk — load all, then show.
    expect(document.querySelectorAll('.study-card').length).toBe(2);
    const texts = document.body.textContent ?? '';
    expect(texts).not.toContain('New card');
    rerender(desk(grown, 'a', false));
    expect(document.querySelectorAll('.study-card').length).toBe(4);
  });
});

describe('a REPLACE answer takes the desk whole — ids collide, types tell the truth', () => {
  // A live spec's id is the constant 'live', and a replace restarts its block ids at live-1.
  // Compared by id alone the new answer's cards collided with the old answer's, so the desk
  // held the PREVIOUS answer through the whole stream and the reader's pin/visited state
  // survived onto cards that no longer existed.
  const oldAnswer = [block('live-1', 'Old lead'), block('live-2', 'Old detail')];
  const newAnswer = [
    {
      type: 'timeline',
      id: 'live-1',
      col: 8,
      props: { events: [{ time: 'Now', title: 'New answer' }] },
    } as unknown as Block,
    block('live-2', 'New detail'),
  ];

  function desk(blocks: Block[], spot: string | null, streaming: boolean, answerEpoch: number) {
    return (
      <StudyStage
        data={spec(blocks, 'live')}
        blocks={blocks}
        spot={spot}
        streaming={streaming}
        answerEpoch={answerEpoch}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title ?? 'timeline-card'}</div>}
      />
    );
  }

  it('shows the new answer during its stream instead of holding the old one', () => {
    const { rerender } = render(desk(oldAnswer, 'live-2', false, 0));
    expect(document.querySelector('.study-card.is-front')?.textContent).toContain('Old detail');
    // The replace streams in: first partial carries ONE new block whose id collides.
    rerender(desk([newAnswer[0]], 'live-2', true, 1));
    const front = document.querySelector('.study-card.is-front')?.textContent ?? '';
    expect(front).toContain('timeline-card');
    expect(front).not.toContain('Old');
    // Settle with the full new cast.
    rerender(desk(newAnswer, 'live-1', false, 1));
    expect(document.querySelectorAll('.study-card').length).toBe(2);
  });

  it('replaces a one-card answer with the same id and type when the reducer epoch moves', () => {
    const prior = [block('live-1', 'Old one-card answer')];
    const next = [block('live-1', 'New one-card answer')];
    const { rerender } = render(desk(prior, 'live-1', false, 4));
    rerender(desk(next, 'live-1', true, 5));
    expect(document.querySelector('.study-card.is-front')?.textContent).toContain(
      'New one-card answer',
    );
  });

  it('aligns a replacement once after settle, never once per partial', async () => {
    const scrollIntoView = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = render(desk(oldAnswer, 'live-1', false, 6));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      scrollIntoView.mockClear();
      rerender(desk([newAnswer[0]], 'live-1', true, 7));
      rerender(desk(newAnswer, 'live-1', true, 7));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(scrollIntoView).not.toHaveBeenCalled();
      rerender(desk(newAnswer, 'live-1', false, 7));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end', behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
  });

  it('aligns a compact replacement to the active card instead of the beat bar', async () => {
    const scrollIntoView = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = render(desk(oldAnswer, 'live-1', false, 8));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      scrollIntoView.mockClear();
      document.querySelector('.study-stage')?.setAttribute('data-compact', '');
      rerender(desk([newAnswer[0]], 'live-1', true, 9));
      rerender(desk(newAnswer, 'live-1', false, 9));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
  });
});

describe('non-desk write-backs do not disturb the Study', () => {
  it('keeps a reader pin when a world is appended to the answer', () => {
    const core = [block('a', 'Lead'), block('b', 'Pinned detail')];
    const world = {
      type: 'world',
      id: 'world-1',
      col: 12,
      props: { title: 'Living world' },
    } as unknown as Block;
    const view = (cast: Block[]) => (
      <StudyStage
        data={spec(cast, 'live')}
        blocks={cast}
        spot="a"
        answerEpoch={3}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
    const { rerender } = render(view(core));
    fireEvent.click(screen.getByRole('button', { name: 'Bring Pinned detail forward' }));
    rerender(view([...core, world]));
    expect(document.querySelector('.study-card.is-front')?.textContent).toContain('Pinned detail');
  });
});

describe('a card taller than its slot says there is more below', () => {
  // The scroll inside the front card is honest (shrinking violates the legibility floor) but it
  // was invisible: the Roman timeline's last event sat half-hidden and the card just seemed to
  // END there. The stage measures the face and flags hidden depth; the flag clears at bottom.
  it('flags hidden depth and clears it when the reader reaches the bottom', async () => {
    const tall = block('t', 'Tall content');
    render(
      <StudyStage
        data={spec([tall])}
        blocks={[tall]}
        spot="t"
        renderBlock={() => <div style={{ height: 2000 }}>long body</div>}
      />,
    );
    const face = document.querySelector<HTMLElement>('.study-card.is-front .study-card-face')!;
    // jsdom reports zero layout, so drive the geometry the measurer reads.
    Object.defineProperty(face, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(face, 'clientHeight', { value: 500, configurable: true });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    face.dispatchEvent(new Event('scroll'));
    expect(face.hasAttribute('data-more-below')).toBe(true);
    // Scrolled to the bottom: nothing hidden, cue gone.
    Object.defineProperty(face, 'scrollTop', { value: 1500, configurable: true });
    face.dispatchEvent(new Event('scroll'));
    expect(face.hasAttribute('data-more-below')).toBe(false);
  });
});

describe('the desk resets per ANSWER, not per spec id', () => {
  // Every per-answer reset in StudyStage used to key on `data.id`. A live spec's id is the
  // constant 'live' for the whole session, so none of them fired between answers: the pin, the
  // open crib, the visited beats and the guided walk all survived onto the next answer's cards.
  // Nothing caught it because every other test in this file builds specs with a unique id.
  function desk(blocks: Block[]) {
    return (
      <StudyStage
        data={spec(blocks, 'live')}
        blocks={blocks}
        spot={blocks[0]?.id ?? null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
  }

  it('drops a guided walk when the next live answer arrives', () => {
    const first = [block('live-1', 'A lead'), block('live-2', 'A detail')];
    const second = [block('live-1', 'B lead'), block('live-2', 'B detail')];
    const { container, rerender } = render(desk(first));
    const guide = () => container.querySelector('.study-guide');
    fireEvent.click(guide() as Element);
    expect(guide()?.getAttribute('aria-pressed')).toBe('true');
    // Same spec id, different answer — the reset has to fire on the CONTENT changing.
    rerender(desk(second));
    expect(guide()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the walk while the very same answer re-renders', () => {
    const same = [block('live-1', 'A lead'), block('live-2', 'A detail')];
    const { container, rerender } = render(desk(same));
    fireEvent.click(container.querySelector('.study-guide') as Element);
    rerender(desk([...same]));
    expect(container.querySelector('.study-guide')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('a REPLACE is caught even when it opens with the same block type', () => {
  // The detector compared id:type at each index, but early in a stream only index 0 exists — and
  // the answer prompt pushes an answer/insight card first, so a new answer's opener routinely
  // matches the old one's id AND type. The desk then held the previous answer's whole cast under
  // the new question's title for the entire stream. A follow-UP only ever appends, so a list that
  // SHRANK is the signal the type comparison cannot give.
  const oldAnswer = [
    block('live-1', 'Old lead'),
    block('live-2', 'Old detail'),
    block('live-3', 'Old extra'),
  ];
  const newAnswer = [block('live-1', 'New lead'), block('live-2', 'New detail')];

  function desk(blocks: Block[], streaming: boolean, answerEpoch: number) {
    return (
      <StudyStage
        data={spec(blocks, 'live')}
        blocks={blocks}
        spot={blocks[0]?.id ?? null}
        streaming={streaming}
        answerEpoch={answerEpoch}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
  }

  it('shows the new answer while it streams, not the old cast', () => {
    const { rerender } = render(desk(oldAnswer, false, 0));
    expect(document.querySelectorAll('.study-card').length).toBe(3);
    // The replace streams its first card: identical id AND identical type to the old first card.
    rerender(desk([newAnswer[0]], true, 1));
    const body = document.body.textContent ?? '';
    expect(body).toContain('New lead');
    expect(body).not.toContain('Old');
  });

  it('still holds the desk still for a follow-up that appends', () => {
    const grown = [...oldAnswer, block('live-4', 'Appended')];
    const { rerender } = render(desk(oldAnswer, false, 0));
    rerender(desk(grown, true, 0));
    expect(document.querySelectorAll('.study-card').length).toBe(3);
    expect(document.body.textContent ?? '').not.toContain('Appended');
  });
});

describe('the offer and the desk agree on what belongs there', () => {
  // `TopicCanvas` counted every id-bearing block when deciding whether to OFFER the Study, while
  // `StudyStage` filtered worlds out — so an answer whose only addressable block was a doorway
  // offered a Study that then rendered nothing: no cards, no beats, no message, and no way back
  // but the toggle the reader had just used. Two copies of one rule is what allowed the drift, so
  // both sides now read `deskObjects` and this is the test of that single rule.
  const world = {
    type: 'world',
    id: 'w',
    col: 12,
    num: 'w',
    props: { title: 'Teach me about regimes' },
  } as unknown as Block;

  const addressable = (blocks: Block[]): number => deskObjects(blocks).filter((b) => !!b.id).length;

  it('counts nothing for an answer that is only a doorway', () => {
    expect(addressable([world])).toBe(0);
  });

  it('counts the real object beside a doorway', () => {
    expect(addressable([block('a', 'Revenue'), world])).toBe(1);
  });

  it('draws exactly what it counted', () => {
    const blocks = [block('a', 'Revenue'), block('b', 'Costs'), world];
    const { container } = render(
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />,
    );
    expect(container.querySelectorAll('.study-beat')).toHaveLength(addressable(blocks));
  });
});

describe('a note the reader has seen does not rewrite itself', () => {
  // The model's notes stream in, so the remark in the margin can arrive after the card is already
  // on the desk. Without a latch it rewrites itself under the reader's eyes mid-sentence. The
  // intro gate is the one window where an upgrade is free — while it is closed the notes are
  // `visibility: hidden` — so the freeze begins when the desk actually becomes visible.
  const blocks = [block('a', 'Revenue')];
  const derived = {
    a: [{ text: 'Mavéa reads this off the card.', kind: 'caution' as const }],
  };
  const authored = {
    a: [{ text: 'The model brings an outside benchmark.', kind: 'caution' as const }],
  };

  function desk(
    asides: Record<string, { text: string; kind: 'caution' }[]>,
    authoredIds: ReadonlySet<string> = new Set(),
    intro?: 'full',
  ) {
    return (
      <StudyStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        asides={asides}
        asidesAuthored={authoredIds}
        {...(intro ? { intro } : {})}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />
    );
  }

  it('upgrades a derived hold once, then keeps the authored note stable', () => {
    const { container, rerender } = render(desk(derived));
    expect(container.textContent).toContain('Mavéa reads this off the card.');
    rerender(desk(authored, new Set(['a'])));
    expect(container.textContent).toContain('outside benchmark');
    rerender(desk(derived));
    expect(container.textContent).toContain('outside benchmark');
  });

  it('still takes the upgrade while the gate is hiding the margin', () => {
    const { container, rerender } = render(desk(derived, new Set(), 'full'));
    rerender(desk(authored, new Set(['a']), 'full'));
    // Nothing was on screen to swap, so the desk opens on the better note rather than the floor.
    expect(container.textContent).toContain('outside benchmark');
  });

  it('lets a genuinely new answer write its own notes', () => {
    const { container, rerender } = render(desk(derived));
    const next = [block('a', 'Costs')];
    rerender(
      <StudyStage
        data={spec(next)}
        blocks={next}
        spot="a"
        asides={authored}
        asidesAuthored={new Set(['a'])}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />,
    );
    expect(container.textContent).toContain('outside benchmark');
  });

  it('drops held notes when a refine replaces the block under the same id', () => {
    const { container, rerender } = render(desk(authored, new Set(['a'])));
    expect(container.textContent).toContain('outside benchmark');
    const refined = [block('a', 'Refined revenue')];
    rerender(
      <StudyStage
        data={spec(refined)}
        blocks={refined}
        spot="a"
        asides={derived}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      />,
    );
    expect(container.textContent).toContain('Mavéa reads this off the card.');
    expect(container.textContent).not.toContain('outside benchmark');
  });
});

describe('the first Study entrance waits for the complete cast', () => {
  it('stays covered through partials, then deals the full answer at settle', async () => {
    vi.useFakeTimers();
    try {
      const one = [block('gate-a', 'First')];
      const full = [...one, block('gate-b', 'Second'), block('gate-c', 'Third')];
      const view = (cast: Block[], streaming: boolean) => (
        <StudyStage
          data={spec(cast, 'intro-answer')}
          blocks={cast}
          spot="gate-a"
          answerEpoch={11}
          streaming={streaming}
          intro="full"
          renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        />
      );
      const { container, rerender } = render(view(one, true));
      rerender(view(full, true));
      await act(() => vi.advanceTimersByTimeAsync(3_400));
      expect(container.querySelector('.study-intro')).toBeTruthy();

      rerender(view(full, false));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(container.querySelector('.study-intro')).toBeNull();
      expect(container.querySelectorAll('.study-card')).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
