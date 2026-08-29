import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { StudyStage } from '../src/canvas/study/StudyStage';
import { deriveStudyScene } from '../src/canvas/study/scene';
import { BACK_CAP } from '../src/canvas/study/slots';

function block(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    col: 12,
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
