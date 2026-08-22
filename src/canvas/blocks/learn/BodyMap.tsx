import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BodymapProps, BodyRegion } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BodymapProps & { delay?: number };

// The silhouette is schematic (not anatomical) but proportionally recognisable, drawn from ~21
// segments centred on x=60 across a 120-unit-wide, 286-unit-tall figure. ONE outline serves both
// views: the `side` prop only changes which region NAMES carve it (front: chest/abdomen/thigh/shin;
// back: upper-back/lower-back/hamstring/calf), so the figure is always correct without a second
// coordinate set to drift.
const FIG_W = 120;
const FIG_H = 286;

// Region labels sit at a fixed lx/ly with no box to wrap into — they read outward from each limb
// toward the edge, so the outermost anchors (lx 6 on the left, lx 114 on the right) need room
// beyond the figure itself. The viewBox therefore carries a gutter on each side wide enough for a
// full LABEL_MAX_CHARS label at .bm-label's size; without it the arm and hand labels are simply
// clipped by the SVG viewport.
//
// The gutters are not free, though: inside a viewBox a label lands on screen at its authored size
// times the drawn width over VB_W, so every unit of gutter costs label legibility. This pair —
// ~7 units per character at .bm-label's size, 11 characters — is what fits alongside the figure in
// the column .bm-svg-wrap gets while keeping the drawn label above the 9px legibility floor.
const GUTTER = 78;
const VB_X = -GUTTER;
const VB_W = FIG_W + GUTTER * 2;

// A caller-supplied `label` can be arbitrarily long, so it must be capped to the character budget
// the gutter above actually holds — otherwise it overruns the viewBox or collides with a
// neighbouring label/segment. The untruncated text stays available as a <title> tooltip.
const LABEL_MAX_CHARS = 11;

