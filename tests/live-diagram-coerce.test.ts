import { describe, it, expect } from 'vitest';
import { validateLiveResponse, ALLOWED_BLOCK_TYPES } from '../src/engine/liveSchema';
import type { DiagramProps } from '../src/canvas/blocks/media/types';

// The `diagram` block draws the model's shapes verbatim into a FIXED 0–100 viewBox, so an
// out-of-range or NaN coordinate breaks the layout. These lock the coordinate guard added to
// buildDiagram: clamp what's recoverable, drop what's degenerate, never render an empty figure.
const ALLOWED = new Set<string>([...ALLOWED_BLOCK_TYPES, 'diagram']);

/** Validate a single diagram block and return its coerced props (or null if it was dropped).
 *  A diagram carries its own `title`, so inject one and let each case supply shapes/labels. */
function coerceDiagram(props: Record<string, unknown>): DiagramProps | null {
  const r = validateLiveResponse(
    { title: 'T', blocks: [{ type: 'diagram', props: { title: 'Figure', ...props } }] },
    ALLOWED,
  );
  const b = r?.blocks.find((x) => x.type === 'diagram');
  return b ? (b.props as unknown as DiagramProps) : null;
}

describe('buildDiagram — coordinate sanity for the labeled-figure block', () => {
  it('clamps out-of-range shape and label coordinates onto the 0–100 canvas', () => {
    const d = coerceDiagram({
      shapes: [{ kind: 'circle', cx: 250, cy: -40, r: 10 }],
      labels: [{ x: 999, y: -5, text: 'core' }],
    });
    expect(d).not.toBeNull();
    expect(d!.shapes[0]).toMatchObject({ kind: 'circle', cx: 100, cy: 0, r: 10 });
    expect(d!.labels[0]).toMatchObject({ x: 100, y: 0, text: 'core' });
  });

  it('falls back non-finite coordinates to the canvas center instead of emitting NaN', () => {
    const d = coerceDiagram({
      shapes: [{ kind: 'rect', x: 'abc', y: 10, w: 20, h: 20 }],
      labels: [{ x: 'nope', y: 'nan', text: 'mid' }],
    });
    expect(d).not.toBeNull();
    expect(d!.shapes[0]).toMatchObject({ kind: 'rect', x: 50, y: 10, w: 20, h: 20 });
    expect(Number.isFinite(d!.labels[0].x)).toBe(true);
    expect(d!.labels[0].x).toBe(50);
  });

  it('drops degenerate shapes (zero-length line, zero-radius circle, <3-point polygon)', () => {
    const d = coerceDiagram({
      shapes: [
        { kind: 'line', x1: 10, y1: 10, x2: 10, y2: 10 }, // zero-length → dropped
        { kind: 'circle', cx: 50, cy: 50, r: 0 }, // zero-radius → dropped
        { kind: 'polygon', points: '5,5 5,5' }, // <3 distinct points → dropped
        { kind: 'line', x1: 10, y1: 10, x2: 80, y2: 60 }, // valid → kept
      ],
      labels: [],
    });
    expect(d).not.toBeNull();
    expect(d!.shapes).toHaveLength(1);
    expect(d!.shapes[0]).toMatchObject({ kind: 'line', x1: 10, x2: 80 });
  });

  it('drops a figure entirely when no non-degenerate shape survives (never an empty card)', () => {
    const d = coerceDiagram({
      shapes: [{ kind: 'circle', cx: 50, cy: 50, r: -3 }],
      labels: [{ x: 10, y: 10, text: 'orphan' }],
    });
    expect(d).toBeNull();
  });

  it('drops a path authored in the wrong (pixel) coordinate space', () => {
    const d = coerceDiagram({
      shapes: [
        { kind: 'path', d: 'M 5 5 L 90 90' }, // in-space → kept
        { kind: 'path', d: 'M 0 0 L 640 480' }, // pixels → dropped
      ],
      labels: [],
    });
    expect(d).not.toBeNull();
    expect(d!.shapes).toHaveLength(1);
    expect(d!.shapes[0].d).toBe('M 5 5 L 90 90');
  });

  it('passes a valid in-range figure through unchanged', () => {
    const d = coerceDiagram({
      shapes: [
        { kind: 'circle', cx: 30, cy: 40, r: 12, color: 'var(--insight)' },
        { kind: 'line', x1: 0, y1: 0, x2: 50, y2: 50, arrow: true },
      ],
      labels: [{ x: 30, y: 40, text: 'nucleus', side: 'right' }],
    });
    expect(d).not.toBeNull();
    expect(d!.shapes).toHaveLength(2);
    expect(d!.shapes[0]).toMatchObject({ cx: 30, cy: 40, r: 12, color: 'var(--insight)' });
    expect(d!.shapes[1].arrow).toBe(true);
    expect(d!.labels[0]).toMatchObject({ text: 'nucleus', side: 'right' });
  });
});
