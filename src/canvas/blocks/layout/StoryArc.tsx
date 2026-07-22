// StoryArc.tsx — renders a named narrative framework as its canonical visual shape.
// Freytag: a tension pyramid (exposition → rising → climax → falling → dénouement).
// Three-act: three proportioned phases with transition markers.
// Hero's Journey: a circular departure-initiation-return arc.
// Save the Cat: Blake Snyder's 15-beat horizontal sequence.
// Supplied beats are pinned to their stage as small vertical markers, so the card
// maps user content onto the structure rather than showing an empty diagram.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ArcBeat, StoryArcProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StoryArcProps & { delay?: number };

const VB_W = 480;
const VB_H = 200;
const PAD = 20;
const DRAW_W = VB_W - PAD * 2;
const DRAW_H = VB_H - PAD * 2 - 24; // 24 for bottom labels

// ── Freytag pyramid ──────────────────────────────────────────────────────────
//  Tension rises to a single peak then falls. Five labelled stages.
const FREYTAG_STAGES = ['Exposition', 'Rising Action', 'Climax', 'Falling Action', 'Dénouement'];
const FREYTAG_POINTS = [0, 0.2, 0.5, 0.8, 1.0]; // normalised x positions
const FREYTAG_TENSIONS = [0.08, 0.45, 1.0, 0.5, 0.1]; // normalised tension (y, 0=bottom, 1=top)

// ── Three-act ──────────────────────────────────────────────────────────────
const THREEACT_STAGES = [
  { label: 'Act I — Setup', x0: 0, x1: 0.25 },
  { label: 'Act II — Confrontation', x0: 0.25, x1: 0.75 },
  { label: 'Act III — Resolution', x0: 0.75, x1: 1.0 },
];
const THREEACT_TRANSITIONS = [
  { x: 0.25, label: 'Plot Point I' },
  { x: 0.75, label: 'Plot Point II' },
];

// ── Hero's Journey (12 stages) ────────────────────────────────────────────
const HERO_STAGES = [
  'Ordinary World',
  'Call',
  'Refusal',
  'Mentor',
  'Crossing',
  'Tests',
  'Innermost Cave',
  'Ordeal',
  'Reward',
  'Road Back',
  'Resurrection',
  'Return',
];

// ── Save the Cat (15 beats) ───────────────────────────────────────────────
const STC_BEATS = [
  { label: 'Opening Image', pct: 1 },
  { label: 'Theme Stated', pct: 5 },
  { label: 'Set-up', pct: 10 },
  { label: 'Catalyst', pct: 12 },
  { label: 'Debate', pct: 20 },
  { label: 'Break into 2', pct: 25 },
  { label: 'B Story', pct: 30 },
  { label: 'Fun & Games', pct: 50 },
  { label: 'Midpoint', pct: 50 },
  { label: 'Bad Guys Close In', pct: 62.5 },
  { label: 'All Is Lost', pct: 75 },
  { label: 'Dark Night', pct: 80 },
  { label: 'Break into 3', pct: 87 },
  { label: 'Finale', pct: 95 },
  { label: 'Final Image', pct: 99 },
];

// ── helpers ──────────────────────────────────────────────────────────────
const px = (nx: number) => PAD + nx * DRAW_W;
const py = (nt: number) => PAD + (1 - nt) * DRAW_H;

// Beat labels are pinned at a fixed offset next to their stage marker with no wrap — an
// unbounded label collides with neighbouring pins/curve/stage text instead of stopping short.
// Hard-cap to a character budget with an ellipsis, same idiom as EtymTree/DiagramFlow.
const BEAT_LABEL_MAX = 22;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Find which stage index a beat maps to by name prefix match (case-insensitive).
function matchStage(stageName: string, stages: string[]): number {
  const q = stageName.trim().toLowerCase();
  const exact = stages.findIndex((s) => s.toLowerCase() === q);
  if (exact >= 0) return exact;
  // Partial match
  const partial = stages.findIndex(
    (s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase()),
  );
  return partial;
}

