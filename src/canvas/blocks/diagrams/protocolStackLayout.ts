// How the payload label inside the innermost encapsulation box wraps.
import { fitText } from '../../lib/fitText';

export const LBL_FONT_INNER = 5; // px, viewBox units — must track .pst-box-lbl--inner

export const AVG_CHAR_W = 0.62; // bold sans average glyph width as a fraction of font-size

export const PAYLOAD_LINE_H = 1.2;

/** The payload's name, wrapped to its square rather than cut to one line of it: the box is as
 *  tall as it is wide, so "Your request" has two lines of room and was being shown as "Your
 *  requ…". Only a name that overflows every line the square holds is cut, on its last line. */
export function payloadLines(text: string, size: number): { lines: string[]; clipped: boolean } {
  const fs = LBL_FONT_INNER;
  const maxWidth = size * 0.86;
  const room = Math.max(1, Math.floor((size * 0.8) / (fs * PAYLOAD_LINE_H)));
  const { lines } = fitText(text, { maxWidth, fontSize: fs, minFontSize: fs, bold: true });
  if (lines.length <= room) return { lines, clipped: false };
  const kept = lines.slice(0, room);
  const last = kept[room - 1];
  const budget = Math.max(1, Math.floor(maxWidth / (fs * AVG_CHAR_W)) - 1);
  kept[room - 1] = (last.length > budget ? last.slice(0, budget) : last).trimEnd() + '…';
  return { lines: kept, clipped: true };
}
