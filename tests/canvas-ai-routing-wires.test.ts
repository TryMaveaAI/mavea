import { describe, expect, it } from 'vitest';
import { wireGeometry } from '../src/canvas/blocks/ai/routingWires';

describe('Routing wires', () => {
  it('leave from the query centre and land on each choice centre, whatever their heights', () => {
    const geo = wireGeometry({ top: 100, bottom: 320 }, { top: 150, bottom: 190 }, [
      { top: 100, bottom: 170 },
      { top: 176, bottom: 216 },
      { top: 222, bottom: 320 },
    ]);
    expect(geo).toEqual({ height: 220, from: 70, to: [35, 96, 171] });
  });

  it('pins a choice scrolled out of view to the column edge it left by', () => {
    const geo = wireGeometry({ top: 0, bottom: 200 }, { top: 80, bottom: 120 }, [
      { top: -90, bottom: -40 },
      { top: 260, bottom: 300 },
    ]);
    expect(geo?.to).toEqual([1, 199]);
  });

  it('draws nothing from a collapsed column', () => {
    expect(wireGeometry({ top: 10, bottom: 10 }, { top: 0, bottom: 20 }, [])).toBeNull();
  });
});