export function StoryArc({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  framework,
  beats,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;

  const svg = useMemo(() => {
    const safeBeats: ArcBeat[] = beats ?? [];
    if (framework === 'freytag') return drawFreytag(safeBeats);
    if (framework === 'threeact') return drawThreeAct(safeBeats);
    if (framework === 'herojourney') return drawHeroJourney(safeBeats);
    if (framework === 'savethecat') return drawSaveTheCat(safeBeats);
    return null;
  }, [framework, beats]);

  const frameworkLabel: Record<string, string> = {
    freytag: 'Freytag Pyramid',
    threeact: 'Three-Act Structure',
    herojourney: "Hero's Journey",
    savethecat: 'Save the Cat',
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="sa-framework-label">{frameworkLabel[framework] ?? framework}</div>

      <div className="sa-wrap">
        <svg
          className="sa-svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label={`${frameworkLabel[framework] ?? framework} story structure`}
          preserveAspectRatio="xMidYMid meet"
        >
          {svg}
        </svg>
      </div>

      {caption && <div className="block-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          dangerouslySetInnerHTML={richInnerHtml(footer)}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}

// ── SVG sub-renderers ────────────────────────────────────────────────────────

function drawFreytag(beats: ArcBeat[]) {
  // The Freytag tension curve: smooth polyline through the 5 stage points.
  const pts = FREYTAG_POINTS.map(
    (nx, i) => `${px(nx).toFixed(1)},${py(FREYTAG_TENSIONS[i]).toFixed(1)}`,
  ).join(' ');
  // Fill under the curve.
  const fillPts = [
    `${px(0).toFixed(1)},${py(0).toFixed(1)}`,
    ...FREYTAG_POINTS.map((nx, i) => `${px(nx).toFixed(1)},${py(FREYTAG_TENSIONS[i]).toFixed(1)}`),
    `${px(1).toFixed(1)},${py(0).toFixed(1)}`,
  ].join(' ');

  const beatPins = beats
    .map((b, i) => {
      const si = matchStage(b.stage, FREYTAG_STAGES);
      if (si < 0) return null;
      const nx = FREYTAG_POINTS[si];
      const nt = FREYTAG_TENSIONS[si];
      const bx = px(nx);
      const by = py(nt);
      return (
        <g key={i}>
          <circle cx={bx} cy={by} r={4} className="sa-beat-dot" />
          <text x={bx} y={by - 10} textAnchor="middle" className="sa-beat-lbl">
            {truncate(b.label, BEAT_LABEL_MAX)}
            {b.label.length > BEAT_LABEL_MAX && <title>{b.label}</title>}
          </text>
        </g>
      );
    })
    .filter(Boolean);

  const labelY = VB_H - 6;

  return (
    <>
      {/* Tension fill */}
      <polygon points={fillPts} className="sa-fill" />
      {/* Tension curve */}
      <polyline points={pts} fill="none" className="sa-curve" />
      {/* Baseline */}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(0)} className="sa-baseline" />
      {/* Stage labels */}
      {FREYTAG_STAGES.map((s, i) => {
        const anchor = i === 0 ? 'start' : i === FREYTAG_STAGES.length - 1 ? 'end' : 'middle';
        return (
          <text
            key={i}
            x={px(FREYTAG_POINTS[i])}
            y={labelY}
            textAnchor={anchor}
            className="sa-stage-lbl"
          >
            {s}
          </text>
        );
      })}
      {/* Beat pins */}
      {beatPins}
    </>
  );
}

function drawThreeAct(beats: ArcBeat[]) {
  const actColors = [
    'color-mix(in oklab, var(--presence) 12%, transparent)',
    'color-mix(in oklab, var(--warning) 12%, transparent)',
    'color-mix(in oklab, var(--insight) 12%, transparent)',
  ];
  const labelY = VB_H - 6;

  const beatPins = beats
    .map((b, i) => {
      const si = matchStage(
        b.stage,
        THREEACT_STAGES.map((a) => a.label),
      );
      if (si < 0) return null;
      const act = THREEACT_STAGES[si];
      const midX = px((act.x0 + act.x1) / 2);
      const pinY = py(0.5);
      return (
        <g key={i}>
          <circle cx={midX} cy={pinY} r={4} className="sa-beat-dot" />
          <text x={midX} y={pinY - 10} textAnchor="middle" className="sa-beat-lbl">
            {truncate(b.label, BEAT_LABEL_MAX)}
            {b.label.length > BEAT_LABEL_MAX && <title>{b.label}</title>}
          </text>
        </g>
      );
    })
    .filter(Boolean);

  return (
    <>
      {THREEACT_STAGES.map((a, i) => (
        <rect
          key={i}
          x={px(a.x0)}
          y={PAD}
          width={DRAW_W * (a.x1 - a.x0)}
          height={DRAW_H}
          fill={actColors[i]}
          className="sa-act-rect"
        />
      ))}
      {/* Transition lines */}
      {THREEACT_TRANSITIONS.map((t, i) => (
        <g key={i}>
          <line x1={px(t.x)} y1={PAD} x2={px(t.x)} y2={py(0)} className="sa-transition" />
          <text x={px(t.x)} y={PAD + 12} textAnchor="middle" className="sa-transition-lbl">
            {t.label}
          </text>
        </g>
      ))}
      {/* Act labels */}
      {THREEACT_STAGES.map((a, i) => (
        <text
          key={i}
          x={px((a.x0 + a.x1) / 2)}
          y={labelY}
          textAnchor="middle"
          className="sa-stage-lbl"
        >
          {a.label}
        </text>
      ))}
      {beatPins}
    </>
  );
}

function drawHeroJourney(beats: ArcBeat[]) {
  // Departure arc (left semi), Initiation (top), Return arc (right semi).
  // Draw as a circular path around a centre, labelling 12 stages.
  const n = HERO_STAGES.length;
  const CR = DRAW_H * 0.42; // circle radius
  const OCX = VB_W / 2;
  const OCY = VB_H / 2 + 10;

  const stagePts = HERO_STAGES.map((_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      x: OCX + CR * Math.cos(angle),
      y: OCY + CR * Math.sin(angle),
      lx: OCX + (CR + 26) * Math.cos(angle),
      ly: OCY + (CR + 26) * Math.sin(angle),
      angle,
    };
  });

  const beatPins = beats
    .map((b, i) => {
      const si = matchStage(b.stage, HERO_STAGES);
      if (si < 0) return null;
      const p = stagePts[si];
      return (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} className="sa-beat-dot-hero" />
          <text x={p.lx} y={p.ly} textAnchor="middle" className="sa-beat-lbl">
            {truncate(b.label, BEAT_LABEL_MAX)}
            {b.label.length > BEAT_LABEL_MAX && <title>{b.label}</title>}
          </text>
        </g>
      );
    })
    .filter(Boolean);

  // Arrow path following the circle clockwise.
  const circlePath =
    stagePts
      .map((p, i) =>
        i === 0 ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      )
      .join(' ') + ' Z';

  return (
    <>
      {/* Circle guide */}
      <circle cx={OCX} cy={OCY} r={CR} fill="none" className="sa-circle-guide" />
      {/* Journey path */}
      <path d={circlePath} fill="none" className="sa-circle-path" />
      {/* Stage dots and labels */}
      {stagePts.map((p, i) => {
        const anchor = p.lx < OCX - 10 ? 'end' : p.lx > OCX + 10 ? 'start' : 'middle';
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} className="sa-stage-dot" />
            <text x={p.lx} y={p.ly + 4} textAnchor={anchor} className="sa-hj-lbl">
              {HERO_STAGES[i]}
            </text>
          </g>
        );
      })}
      {/* Beat pins on top */}
      {beatPins}
      {/* Departure / Initiation / Return arc labels */}
      <text
        x={OCX - CR - 18}
        y={OCY + 6}
        textAnchor="middle"
        className="sa-arc-lbl"
        transform={`rotate(-90 ${OCX - CR - 18} ${OCY})`}
      >
        DEPARTURE
      </text>
      <text x={OCX} y={PAD + 8} textAnchor="middle" className="sa-arc-lbl">
        INITIATION
      </text>
      <text
        x={OCX + CR + 18}
        y={OCY + 6}
        textAnchor="middle"
        className="sa-arc-lbl"
        transform={`rotate(90 ${OCX + CR + 18} ${OCY})`}
      >
        RETURN
      </text>
    </>
  );
}