function truncateLabel(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface SegmentShape {
  kind: 'circle' | 'rect' | 'ellipse' | 'polygon';
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: string;
  // Where an annotation label anchors (SVG coords) and from which side it reads.
  lx: number;
  ly: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

// The physical figure — 21 segments, anterior outline (a symmetric back view reads the same).
const SEGMENTS: Record<string, SegmentShape> = {
  head: { kind: 'circle', cx: 60, cy: 24, r: 19, lx: 80, ly: 20, labelAnchor: 'start' },
  neck: { kind: 'rect', x: 53, y: 43, width: 14, height: 12, lx: 74, ly: 51, labelAnchor: 'start' },
  // Deltoid caps sit at the torso's top outer corners.
  leftShoulder: {
    kind: 'ellipse',
    cx: 31,
    cy: 64,
    rx: 11,
    ry: 9,
    lx: 14,
    ly: 58,
    labelAnchor: 'end',
  },
  rightShoulder: {
    kind: 'ellipse',
    cx: 89,
    cy: 64,
    rx: 11,
    ry: 9,
    lx: 106,
    ly: 58,
    labelAnchor: 'start',
  },
  // Torso split into three bands (front: chest / abdomen / hips · back: upper / lower / glutes).
  torsoUpper: {
    kind: 'polygon',
    points: '30,58 90,58 86,112 34,112',
    lx: 60,
    ly: 88,
    labelAnchor: 'middle',
  },
  torsoMid: {
    kind: 'polygon',
    points: '34,112 86,112 87,150 33,150',
    lx: 60,
    ly: 133,
    labelAnchor: 'middle',
  },
  torsoLow: {
    kind: 'polygon',
    points: '33,150 87,150 84,180 36,180',
    lx: 60,
    ly: 167,
    labelAnchor: 'middle',
  },
  // Arms — upper arm then forearm, tapering to the wrist.
  leftUpperArm: {
    kind: 'polygon',
    points: '9,62 27,65 25,114 12,112',
    lx: 6,
    ly: 88,
    labelAnchor: 'end',
  },
  rightUpperArm: {
    kind: 'polygon',
    points: '111,62 93,65 95,114 108,112',
    lx: 114,
    ly: 88,
    labelAnchor: 'start',
  },
  leftForearm: {
    kind: 'polygon',
    points: '12,114 25,116 22,166 11,164',
    lx: 6,
    ly: 146,
    labelAnchor: 'end',
  },
  rightForearm: {
    kind: 'polygon',
    points: '108,114 95,116 98,166 109,164',
    lx: 114,
    ly: 146,
    labelAnchor: 'start',
  },
  leftHand: { kind: 'ellipse', cx: 14, cy: 176, rx: 7, ry: 10, lx: 6, ly: 182, labelAnchor: 'end' },
  rightHand: {
    kind: 'ellipse',
    cx: 106,
    cy: 176,
    rx: 7,
    ry: 10,
    lx: 114,
    ly: 182,
    labelAnchor: 'start',
  },
  // Legs — thigh, knee joint, shin.
  leftThigh: {
    kind: 'polygon',
    points: '37,180 58,180 55,230 41,230',
    lx: 30,
    ly: 206,
    labelAnchor: 'end',
  },
  rightThigh: {
    kind: 'polygon',
    points: '83,180 62,180 65,230 79,230',
    lx: 90,
    ly: 206,
    labelAnchor: 'start',
  },
  leftKnee: { kind: 'ellipse', cx: 48, cy: 236, rx: 9, ry: 7, lx: 30, ly: 238, labelAnchor: 'end' },
  rightKnee: {
    kind: 'ellipse',
    cx: 72,
    cy: 236,
    rx: 9,
    ry: 7,
    lx: 90,
    ly: 238,
    labelAnchor: 'start',
  },
  leftShin: {
    kind: 'polygon',
    points: '42,242 54,242 52,272 44,272',
    lx: 34,
    ly: 260,
    labelAnchor: 'end',
  },
  rightShin: {
    kind: 'polygon',
    points: '78,242 66,242 68,272 76,272',
    lx: 86,
    ly: 260,
    labelAnchor: 'start',
  },
  leftFoot: {
    kind: 'rect',
    x: 39,
    y: 272,
    width: 18,
    height: 8,
    lx: 34,
    ly: 278,
    labelAnchor: 'end',
  },
  rightFoot: {
    kind: 'rect',
    x: 63,
    y: 272,
    width: 18,
    height: 8,
    lx: 86,
    ly: 278,
    labelAnchor: 'start',
  },
};

// Draw order — back-to-front so limbs sit behind the torso, torso behind head.
const DRAW_ORDER = [
  'leftUpperArm',
  'rightUpperArm',
  'leftForearm',
  'rightForearm',
  'leftHand',
  'rightHand',
  'leftThigh',
  'rightThigh',
  'leftKnee',
  'rightKnee',
  'leftShin',
  'rightShin',
  'leftFoot',
  'rightFoot',
  'leftShoulder',
  'rightShoulder',
  'torsoUpper',
  'torsoMid',
  'torsoLow',
  'neck',
  'head',
];

// The default human-readable name of each segment, by side. Used for the always-on guide labels
// (when the answer highlights nothing) and as the fallback label for a highlighted region.
const SEGMENT_LABEL: Record<'anterior' | 'posterior', Record<string, string>> = {
  anterior: {
    head: 'Head',
    neck: 'Neck',
    leftShoulder: 'Shoulder',
    rightShoulder: 'Shoulder',
    torsoUpper: 'Chest',
    torsoMid: 'Abdomen',
    torsoLow: 'Hips',
    leftUpperArm: 'Upper arm',
    rightUpperArm: 'Upper arm',
    leftForearm: 'Forearm',
    rightForearm: 'Forearm',
    leftHand: 'Hand',
    rightHand: 'Hand',
    leftThigh: 'Thigh',
    rightThigh: 'Thigh',
    leftKnee: 'Knee',
    rightKnee: 'Knee',
    leftShin: 'Shin',
    rightShin: 'Shin',
    leftFoot: 'Foot',
    rightFoot: 'Foot',
  },
  posterior: {
    head: 'Head',
    neck: 'Neck',
    leftShoulder: 'Shoulder',
    rightShoulder: 'Shoulder',
    torsoUpper: 'Upper back',
    torsoMid: 'Lower back',
    torsoLow: 'Glutes',
    leftUpperArm: 'Upper arm',
    rightUpperArm: 'Upper arm',
    leftForearm: 'Forearm',
    rightForearm: 'Forearm',
    leftHand: 'Hand',
    rightHand: 'Hand',
    leftThigh: 'Hamstring',
    rightThigh: 'Hamstring',
    leftKnee: 'Knee',
    rightKnee: 'Knee',
    leftShin: 'Calf',
    rightShin: 'Calf',
    leftFoot: 'Foot',
    rightFoot: 'Foot',
  },
};

// Semantic region id → the physical segment(s) it carves. Covers anterior + posterior names plus
// the original coarse ids (leftArm/leftLeg/…) so older specs keep working.
const REGION_TO_SEGMENTS: Record<string, string[]> = {
  head: ['head'],
  neck: ['neck'],
  leftShoulder: ['leftShoulder'],
  rightShoulder: ['rightShoulder'],
  shoulders: ['leftShoulder', 'rightShoulder'],
  chest: ['torsoUpper'],
  abdomen: ['torsoMid'],
  hips: ['torsoLow'],
  upperBack: ['torsoUpper'],
  lowerBack: ['torsoMid'],
  glutes: ['torsoLow'],
  back: ['torsoUpper', 'torsoMid'],
  torso: ['torsoUpper', 'torsoMid', 'torsoLow'],
  core: ['torsoMid'],
  leftUpperArm: ['leftUpperArm'],
  rightUpperArm: ['rightUpperArm'],
  leftForearm: ['leftForearm'],
  rightForearm: ['rightForearm'],
  leftHand: ['leftHand'],
  rightHand: ['rightHand'],
  leftArm: ['leftUpperArm', 'leftForearm', 'leftHand'],
  rightArm: ['rightUpperArm', 'rightForearm', 'rightHand'],
  leftThigh: ['leftThigh'],
  rightThigh: ['rightThigh'],
  leftHamstring: ['leftThigh'],
  rightHamstring: ['rightThigh'],
  leftKnee: ['leftKnee'],
  rightKnee: ['rightKnee'],
  leftShin: ['leftShin'],
  rightShin: ['rightShin'],
  leftCalf: ['leftShin'],
  rightCalf: ['rightShin'],
  leftFoot: ['leftFoot'],
  rightFoot: ['rightFoot'],
  leftLeg: ['leftThigh', 'leftKnee', 'leftShin'],
  rightLeg: ['rightThigh', 'rightKnee', 'rightShin'],
};

// When nothing is highlighted, label this representative set (left + centre) so the figure always
// reads as a labelled body rather than a blank silhouette. The right-hand limbs are left unlabelled
// (mirror), the standard anatomy-diagram convention — clean, not cluttered.
const GUIDE_SEGMENTS = [
  'head',
  'neck',
  'leftShoulder',
  'torsoUpper',
  'torsoMid',
  'torsoLow',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'leftThigh',
  'leftKnee',
  'leftShin',
  'leftFoot',
];

function SegmentElement({
  id,
  shape,
  highlighted,
  color,
  salient,
}: {
  id: string;
  shape: SegmentShape;
  highlighted: boolean;
  color: string;
  salient: boolean;
}) {
  // The base figure is always clearly visible (a soft surface tint + a real outline) so the body
  // reads even when the answer highlights nothing; highlighted segments take the region's colour.
  const fill = highlighted ? color : 'color-mix(in oklab, var(--text-secondary) 14%, transparent)';
  const stroke = highlighted ? color : 'var(--line-strong)';
  const strokeWidth = highlighted ? 1.5 : 0.8;
  const shared = {
    'data-id': id,
    fill,
    stroke,
    strokeWidth,
    className: 'bm-region' + (highlighted ? ' bm-region--on' : ''),
    ...(salient ? { 'data-mark': 'circle' as const } : {}),
  };
  if (shape.kind === 'circle')
    return <circle {...shared} cx={shape.cx} cy={shape.cy} r={shape.r} />;
  if (shape.kind === 'ellipse')
    return <ellipse {...shared} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  if (shape.kind === 'polygon') return <polygon {...shared} points={shape.points} />;
  return (
    <rect
      {...shared}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rx={3}
      ry={3}
    />
  );
}

export function BodyMap({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  regions = [],
  side = 'anterior',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const view: 'anterior' | 'posterior' = side === 'posterior' ? 'posterior' : 'anterior';

  // Resolve each region to its segment(s); a segment inherits the colour of the region that lit it.
  const segColor = new Map<string, string>();
  // One label per highlighted region, anchored at its primary (first) segment.
  type Lbl = {
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
    text: string;
    color: string;
    muted: boolean;
  };
  const labels: Lbl[] = [];
  let salientSeg: string | undefined;

  regions.forEach((r: BodyRegion, i) => {
    const segs = REGION_TO_SEGMENTS[r.id];
    if (!segs || !segs.length) return; // unknown id → skip rather than render a phantom
    const color = r.color ?? 'var(--presence)';
    segs.forEach((s) => segColor.set(s, color));
    const primary = SEGMENTS[segs[0]];
    if (i === 0) salientSeg = segs[0];
    if (primary) {
      labels.push({
        x: primary.lx,
        y: primary.ly,
        anchor: primary.labelAnchor,
        text: r.label ?? SEGMENT_LABEL[view][segs[0]] ?? r.id,
        color,
        muted: false,
      });
    }
  });

  // No highlights → draw the always-on guide labels so the body is self-explanatory.
  if (!labels.length) {
    for (const s of GUIDE_SEGMENTS) {
      const shape = SEGMENTS[s];
      const text = SEGMENT_LABEL[view][s];
      if (shape && text) {
        labels.push({
          x: shape.lx,
          y: shape.ly,
          anchor: shape.labelAnchor,
          text,
          color: 'var(--text-muted)',
          muted: true,
        });
      }
    }
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <span className="bm-side-tag">{view === 'posterior' ? 'back' : 'front'}</span>
      </div>

      <div className="bm-layout">
        <div className="bm-svg-wrap" role="img" aria-label={`Human body diagram — ${view} view`}>
          <svg viewBox={`${VB_X} 0 ${VB_W} ${FIG_H}`} className="bm-svg" aria-hidden="true">
            {DRAW_ORDER.map((id) => {
              const shape = SEGMENTS[id];
              if (!shape) return null;
              const color = segColor.get(id);
              return (
                <SegmentElement
                  key={id}
                  id={id}
                  shape={shape}
                  highlighted={color != null}
                  color={color ?? 'var(--presence)'}
                  salient={id === salientSeg}
                />
              );
            })}
            {labels.map((l, i) => (
              <text
                key={i}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                className={'bm-label' + (l.muted ? ' bm-label--muted' : '')}
                fill={l.color}
              >
                {l.text.length > LABEL_MAX_CHARS && <title>{l.text}</title>}
                {truncateLabel(l.text, LABEL_MAX_CHARS)}
              </text>
            ))}
          </svg>
        </div>

        {/* Legend — only the highlighted regions (with their notes). */}
        {regions.length > 0 && (
          <ul className="bm-legend" aria-label="Highlighted regions">
            {regions.map((r, index) => {
              const color = r.color ?? 'var(--presence)';
              const segs = REGION_TO_SEGMENTS[r.id];
              const name =
                r.label ?? (segs?.length ? SEGMENT_LABEL[view][segs[0]] : undefined) ?? r.id;
              return (
                <li key={`${r.id}-${index}`} className="bm-legend-item">
                  <span
                    className="bm-legend-dot"
                    style={{ background: color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className="bm-legend-body">
                    <span className="bm-legend-name">{name}</span>
                    {r.note && <span className="bm-legend-note">{r.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
