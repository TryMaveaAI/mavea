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
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MorphStage } from '../src/canvas/spatial/morph/MorphStage';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { useMorphStage } from '../src/canvas/spatial/morph/useMorphStage';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
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