function drawSaveTheCat(beats: ArcBeat[]) {
  const timelineY = py(0.5);
  const beatPins = beats
    .map((b, i) => {
      // Match against STC beat labels.
      const si = matchStage(
        b.stage,
        STC_BEATS.map((s) => s.label),
      );
      const pct = si >= 0 ? STC_BEATS[si].pct / 100 : -1;
      if (pct < 0) return null;
      const bx = px(pct);
      return (
        <g key={i}>
          <line x1={bx} y1={timelineY - 16} x2={bx} y2={timelineY + 6} className="sa-stc-pin" />
          <text x={bx} y={timelineY - 22} textAnchor="middle" className="sa-beat-lbl">
            {truncate(b.label, BEAT_LABEL_MAX)}
            {b.label.length > BEAT_LABEL_MAX && <title>{b.label}</title>}
          </text>
        </g>
      );
    })
    .filter(Boolean);

  const actBreaks = [25, 75]; // STC act breaks at 25% and 75%

  return (
    <>
      {/* Timeline bar */}
      <rect x={PAD} y={timelineY - 4} width={DRAW_W} height={8} rx={4} className="sa-stc-bar" />
      {/* Act break markers */}
      {actBreaks.map((pct, i) => (
        <line
          key={i}
          x1={px(pct / 100)}
          y1={timelineY - 20}
          x2={px(pct / 100)}
          y2={timelineY + 20}
          className="sa-stc-break"
        />
      ))}
      {/* Beat ticks */}
      {STC_BEATS.map((b, i) => {
        const bx = px(b.pct / 100);
        const above = i % 2 === 0;
        return (
          <g key={i}>
            <line
              x1={bx}
              y1={timelineY - 4}
              x2={bx}
              y2={above ? timelineY - 10 : timelineY + 10}
              className="sa-stc-tick"
            />
            <text
              x={bx}
              y={above ? timelineY - 16 : timelineY + 22}
              textAnchor="middle"
              className="sa-stc-lbl"
            >
              {b.label}
            </text>
          </g>
        );
      })}
      {/* Percentage labels: 0 / 25 / 50 / 75 / 100 */}
      {[0, 25, 50, 75, 100].map((pct) => (
        <text key={pct} x={px(pct / 100)} y={VB_H - 4} textAnchor="middle" className="sa-pct-lbl">
          {pct}%
        </text>
      ))}
      {/* Beat pins */}
      {beatPins}
    </>
  );
}
