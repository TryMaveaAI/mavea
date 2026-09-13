// The camera and the world layer have to agree about where the world starts.
//
// camera.ts maps a world point to `cam.x + wx * scale`. MorphStage does not render that way: it
// sizes the world layer to the layout's bbox and places everything inside it with the bbox ORIGIN
// subtracted, so the layer's top-left IS the bbox's top-left. Fitting the bbox in world
// coordinates therefore lands the content `bbox.x * scale` off centre — invisible on the causal
// graph, whose bbox always starts at 0, and plainly wrong on the timeline and the chart, whose
// bbox reaches left of zero the moment a tick label extends past the start of the axis. The world
// drifted sideways until it spilled out of the stage.
//
// What is pinned is the invariant, not a camera number: the layout box, mapped through the
// transform the stage publishes, is centred in the viewport.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MorphStage } from '../src/canvas/spatial/morph/MorphStage';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { useMorphStage, type MorphStageApi } from '../src/canvas/spatial/morph/useMorphStage';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { FIT_FLOOR } from '../src/canvas/spatial/morph/layouts/lanes';
import { fitScale } from '../src/canvas/spatial/camera';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import type { Representation, WorldData } from '../src/canvas/spatial/morph/types';
import { WORLD_SCENARIOS } from '../src/live/world/scenarios';

const VIEWPORT = { w: 1000, h: 700 };

function scenarioWorld(id: string): WorldData {
  const found = WORLD_SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`no scenario ${id}`);
  return worldToMorph(found.spec);
}

/** jsdom has no layout, so the camera never fits unless the viewport reports a box. Only the
 *  viewport is stubbed — every other measurement in the tree stays jsdom's own zero. */
