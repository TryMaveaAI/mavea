// A Plutchik-style feeling wheel: named emotions as donut wedges around a hub, one ring per
// intensity tier. Every wedge's angular width is COMPUTED from how many segments share its tier
// (an equal division of the circle) and its ring band is computed from that tier — primary sits
// on the wide outer ring, secondary and tertiary nest inward as progressively more specific
// shades of it — the same computed-geometry idea ColorWheel uses for its hue ring, except each
// wedge carries its own color instead of one derived base hue + harmony. Falls back to the 8 core
// Plutchik emotions when the model supplies none, so the wheel is never blank.
import { useId, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AccentVar } from '../../../data/conversation';
import type { EmotionWheelProps, EmotionSegment, EmotionIntensity } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { useHostWidth } from '../../lib/useBoxSize';
import { CX, CY, polar, wedgeLabel, wedgePath, type WedgeLabel } from './wheelGeometry';

type Props = EmotionWheelProps & { delay?: number };

const R_OUT = 44;

// Ring band [inner radius, outer radius] per tier — primary is the wide outer band (matching
// ColorWheel's single ring width), secondary and tertiary nest inward.
const TIER_ORDER: EmotionIntensity[] = ['primary', 'secondary', 'tertiary'];
const TIER_SET = new Set<string>(TIER_ORDER);
const TIER_BAND: Record<EmotionIntensity, [number, number]> = {
  primary: [30, R_OUT],
  secondary: [20, 30],
  tertiary: [12, 20],
};

// A segment's tier, falling back to 'primary' for anything the model sends that isn't one of the
// three known rings (loose JSON coercion validates shape, not enum membership — an unrecognised
// tier name must degrade to the outer ring, not throw on an unindexed bucket).
function tierOf(seg: EmotionSegment): EmotionIntensity {
  return seg.intensity && TIER_SET.has(seg.intensity) ? seg.intensity : 'primary';
}

// The 8 core feelings Plutchik's wheel is built from, in their canonical order — adjacent
// opposites land 180° apart for free once they're evenly spaced (joy/sadness, trust/disgust,
// fear/anger, anticipation/surprise).
const DEFAULT_SEGMENTS: EmotionSegment[] = [
  { label: 'joy' },
  { label: 'trust' },
  { label: 'fear' },
  { label: 'surprise' },
  { label: 'sadness' },
  { label: 'disgust' },
  { label: 'anger' },
  { label: 'anticipation' },
];

// A believable color for each core feeling when the model doesn't supply one, so the default
// wheel reads as intentional rather than an arbitrary cycle.
const KNOWN_COLOR: Record<string, AccentVar> = {
  joy: 'var(--warning)',
  trust: 'var(--insight)',
  fear: 'var(--text-muted)',
  surprise: 'var(--insight-soft)',
  sadness: 'var(--presence-deep)',
  disgust: 'var(--presence)',
  anger: 'var(--danger)',
  anticipation: 'var(--warning-soft)',
};

// Fallback cycle for any label outside the core 8 (a secondary/tertiary dyad the model named,
// e.g. "optimism" or "remorse") so it still lands on a distinct, token-safe color.
const ACCENT_CYCLE: AccentVar[] = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--presence-deep)',
  'var(--insight-soft)',
  'var(--warning-soft)',
  'var(--text-muted)',
  'var(--presence-soft)',
];

