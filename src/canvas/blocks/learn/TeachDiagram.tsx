import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { Icon } from '../../../icons/icons';
import { prefersReducedMotion } from '../../focus/motion';
import { register, subscribeClaim, isClaimed } from '../../focus/stepDriver';
import type { DiagShape, DiagLabel } from '../media/types';
import type { TeachDiagramProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { layoutLabels, teachLabelPoint, TD_LINE_H, type PlacedLabel } from './teachDiagramLayout';

type Props = TeachDiagramProps & { delay?: number; spotlight?: boolean; blockId?: string };

// How long to hold a step before advancing — paced to how long its caption takes to say (the same
// ~155-wpm heuristic the voice tour uses), clamped so a one-word step still reads and a long one
// can't stall the build. A local copy: a renderer must not import from the live/ turn pipeline.
function stepDwellMs(caption: string): number {
  const words = caption.trim() ? caption.trim().split(/\s+/).length : 1;
  return Math.min(7000, Math.max(1500, words * 385 + 500));
}

/** Rough bounds of one shape in the 0–100 figure space. Returns null for a `path` (whose `d` we
 *  don't parse) so the fit below bails rather than guessing a wrong box. */
function shapeBounds(s: DiagShape): [number, number, number, number] | null {
  const ok = (v: number | undefined): v is number => Number.isFinite(v);
  switch (s.kind) {
    case 'circle':
      return ok(s.cx) && ok(s.cy) && ok(s.r)
        ? [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r]
        : null;
    case 'rect':
      return ok(s.x) && ok(s.y) && ok(s.w) && ok(s.h) ? [s.x, s.y, s.x + s.w, s.y + s.h] : null;
    case 'line':
      return ok(s.x1) && ok(s.y1) && ok(s.x2) && ok(s.y2)
        ? [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)]
        : null;
    case 'polygon': {
      const nums = (s.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(Number.isFinite);
      if (nums.length < 4) return null;
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x0 = Math.min(x0, nums[i]);
        x1 = Math.max(x1, nums[i]);
        y0 = Math.min(y0, nums[i + 1]);
        y1 = Math.max(y1, nums[i + 1]);
      }
      return [x0, y0, x1, y1];
    }
    default:
      return null; // path — unbounded here
  }
}

/** Centre and fill the whole figure inside the viewBox. Models routinely draw the figure off in one
 *  region (the built-in Pythagorean sample sits in the right third), which — once the svg is
 *  letterboxed on a wide card — reads as a scrunched cluster with a dead band beside it. This maps
 *  the figure's bounding box (every shape + label point) to the centre of the frame and scales it up
 *  when it's small, so it reads as a deliberate, full-size drawing. Returns null (identity) when a
 *  path blocks measurement or the figure already sits centred and full — a good layout is untouched. */
function computeFit(
  shapes: DiagShape[],
  labels: DiagLabel[],
  H: number,
): { scale: number; tx: number; ty: number } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes) {
    if (s.kind === 'path') return null;
    const b = shapeBounds(s);
    if (!b) continue;
    minX = Math.min(minX, b[0]);
    minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]);
    maxY = Math.max(maxY, b[3]);
  }
  for (const l of labels) {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) continue;
    // Fold in the OFFSET callout point, not just the datum, so the fit reserves the band the lead
    // line + text actually occupy rather than letting them spill past the frame after scaling.
    const { tx, ty } = teachLabelPoint(l, H);
    minX = Math.min(minX, l.x, tx);
    minY = Math.min(minY, l.y, ty);
    maxX = Math.max(maxX, l.x, tx);
    maxY = Math.max(maxY, l.y, ty);
  }
  const bw = maxX - minX,
    bh = maxY - minY;
  if (!(bw > 0 && bh > 0)) return null;
  const PAD = 12; // leaves room for label lead-lines/text (offset 7) to stay in frame after fitting
  // Scale to fit BOTH ways: shrink a figure the model drew larger than the frame (the old Math.max(1,…)
  // floor only ever enlarged, so an oversized drawing bled off the card) and enlarge a small one, within
  // sane bounds so a stray outlier can't collapse the figure to nothing.
  const scale = Math.max(0.35, Math.min(Math.min((100 - 2 * PAD) / bw, (H - 2 * PAD) / bh), 2.4));
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const tx = 50 - scale * cx,
    ty = H / 2 - scale * cy;
  // Already centred and full-frame with nothing to gain → leave the figure exactly as authored.
  if (Math.abs(scale - 1) < 0.02 && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5) return null;
  return { scale, tx, ty };
}

