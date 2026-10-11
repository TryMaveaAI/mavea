// CycleWheel geometry: which side of its disc a stage's label reads from, and how tall the frame
// must be to hold the labels above the top disc and below the bottom one. viewBox units.
import type { CycleStage } from './types';

export const RING_R = 138; // radius the node centres sit on

export const NODE_R = 40; // node disc radius

export const LABEL_GAP = 10; // gap from a disc's rim to where its label starts

const V_PAD = 22; // breathing room above/below the ring

export const LH = 16; // label line height

export const CLH = 14; // caption line height

export const CAP_OFFSET = 15; // first caption baseline below the last label baseline

export const ASCENT = 12; // a label line's height above its baseline

/** Within this of straight up or down, a stage's label goes OUTSIDE the disc rather than beside
 *  it: the connector arcs leave a top or bottom disc sideways, straight through anything set to
 *  its right or left. */
const POLE = 0.85;

export type Side = 'left' | 'right' | 'top' | 'bottom';

interface StageText {
  labelLines: string[];
  capLines: string[];
  /** first label baseline to last caption baseline */
  span: number;
}

export function stageText(stage: CycleStage): StageText {
  const labelLines = wrap(stage.label, 16, 2);
  const capLines = stage.caption ? wrap(stage.caption, 22, 2) : [];
  const span =
    (labelLines.length - 1) * LH + (capLines.length ? CAP_OFFSET + (capLines.length - 1) * CLH : 0);
  return { labelLines, capLines, span };
}

export function sideOf(ang: number): Side {
  const s = Math.sin(ang);
  if (Math.abs(s) >= POLE) return s < 0 ? 'top' : 'bottom';
  return Math.cos(ang) < 0 ? 'left' : 'right';
}

/** The ring centre's height and the frame's, leaving room above the top disc and below the
 *  bottom one for whatever labels sit out there. */
export function frameFor(stages: CycleStage[]): { cy: number; vbh: number } {
  const n = Math.max(1, stages.length);
  let above = 0;
  let below = 0;
  stages.forEach((stage, i) => {
    const side = sideOf(-Math.PI / 2 + (i / n) * Math.PI * 2);
    if (side !== 'top' && side !== 'bottom') return;
    const need = LABEL_GAP + ASCENT + stageText(stage).span + 4;
    if (side === 'top') above = Math.max(above, need);
    else below = Math.max(below, need);
  });
  const cy = V_PAD + above + NODE_R + RING_R;
  return { cy, vbh: cy + RING_R + NODE_R + below + V_PAD };
}

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        truncated = true;
        cur = '';
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length) {
    const li = lines.length - 1;
    let last = lines[li];
    if (last.length > perLine) last = last.slice(0, perLine - 1).trimEnd();
    if (truncated || lines[li].length > perLine) last = last.replace(/[…\s]*$/, '') + '…';
    lines[li] = last;
  }
  return lines.length ? lines : [''];
}
