// The unranked fallback — a figure whose nodes carry no links the layout could resolve — must
// wrap onto rows rather than running a single column-per-node line off the frame: the stage
// scales the picture to the card, so a row that widens per node paints its labels below the
// legibility floor.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { columnsAcross, planLayered } from '../src/canvas/blocks/diagrams/layered';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import type { DataPipelineStage } from '../src/canvas/blocks/diagrams/types';

// DataPipeline's own frame constants, mirrored here so the wrap bound is checked at the size a
// real figure asks for.
const VIEW_W = 1000;
const NODE_W = 186;
const PAD = NODE_W / 2 + 20;
const MIN_COL_SPACING = NODE_W + 40;

describe('layered: unlinked nodes wrap inside the frame', () => {
  it('wraps 24 unlinked nodes at the column count the frame holds', () => {
    const across = columnsAcross(VIEW_W, PAD, MIN_COL_SPACING);
    const plan = planLayered(24, [], { maxColumns: across });

    expect(plan.grid).toBe(true);
    expect(across).toBeGreaterThan(1);
    expect(plan.columns.length).toBe(across);
    expect(plan.rows).toBe(Math.ceil(24 / across));
    // Every node placed exactly once, row-major so the authored order still reads left to right.
    expect(plan.columns.flat().sort((a, b) => a - b)).toEqual([...Array(24).keys()]);
    expect(plan.columns[0][0]).toBe(0);
    expect(plan.columns[1][0]).toBe(1);

    // The planned columns fit the declared frame, so the card never has to widen for them.
    const width = Math.max(1, plan.columns.length - 1) * MIN_COL_SPACING + PAD * 2;
    expect(width).toBeLessThanOrEqual(VIEW_W);
  });

  it('keeps DataPipeline at its declared viewBox width with 24 unlinked stages', () => {
    const stages: DataPipelineStage[] = Array.from({ length: 24 }, (_, i) => ({
      id: `s${i}`,
      label: `Stage ${i + 1}`,
      kind: 'transform',
    }));
    const { container } = render(
      <DataPipeline title="Twenty-four unlinked stages" stages={stages} edges={[]} />,
    );
    const svg = container.querySelector('svg.dg-svg');
    const [, , vbW] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(vbW).toBe(VIEW_W);
  });
});
