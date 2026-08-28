import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { RoomStage } from '../src/canvas/room/RoomStage';
import { deriveRoomScene } from '../src/canvas/room/scene';

function block(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    col: 12,
    num: id,
    props: { title, summary: `${title} summary`, conf: 'inferred' },
  } as Block;
}

function spec(blocks: Block[], id = 'room-turn'): ConversationSpec {
  return {
    id,
    workspace: 'Room test',
    title: 'Pressure test',
    sub: 'One answer, one scene',
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

describe('deriveRoomScene', () => {
  it('keeps the conversational focus foregrounded and alternates its closest neighbors', () => {
    const scene = deriveRoomScene(blocks, 'c', new Set());
    expect(scene.active?.id).toBe('c');
    expect(scene.nearby.map((actor) => actor.id)).toEqual(['d', 'b', 'e', 'a']);
    expect(scene.horizon.map((actor) => actor.id)).toEqual(['f']);
    expect(scene.intensity).toBe('immersive');
  });

  it('removes parked actors without losing their source identity', () => {
    const scene = deriveRoomScene(blocks, 'c', new Set(['b', 'd']));
    expect(scene.active?.id).toBe('c');
    expect(scene.nearby.map((actor) => actor.id)).not.toContain('b');
    expect(scene.nearby.map((actor) => actor.id)).not.toContain('d');
    expect(scene.parked.map((actor) => actor.id)).toEqual(['b', 'd']);
  });

  it('falls back to a visible object when the active object is parked', () => {
    const scene = deriveRoomScene(blocks, 'a', new Set(['a']));
    expect(scene.active?.id).toBe('b');
  });

  it('keeps every object reachable when an answer is larger than the nearby ring', () => {
    const many = Array.from({ length: 24 }, (_, index) =>
      block(`block-${index}`, `Object ${index + 1}`),
    );
    const scene = deriveRoomScene(many, 'block-0', new Set());
    const reachable = [scene.active, ...scene.nearby, ...scene.horizon]
      .filter((actor) => actor !== null)
      .map((actor) => actor.id);

    expect(reachable).toHaveLength(many.length);
    expect(new Set(reachable)).toEqual(new Set(many.map((item) => item.id)));
  });
});

describe('RoomStage', () => {
  const renderBlock = (item: Block) => (
    <div className="card">
      <span>{item.id}</span>
      <span>{'title' in item.props ? String(item.props.title) : ''}</span>
    </div>
  );

  it('pulls a nearby object into the foreground without creating a new answer', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <RoomStage
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

    expect(container.querySelector('.room-hero')?.textContent).toContain('Retention');
    expect(onNarrate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('uses Shift activation to keep context while leaving the foreground in place', () => {
    const onAskBlock = vi.fn();
    const { container } = render(
      <RoomStage
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
    expect(container.querySelector('.room-hero')?.textContent).toContain('Revenue');
  });

  it('parks and restores an object reversibly', () => {
    render(<RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />);

    fireEvent.click(screen.getByRole('button', { name: 'Park Retention' }));
    expect(screen.queryByRole('button', { name: 'Bring Retention forward' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Retention' }));
    expect(screen.getByRole('button', { name: 'Bring Revenue forward' })).toBeTruthy();
    expect(document.querySelector('.room-hero')?.textContent).toContain('Retention');
  });

  it('contains no capture controls or permission-triggering media inputs', () => {
    const { container } = render(
      <RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    expect(
      container.querySelector('video, input[accept*="video"], input[accept*="audio"]'),
    ).toBeNull();
    expect(container.textContent).not.toMatch(/camera|record|listen in background/i);
  });

  it('moves through typed teaching notes without duplicating the global Presence', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <RoomStage
        data={spec(blocks)}
        blocks={blocks}
        spot="a"
        renderBlock={renderBlock}
        asides={{
          a: { text: 'Revenue is the lead signal.', kind: 'insight' },
          b: { text: 'This figure traces to the source.', kind: 'evidence' },
        }}
        onNarrate={onNarrate}
      />,
    );

    expect(container.querySelector('.presence')).toBeNull();
    expect(screen.getByText('Pattern')).toBeTruthy();
    expect(screen.getByText('Revenue is the lead signal.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next teaching point' }));
    expect(container.querySelector('.room-hero')?.textContent).toContain('Retention');
    expect(screen.getByText('Evidence')).toBeTruthy();
    expect(onNarrate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('fills the app viewport reliably and leaves with Escape', () => {
    const { container } = render(
      <RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fill the screen with this room' }));
    expect(container.querySelector('.room-stage.is-fullscreen')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Leave full screen' })).toBeTruthy();

    const underneath = vi.fn();
    window.addEventListener('keydown', underneath);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.room-stage.is-fullscreen')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(underneath).not.toHaveBeenCalled();
    window.removeEventListener('keydown', underneath);
  });
});

describe('TopicCanvas — Live Room path', () => {
  it('renders provider answer objects in the Room and keeps Live callbacks connected', () => {
    const onAskBlock = vi.fn();
    const onViewMode = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec(blocks)}
        spot="a"
        built={{}}
        onProve={() => {}}
        onAskBlock={onAskBlock}
        viewMode="room"
        onViewMode={onViewMode}
      />,
    );

    expect(screen.getByRole('region', { name: 'Conversation Room' })).toBeTruthy();
    expect(container.querySelector('.room-stage')).not.toBeNull();
    expect(container.querySelector('.card-grid')).toBeNull();

    // The foreground object carries no button tray. A floating toolbar under the hero reads as
    // chrome bolted to the scene, and it re-states affordances the object itself already offers —
    // so the room keeps its actions in the gestures, not in a rail.
    expect(container.querySelector('.room-hero-actions')).toBeNull();
    expect(container.textContent).not.toMatch(/Keep in context|Move aside/);

    // Shift-click is the surviving route to the grounded multi-block follow-up: it holds an
    // object in context WITHOUT stealing the foreground, which is what a plain click does.
    const pick = container.querySelector('.room-actor .room-actor-pick');
    expect(pick).not.toBeNull();
    fireEvent.pointerDown(pick as Element, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(pick as Element, { pointerId: 1, shiftKey: true });
    expect(onAskBlock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
    expect(onViewMode).toHaveBeenCalledWith('everything');
  });
});

describe('RoomStage — the object travels, and it stays legible', () => {
  const renderBlock = (item: Block) => (
    <div className="card">
      <span>{'title' in item.props ? String(item.props.title) : item.id}</span>
    </div>
  );

  /** jsdom measures everything as 0×0, and a FLIP that measures nothing correctly does nothing —
   *  so the boxes are staged here. Distinct positions AND sizes, since the travel scales too. */
  function stageGeometry(): () => void {
    const original = Element.prototype.getBoundingClientRect;
    const rect = (x: number, y: number, w: number, h: number) =>
      ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('room-stage')) return rect(0, 0, 900, 640);
      if (this.classList.contains('room-actor-pick')) return rect(24, 40, 166, 96);
      if (this.classList.contains('room-hero')) return rect(280, 180, 480, 320);
      return rect(0, 0, 0, 0);
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  it('animates the promoted object from its slot to the foreground', () => {
    const restoreGeometry = stageGeometry();
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const { container } = render(
        <RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
      );
      const pick = container.querySelector('.room-actor .room-actor-pick');
      expect(pick).not.toBeNull();

      fireEvent.pointerDown(pick as Element, { button: 0, pointerId: 1 });
      fireEvent.pointerUp(pick as Element, { pointerId: 1 });

      expect(animate).toHaveBeenCalled();
      // It starts displaced and scaled at the slot it came from, and lands at its own box —
      // a cut would have no keyframes at all.
      const [frames] = animate.mock.calls[0] as unknown as [Keyframe[]];
      expect(String(frames[0].transform)).toMatch(/translate\(-?\d/);
      expect(String(frames[0].transform)).toMatch(/scale\(/);
      expect(frames[1].transform).toBe('none');
    } finally {
      Element.prototype.animate = originalAnimate;
      restoreGeometry();
    }
  });

  it('makes every object in the room a target the pen can reach', () => {
    const { container } = render(
      <RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    // AnnotationLayer resolves a mark's host by data-spot-id ALONE. Stamping only the foreground
    // meant Mavea could mark exactly one thing in the room and could never draw a connector
    // between two — the difference between a room she can teach in and a slideshow.
    const marked = [...container.querySelectorAll('[data-spot-id]')].map((el) =>
      el.getAttribute('data-spot-id'),
    );
    expect(marked).toContain('a');
    for (const actor of container.querySelectorAll('.room-actor')) {
      expect(actor.getAttribute('data-spot-id')).toBe(actor.getAttribute('data-room-actor'));
      expect(actor.getAttribute('data-kind')).toBeTruthy();
    }
    // Foreground plus every nearby slot, not just the one card.
    expect(marked.length).toBeGreaterThan(1);
  });

  it('names nearby objects rather than rendering an unreadable miniature of them', () => {
    const { container } = render(
      <RoomStage data={spec(blocks)} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    // A real card scaled into a ~150px box renders its body text at ~5px, well under the 9px
    // legibility floor — the room must not ship a preview it cannot actually show.
    expect(container.querySelector('.filmstrip-thumb')).toBeNull();

    const first = container.querySelector('.room-actor');
    expect(first?.querySelector('.room-actor-title')?.textContent).toBeTruthy();
    expect(first?.querySelector('.room-actor-kind')?.textContent).toBeTruthy();
  });
});
