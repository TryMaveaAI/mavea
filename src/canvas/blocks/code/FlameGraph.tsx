import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FlameGraphProps, FlameFrame } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FlameGraphProps & { delay?: number };

const BAR_H = 22;
const MAX_FRAMES = 80; // bound the DOM on pathological stacks

interface Placed {
  f: FlameFrame;
  x: number; // left, in value units
  w: number; // width, in value units
}

// Compute x-offsets from a DFS pre-order list: a running stack tracks each open frame's cursor
// (where its next child begins), so a child sits under its parent and siblings tile left→right.
function place(frames: FlameFrame[]): { placed: Placed[]; total: number; maxDepth: number } {
  const placed: Placed[] = [];
  const stack: { depth: number; cursor: number }[] = [];
  let rootCursor = 0;
  let maxDepth = 0;
  for (const f of frames) {
    while (stack.length && stack[stack.length - 1].depth >= f.depth) stack.pop();
    const parent = stack[stack.length - 1];
    const x = parent ? parent.cursor : rootCursor;
    const w = Math.max(0, f.value || 0);
    placed.push({ f, x, w });
    if (parent) parent.cursor += w;
    else rootCursor += w;
    stack.push({ depth: f.depth, cursor: x });
    if (f.depth > maxDepth) maxDepth = f.depth;
  }
  const total = rootCursor || 1;
  return { placed, total, maxDepth };
}

// A flame graph: width encodes time/samples, vertical depth the call stack. Built from a flat
// DFS-ordered frame list (no nested shape needed). Frames use a translucent warm tint over the
// surface so labels stay readable in both themes; the hot path is danger-tinted.
export function FlameGraph({
  title,
  icon = 'layers',
  iconColor = 'var(--warning)',
  frames,
  unit,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const all = (frames ?? []).slice(0, MAX_FRAMES);

  if (all.length === 0) {
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
        <div className="log-empty">No samples</div>
      </div>
    );
  }

  const { placed, total, maxDepth } = place(all);
  const height = (maxDepth + 1) * BAR_H;
  const fmt = (v: number) => `${v}${unit ? ` ${unit}` : ''}`;

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

      <div className="flame" style={{ height }}>
        {placed.map(({ f, x, w }, i) => {
          const leftPct = (x / total) * 100;
          const widthPct = Math.min(100 - leftPct, (w / total) * 100);
          if (widthPct <= 0) return null;
          const pct = Math.round((w / total) * 100);
          return (
            <div
              key={i}
              className={`flame-cell${f.hot ? ' hot' : ''}`}
              style={
                {
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: f.depth * BAR_H,
                  ['--d' as string]: String(f.depth),
                } as CSSProperties
              }
              title={`${f.name} — ${fmt(w)} (${pct}%)`}
              aria-label={`${f.name} — ${fmt(w)} (${pct}%)`}
            >
              <span className="flame-label">{f.name}</span>
            </div>
          );
        })}
      </div>

      <div className="flame-foot">
        <span>
          total {fmt(total)} · {all.length} frames
        </span>
        {placed.some((p) => p.f.hot) && <span className="flame-hot-key">hot path</span>}
      </div>

      {caption && <div className="term-caption">{caption}</div>}
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