function stubViewport(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (!this.classList.contains('mv-viewport')) return original.call(this);
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: VIEWPORT.w,
      bottom: VIEWPORT.h,
      width: VIEWPORT.w,
      height: VIEWPORT.h,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function Harness({ world, rep }: { world: WorldData; rep: Representation }): React.ReactNode {
  const stage = useMorphStage({ world, initialRep: rep });
  return <MorphStage stage={stage} world={world} />;
}

/** The camera the stage published, read back off the layer it was published to. */
function cameraOf(container: HTMLElement): { x: number; scale: number } {
  const transform = container.querySelector<HTMLElement>('.mv-world')!.style.transform;
  const move = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(transform);
  if (!move) throw new Error(`unreadable transform: ${transform}`);
  return { x: Number(move[1]), scale: Number(move[3]) };
}

afterEach(cleanup);

describe('the morph camera', () => {
  // Both time-based representations reserve room for chrome that hangs left of the plot, which is
  // the only way a bbox origin goes negative; the graph is the control that never does.
  const cases: Array<{ id: string; rep: Representation; bboxX: number }> = [
    {
      id: 'wide-election',
      rep: 'timeline',
      bboxX: layoutTimeline(scenarioWorld('wide-election')).bbox.x,
    },
    {
      id: 'series-reservoir',
      rep: 'chart',
      bboxX: layoutChart(scenarioWorld('series-reservoir')).bbox.x,
    },
  ];

  it.each(cases)('centres $id in the viewport ($rep)', ({ id, rep, bboxX }) => {
    // Without this the case proves nothing: a bbox already at the origin cannot be mis-centred.
    expect(bboxX).not.toBe(0);

    const restore = stubViewport();
    try {
      const world = scenarioWorld(id);
      const { container } = render(<Harness world={world} rep={rep} />);
      const cam = cameraOf(container);
      const layer = container.querySelector<HTMLElement>('.mv-world')!;
      // The layer IS the layout box — MorphStage sizes it to bbox.w/bbox.h and places the content
      // inside it — so where its own midpoint lands is where the world lands.
      const width = Number.parseFloat(layer.style.width);
      const mid = cam.x + (width * cam.scale) / 2;
      expect(mid).toBeCloseTo(VIEWPORT.w / 2, 1);
    } finally {
      restore();
    }
  });
});

/** The stage's fit margin (useMorphStage's MARGIN): the room a fit keeps to the viewport edge. */
const MARGIN = 56;

/** A harness that hands the stage's API back out, so a test can drive a gesture directly. */
function Driven({
  world,
  onStage,
}: {
  world: WorldData;
  onStage: (stage: MorphStageApi) => void;
}): React.ReactNode {
  const stage = useMorphStage({ world, initialRep: 'graph' });
  onStage(stage);
  return <MorphStage stage={stage} world={world} />;
}

describe('the reader’s own pull-back', () => {
  // The fit stops at FIT_FLOOR because a smaller picture is unreadable, and a large world pans
  // from there. But pinching out at that floor used to do nothing at all (the next rung, ascend,
  // is what a wheel tick became), so a world wider than the stage could never be seen whole.
  const overviewOf = (world: WorldData): number => {
    const { bbox } = layoutGraph(world);
    return fitScale({ x: 0, y: 0, w: bbox.w, h: bbox.h }, VIEWPORT, MARGIN);
  };
  const step = 1 / 1.12;
  const centre = [VIEWPORT.w / 2, VIEWPORT.h / 2] as const;

  it('runs down to where the whole world is in view, and ascends only there', () => {
    const world = scenarioWorld('grid-blackout');
    const overview = overviewOf(world);
    // Without this the case proves nothing: a world that fits above the floor never pans.
    expect(overview).toBeLessThan(FIT_FLOOR - 0.05);

    const restore = stubViewport();
    try {
      let stage!: MorphStageApi;
      const { container } = render(<Driven world={world} onStage={(s) => (stage = s)} />);
      expect(cameraOf(container).scale).toBeCloseTo(FIT_FLOOR, 3);
      const viewport = container.querySelector('.mv-viewport')!;
      const wheelOut = (): void => {
        fireEvent.wheel(viewport, { deltaY: 120, clientX: centre[0], clientY: centre[1] });
      };

      // A plain wheel is how most readers zoom, and it never reaches `pinch` — so the first
      // tick goes UNDER the fit floor on that path, not only on the trackpad's.
      act(wheelOut);
      expect(cameraOf(container).scale).toBeLessThan(FIT_FLOOR);

      // …and keeps going until everything fits, never past it.
      for (let i = 0; i < 12; i++) act(wheelOut);
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);

      // Only now is there nothing left to reveal, so a pinch takes the ladder's next rung.
      let outcome = '';
      act(() => {
        outcome = stage.pinch(step, ...centre);
      });
      expect(outcome).toBe('ascend');
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);

      // Zooming back in climbs the same range: one step, not a snap up to the floor.
      act(() => {
        fireEvent.wheel(viewport, { deltaY: -120, clientX: centre[0], clientY: centre[1] });
      });
      expect(cameraOf(container).scale).toBeCloseTo(overview * 1.12, 3);
    } finally {
      restore();
    }
  });

  it('pinches under the floor too, and reports each rung honestly', () => {
    const world = scenarioWorld('grid-blackout');
    const overview = overviewOf(world);

    const restore = stubViewport();
    try {
      let stage!: MorphStageApi;
      const { container } = render(<Driven world={world} onStage={(s) => (stage = s)} />);

      let outcome = '';
      act(() => {
        outcome = stage.pinch(step, ...centre);
      });
      expect(outcome).toBe('zoom');
      expect(cameraOf(container).scale).toBeLessThan(FIT_FLOOR);

      for (let i = 0; i < 12; i++) {
        act(() => {
          stage.pinch(step, ...centre);
        });
      }
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);

      // Only now is there nothing left to reveal, so the ladder's next rung begins.
      act(() => {
        outcome = stage.pinch(step, ...centre);
      });
      expect(outcome).toBe('ascend');
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);

      // Zooming back in climbs the same range: one step, not a snap up to the floor.
      act(() => {
        outcome = stage.pinch(1.12, ...centre);
      });
      expect(outcome).toBe('zoom');
      expect(cameraOf(container).scale).toBeCloseTo(overview * 1.12, 3);
    } finally {
      restore();
    }
  });

  it('is unchanged on a world that already fits above the floor', () => {
    const small = WORLD_SCENARIOS.find((s) => overviewOf(worldToMorph(s.spec)) > FIT_FLOOR + 0.05);
    if (!small) throw new Error('no scenario fits above the floor at this viewport');
    const world = worldToMorph(small.spec);
    const overview = overviewOf(world);

    const restore = stubViewport();
    try {
      let stage!: MorphStageApi;
      const { container } = render(<Driven world={world} onStage={(s) => (stage = s)} />);
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);
      let outcome = '';
      act(() => {
        outcome = stage.pinch(step, ...centre);
      });
      // At its own whole-world fit already, so the pull-back is the next rung, not a zoom.
      expect(outcome).toBe('ascend');
      expect(cameraOf(container).scale).toBeCloseTo(overview, 3);
    } finally {
      restore();
    }
  });
});