export function TeachDiagram({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  steps,
  baseShapes = [],
  baseLabels = [],
  ratio = 1.6,
  footer,
  delay,
  spotlight = false,
  blockId,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // Per-instance marker id so two teach diagrams in one answer don't share `lr-td-arrow`.
  const arrowId = `lr-td-arrow-${useId().replace(/:/g, '')}`;
  const H = Math.round((100 / Math.max(0.4, ratio)) * 10) / 10;
  const reduce = useMemo(() => prefersReducedMotion(), []);
  const lastStep = Math.max(0, steps.length - 1);
  const canStep = steps.length > 1;

  // Centre + fill transform for the WHOLE figure (all steps, so it's stable as the build advances —
  // never re-framing between steps). See computeFit: a no-op for a diagram already drawn full-frame.
  const fit = useMemo(
    () =>
      computeFit(
        [...baseShapes, ...steps.flatMap((s) => s.add)],
        [...baseLabels, ...steps.flatMap((s) => s.labels ?? [])],
        H,
      ),
    [baseShapes, baseLabels, steps, H],
  );
  const fitTransform = fit ? `translate(${fit.tx} ${fit.ty}) scale(${fit.scale})` : undefined;

  // Place every callout across the WHOLE figure (base + every step) at once, so a label's position is
  // stable as the build advances, no two overlap, and none bleed off the card. See layoutLabels.
  const placed = useMemo(
    () => layoutLabels([...baseLabels, ...steps.flatMap((s) => s.labels ?? [])], H),
    [baseLabels, steps, H],
  );
  // Where each step's labels begin in that flat, de-collided list (base labels come first).
  const stepLabelStart = useMemo(() => {
    const starts: number[] = [];
    let acc = baseLabels.length;
    for (const s of steps) {
      starts.push(acc);
      acc += s.labels?.length ?? 0;
    }
    return starts;
  }, [baseLabels, steps]);

  // Reduced motion → the finished figure, shown at once, with no timers. Otherwise build from the
  // first step and auto-play through.
  const [current, setCurrent] = useState(reduce ? lastStep : 0);
  const [playing, setPlaying] = useState(!reduce && canStep);

  // Read steps through a ref so the autoplay effect depends only on PRIMITIVES — props.steps is a
  // fresh array reference on every parent render, and listing it in the deps would tear down and
  // reschedule the timer on each render, stuttering the build. `lastStep` (a number) already
  // captures the only structural change that matters: the step count.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Register this diagram's own step clock so an external driver (the voice tour walk, once it
  // claims `blockId`) can step it directly in sync with narration — see stepDriver.ts. A block
  // with no id (never spotlighted, or rendered outside Live) simply can't be claimed; nothing
  // else here changes. Re-registers if the step count changes so a claimed walk always sees the
  // real bounds; `lastStep` moves in lockstep with `steps.length` so the closure stays accurate.
  useEffect(() => {
    if (!blockId || !canStep) return;
    return register(blockId, {
      count: steps.length,
      setIndex: (i) => setCurrent(Math.min(lastStep, Math.max(0, i))),
      spokenFor: (i) => stepsRef.current[i]?.captionSpoken,
      captionFor: (i) => stepsRef.current[i]?.caption,
    });
  }, [blockId, canStep, steps.length, lastStep]);

  // Whether an external driver currently owns this diagram's clock. Subscribed per-id via
  // useSyncExternalStore (see useDashboards.ts for the same idiom) so only THIS instance
  // re-renders when ITS claim flips — never a context, never a whole-canvas re-render.
  const subscribeDriven = useCallback(
    (onChange: () => void) => (blockId ? subscribeClaim(blockId, onChange) : () => {}),
    [blockId],
  );
  const getDrivenSnapshot = useCallback(() => !!blockId && isClaimed(blockId), [blockId]);
  const driven = useSyncExternalStore(subscribeDriven, getDrivenSnapshot);

  // Auto-play: one timer per step, torn down on every change so only one is ever pending. CSS owns
  // the draw-in animation, so there is nothing else to schedule or clean up. While the tour
  // spotlights the card it loops — pausing on the finished figure, then rebuilding from the start.
  // Suspended entirely while `driven`: the external walk calls setIndex directly, and letting this
  // timer run alongside it would race the two clocks against each other.
  useEffect(() => {
    if (reduce || !canStep || driven) return;
    if (current >= lastStep) {
      if (spotlight) {
        const t = window.setTimeout(() => setCurrent(0), 2200);
        return () => window.clearTimeout(t);
      }
      if (playing) setPlaying(false);
      return;
    }
    if (!playing && !spotlight) return;
    const step = stepsRef.current[current];
    const ms = stepDwellMs(step?.captionSpoken || step?.caption || '');
    const t = window.setTimeout(() => setCurrent((c) => Math.min(lastStep, c + 1)), ms);
    return () => window.clearTimeout(t);
  }, [playing, reduce, current, lastStep, spotlight, canStep, driven]);

  const replay = () => {
    setCurrent(0);
    setPlaying(!reduce && canStep);
  };
  const stepTo = (next: number) => {
    setPlaying(false);
    setCurrent(Math.min(lastStep, Math.max(0, next)));
  };

  const caption = steps[current]?.caption ?? '';

  return (
    <div
      className="card reveal lr-td"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-td-stage">
        <svg viewBox={`0 0 100 ${H}`} className="lr-td-svg" role="img" aria-label={title}>
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {/* Everything is wrapped in the fit transform so the drawn figure is centred and filled
              in the frame regardless of where the model placed it (strokes stay crisp via the
              non-scaling-stroke on .lr-td-shape). */}
          <g transform={fitTransform}>
            {/* The figure at rest — always present, never animated. */}
            {baseShapes.map((s, i) => (
              <TdShape key={`b${i}`} s={s} drawing={false} idx={i} arrowId={arrowId} />
            ))}
            {baseLabels.map((l, i) => (
              <TdLabel key={`bl${i}`} l={l} drawing={false} p={placed[i]} />
            ))}

            {/* Each revealed step's shapes, added on top of the prior ones. The newest step draws in;
                settled steps render statically. Keying on `current` re-runs the draw on replay. */}
            {steps.slice(0, current + 1).map((step, si) => (
              <g key={`s${si}-${si === current ? current : 'set'}`}>
                {step.add.map((s, i) => (
                  <TdShape
                    key={`s${si}sh${i}`}
                    s={s}
                    drawing={!reduce && si === current}
                    idx={i}
                    emphasize={step.emphasize?.includes(i)}
                    arrowId={arrowId}
                  />
                ))}
                {(step.labels ?? []).map((l, i) => (
                  <TdLabel
                    key={`s${si}l${i}`}
                    l={l}
                    drawing={!reduce && si === current}
                    p={placed[stepLabelStart[si] + i]}
                  />
                ))}
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Caption + controls. Keyed on `current` so the caption crossfades as the build advances. */}
      {(caption || canStep) && (
        <div className="lr-td-bar">
          {caption && (
            <p key={current} className="lr-td-caption" aria-live="polite">
              {caption}
            </p>
          )}
          {canStep && (
            <div className="lr-td-controls">
              <button
                type="button"
                className="mini-btn lr-td-btn"
                onClick={replay}
                aria-label="Replay the build"
              >
                <Icon.undo /> Replay
              </button>
              <span className="lr-td-step">
                {current + 1}/{steps.length}
              </span>
              <button
                type="button"
                className="mini-btn lr-td-btn"
                onClick={() => stepTo(current - 1)}
                disabled={current === 0}
                aria-label="Previous step"
              >
                <Icon.chevL />
              </button>
              <button
                type="button"
                className="mini-btn lr-td-btn"
                onClick={() => stepTo(current + 1)}
                disabled={current >= lastStep}
                aria-label="Next step"
              >
                <Icon.chevR />
              </button>
            </div>
          )}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

/** One figure shape. `drawing` adds the stroke-draw class; `emphasize` pulses it once it lands. */
function TdShape({
  s,
  drawing,
  idx,
  emphasize,
  arrowId,
}: {
  s: DiagShape;
  drawing: boolean;
  idx: number;
  emphasize?: boolean;
  arrowId: string;
}) {
  const stroke = s.color || 'var(--text-muted)';
  const fill = s.fill || 'none';
  const cls =
    'lr-td-shape' + (drawing ? ' lr-td-draw' : '') + (emphasize ? ' lr-td-emphasize' : '');
  const common = {
    stroke,
    strokeWidth: 0.7,
    fill,
    className: cls,
    pathLength: 1,
    'data-kind': s.kind,
    style: drawing ? ({ ['--i' as string]: idx } as CSSProperties) : undefined,
  };
  switch (s.kind) {
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} {...common} />;
    case 'rect':
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={1.5} {...common} />;
    case 'line':
      return (
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          strokeLinecap="round"
          markerEnd={s.arrow ? `url(#${arrowId})` : undefined}
          {...common}
        />
      );
    case 'polygon':
      return <polygon points={s.points} {...common} />;
    case 'path':
      return <path d={s.d} {...common} />;
    default:
      return null;
  }
}

/** A callout label: a lead line from the figure datum to its text, drawn where `layoutLabels` placed
 *  it (wrapped, clamped inside the frame, and de-collided so stacked callouts never overlap). The
 *  lead line still points back at the true datum; the full text rides along as a <title> when the
 *  display copy was shortened to fit. */
function TdLabel({ l, drawing, p }: { l: DiagLabel; drawing: boolean; p: PlacedLabel }) {
  const col = l.color || 'var(--text-secondary)';
  const dx = p.anchor === 'start' ? 1 : p.anchor === 'end' ? -1 : 0;
  const n = p.lines.length;
  return (
    <g className={'lr-td-labelg' + (drawing ? ' lr-td-fade' : '')}>
      <line x1={l.x} y1={l.y} x2={p.tx} y2={p.ty} className="lr-td-lead" />
      <circle cx={l.x} cy={l.y} r={1.1} fill={col} />
      <text textAnchor={p.anchor} className="lr-td-lbl" fill={col}>
        {p.lines.map((line, k) => (
          <tspan key={k} x={p.tx + dx} y={p.ty + (k - (n - 1) / 2) * TD_LINE_H + 1.1}>
            {line}
          </tspan>
        ))}
        {p.truncated && <title>{p.full}</title>}
      </text>
    </g>
  );
}
