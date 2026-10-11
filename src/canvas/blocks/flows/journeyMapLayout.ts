// Where the journey map's emotion curve sits, in the 0..100 box its SVG and dots share.

/** The emotion scale a stage is scored on. */
const EMOTION_MAX = 2;

/** Each stage's point: centred under its own column, and high for a good moment. The row spans
 *  every stage column and the columns are equal tracks (`minmax(120px, 1fr)` each), so column
 *  `i` is centred at `(i + 0.5) / n` of the row. Spreading the points edge to edge instead put
 *  the first and last dots under the cell borders and the middle ones drifting between. */
export function emotionPoints(emotions: readonly number[]): { x: number; y: number }[] {
  const n = emotions.length;
  return emotions.map((e, i) => {
    const score = Number.isFinite(e) ? Math.max(-EMOTION_MAX, Math.min(EMOTION_MAX, e)) : 0;
    return { x: ((i + 0.5) / n) * 100, y: 50 - (score / EMOTION_MAX) * 40 };
  });
}