function colorFor(seg: EmotionSegment, index: number): AccentVar {
  if (seg.color) return seg.color;
  const known = KNOWN_COLOR[seg.label.trim().toLowerCase()];
  return known ?? ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

// Wedge names are set along the ring's centre line. The largest size reads as a label at the
// wheel's usual ~240px; the floor is the 9px legibility floor converted into viewBox units at the
// figure's MEASURED width, so a wheel squeezed into a narrow card drops labels rather than
// painting them unreadably small (the legend beside it still names every wedge).
const LABEL_FLOOR_PX = 9;
const RENDERED_FALLBACK = 240;

interface Wedge {
  seg: EmotionSegment;
  tier: EmotionIntensity;
  color: AccentVar;
  isHot: boolean;
  mid: number;
  d: string;
  markerR: number;
  label: WedgeLabel | null;
}

export function EmotionWheel({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  segments,
  highlight,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [figRef, figWidth] = useHostWidth<HTMLDivElement>();
  const rendered = Math.min(figWidth || RENDERED_FALLBACK, RENDERED_FALLBACK);
  const minUnits = (LABEL_FLOOR_PX * 100) / rendered;
  const items = segments && segments.length > 0 ? segments : DEFAULT_SEGMENTS;
  const highlightKey = highlight?.trim().toLowerCase();

  // Group by tier (default 'primary'), keeping each item's original position for stable colors.
  const grouped: Record<EmotionIntensity, { seg: EmotionSegment; i: number }[]> = {
    primary: [],
    secondary: [],
    tertiary: [],
  };
  items.forEach((seg, i) => grouped[tierOf(seg)].push({ seg, i }));
  const tiersPresent = TIER_ORDER.filter((t) => grouped[t].length > 0);
  // The hub fills whatever space the innermost rendered ring doesn't use.
  const hubR = tiersPresent.length
    ? TIER_BAND[tiersPresent[tiersPresent.length - 1]][0]
    : TIER_BAND.primary[0];

  const wedges: Wedge[] = tiersPresent.flatMap((tier) => {
    const list = grouped[tier];
    const [rIn, rOut] = TIER_BAND[tier];
    const n = list.length;
    // A lone wedge would otherwise span exactly 360° — a zero-length arc SVG can't draw — so it's
    // trimmed to just under a full turn, leaving a faint seam rather than a broken path.
    const span = n === 1 ? 359.98 : 360 / n;
    return list.map(({ seg, i }, idx) => {
      const center = seg.angle ?? idx * span;
      return {
        seg,
        tier,
        color: colorFor(seg, i),
        isHot: highlightKey != null && seg.label.trim().toLowerCase() === highlightKey,
        mid: center,
        d: wedgePath(center - span / 2, center + span / 2, rIn, rOut),
        markerR: rOut + 4,
        label: wedgeLabel(seg.label, center, span, rIn, rOut, minUnits),
      };
    });
  });

  const hot = wedges.find((w) => w.isHot);
  const hotMarker = hot
    ? { x: polar(hot.mid, hot.markerR)[0], y: polar(hot.mid, hot.markerR)[1], color: hot.color }
    : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="ew-wrap">
        <div className="ew-figbox" ref={figRef}>
          <svg
            viewBox="0 0 100 100"
            className="ew-svg"
            role="img"
            aria-label={title || 'Feeling wheel'}
          >
            {wedges.map((w, k) => (
              <path
                key={k}
                d={w.d}
                fill={w.color}
                className={'ew-wedge m-stagger-item m-scale-in' + (w.isHot ? ' hot' : '')}
                style={{ ['--i' as string]: k } as CSSProperties}
              />
            ))}
            {wedges.map((w, k) =>
              w.label ? (
                <g key={'l' + k} aria-hidden="true">
                  <path id={`${uid}-arc-${k}`} d={w.label.d} fill="none" />
                  <text className="ew-wedge-label" fontSize={w.label.fontSize} dy="0.35em">
                    <textPath href={`#${uid}-arc-${k}`} startOffset="50%" textAnchor="middle">
                      {w.seg.label}
                    </textPath>
                  </text>
                </g>
              ) : null,
            )}
            <circle cx={CX} cy={CY} r={hubR} className="ew-hub" />
            {hotMarker && (
              <circle
                cx={hotMarker.x}
                cy={hotMarker.y}
                r={4}
                className="ew-marker"
                fill={hotMarker.color}
                data-mark="point"
              />
            )}
          </svg>
        </div>

        <div className="ew-list">
          {wedges.map((w, k) => (
            <div
              key={k}
              className={'ew-chip' + (w.isHot ? ' hot' : '') + ' m-stagger-item m-fade-rise'}
              style={{ ['--i' as string]: k } as CSSProperties}
            >
              <span className="ew-chip-sw" style={{ background: w.color }} />
              <span className="ew-chip-body">
                <span className="ew-chip-label">{w.seg.label}</span>
                {w.tier !== 'primary' && <span className="ew-chip-tier">{w.tier}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {caption && <div className="ew-caption">{caption}</div>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
