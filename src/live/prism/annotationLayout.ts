import type { HighlightRect } from './extractPdf';

export type { HighlightRect };

export interface AlsoClaim {
  quote: string;
  color: string;
  note?: string;
}

export interface SurfaceGeometry {
  dims: { w: number; h: number };
  rects: HighlightRect[];
  alsoRects: HighlightRect[][];
  figure?: HighlightRect | null;
}

export const NOTE_W = 190;
export const NOTE_GUTTER = NOTE_W + 28;

export interface MarginNoteEntry {
  y: number;
  anchorY: number;
  anchorX: number;
  color: string;
  text: string;
}

export function computeMarginNotes(
  rects: readonly HighlightRect[],
  alsoRects: readonly HighlightRect[][],
  color: string,
  note: string | undefined,
  also: readonly AlsoClaim[] | undefined,
  zoom: number,
): MarginNoteEntry[] {
  const entries: MarginNoteEntry[] = [];
  if (rects.length > 0 && note?.trim()) {
    const rect = rects[0];
    entries.push({
      y: rect.y,
      anchorY: rect.y + rect.h / 2,
      anchorX: rect.x + rect.w,
      color,
      text: note.trim(),
    });
  }
  alsoRects.forEach((rectsForClaim, index) => {
    const claim = also?.[index];
    if (rectsForClaim.length > 0 && claim?.note?.trim()) {
      const rect = rectsForClaim[0];
      entries.push({
        y: rect.y,
        anchorY: rect.y + rect.h / 2,
        anchorX: rect.x + rect.w,
        color: claim.color,
        text: claim.note.trim(),
      });
    }
  });
  entries.sort((a, b) => a.y - b.y);
  const minGap = 86 / (zoom || 1);
  for (let index = 1; index < entries.length; index++) {
    if (entries[index].y < entries[index - 1].y + minGap) {
      entries[index].y = entries[index - 1].y + minGap;
    }
  }
  return entries;
}
