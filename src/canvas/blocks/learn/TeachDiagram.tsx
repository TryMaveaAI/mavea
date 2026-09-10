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
import {
  calloutOffset,
  computeFit,
  fitLabel,
  fitShape,
  layoutLabels,
  TD_LINE_H,
  type Fit,
  type PlacedLabel,
} from './teachDiagramLayout';

type Props = TeachDiagramProps & { delay?: number; spotlight?: boolean; blockId?: string };

// How long to hold a step before advancing — paced to how long its caption takes to say (the same
// ~155-wpm heuristic the voice tour uses), clamped so a one-word step still reads and a long one
// can't stall the build. A local copy: a renderer must not import from the live/ turn pipeline.
function stepDwellMs(caption: string): number {
  const words = caption.trim() ? caption.trim().split(/\s+/).length : 1;
  return Math.min(7000, Math.max(1500, words * 385 + 500));
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
  // A figure taller than 4:3 on a full-width card is a wall of empty stage — the model's ratio is
  // a hint about the drawing, not a licence to take the whole screen.
  const H = Math.round((100 / Math.min(4, Math.max(0.75, ratio))) * 10) / 10;
  const reduce = useMemo(() => prefersReducedMotion(), []);
  const lastStep = Math.max(0, steps.length - 1);
  const canStep = steps.length > 1;

  // Centre + fill the WHOLE figure (all steps, so it's stable as the build advances — never
  // re-framing between steps). The fit is applied to the NUMBERS, never as a group transform: a
  // transform scales the glyphs with the geometry, so a figure drawn in a 0–1000 space came out as
  // unreadable specks in one corner, and every callout was laid out in a space the reader never
  // saw. Shapes and label data are mapped into frame units first; text keeps its authored size and
  // the callouts are placed in the frame they are drawn in.
  const fit = useMemo<Fit | null>(
    () =>
      computeFit(
        [...baseShapes, ...steps.flatMap((s) => s.add)],
        [...baseLabels, ...steps.flatMap((s) => s.labels ?? [])],
        H,
      ),
    [baseShapes, baseLabels, steps, H],
  );
  const fittedBase = useMemo(() => baseShapes.map((s) => fitShape(s, fit)), [baseShapes, fit]);
  const fittedSteps = useMemo(
    () => steps.map((step) => step.add.map((s) => fitShape(s, fit))),
    [steps, fit],
  );
  const fittedLabels = useMemo(
    () => [...baseLabels, ...steps.flatMap((s) => s.labels ?? [])].map((l) => fitLabel(l, fit)),
    [baseLabels, steps, fit],
  );

  // Place every callout across the WHOLE figure (base + every step) at once, so a label's position is
  // stable as the build advances, no two overlap, and none bleed off the card. See layoutLabels.
  const placed = useMemo(
    () => layoutLabels(fittedLabels, H, calloutOffset(fit?.scale ?? 1)),
    [fittedLabels, H, fit],
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

          {/* Already in frame units (see the fit above): centred and filled regardless of where or
              at what scale the model drew it, with strokes kept crisp by the non-scaling-stroke on
              .lr-td-shape. */}
          <g>
            {/* The figure at rest — always present, never animated. */}
            {fittedBase.map((s, i) => (
              <TdShape key={`b${i}`} s={s} fit={fit} drawing={false} idx={i} arrowId={arrowId} />
            ))}
            {baseLabels.map((_, i) => (
              <TdLabel key={`bl${i}`} l={fittedLabels[i]} drawing={false} p={placed[i]} />
            ))}

            {/* Each revealed step's shapes, added on top of the prior ones. The newest step draws in;
                settled steps render statically. Keying on `current` re-runs the draw on replay. */}
            {steps.slice(0, current + 1).map((step, si) => (
              <g key={`s${si}-${si === current ? current : 'set'}`}>
                {fittedSteps[si].map((s, i) => (
                  <TdShape
                    key={`s${si}sh${i}`}
                    s={s}
                    fit={fit}
                    drawing={!reduce && si === current}
                    idx={i}
                    emphasize={step.emphasize?.includes(i)}
                    arrowId={arrowId}
                  />
                ))}
                {(step.labels ?? []).map((_, i) => (
                  <TdLabel
                    key={`s${si}l${i}`}
                    l={fittedLabels[stepLabelStart[si] + i]}
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

/** One figure shape, already in frame units. `drawing` adds the stroke-draw class; `emphasize`
 *  pulses it once it lands. A path is the one kind whose numbers cannot be rewritten, so it alone
 *  carries the fit as a transform — pure geometry, no glyphs to scale with it. */
function TdShape({
  s,
  fit,
  drawing,
  idx,
  emphasize,
  arrowId,
}: {
  s: DiagShape;
  fit: Fit | null;
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
      return (
        <path
          d={s.d}
          transform={fit ? `translate(${fit.tx} ${fit.ty}) scale(${fit.scale})` : undefined}
          {...common}
        />
      );
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
