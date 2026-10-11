// Which way a delta actually moved. The `deltaDir` fields in this family carry the model's
// judgement of the change (KpiTile's 'down' is "bad", whatever the sign), so an arrow drawn from
// them can point against the number beside it: "↑ −0.6 pts" for a falling churn rate. The arrow
// is a fact about the move, so it is read off the figure's own sign first.

export type Move = 'up' | 'down';

const LEADING_SIGN = /^\s*([+\-−–])/;

/**
 * The direction of a delta: the sign its text leads with, else the trend of its series (last
 * point against first), else the fallback. A delta that is only words ("at this burn") and has
 * no series keeps the fallback.
 */
export function deltaMove(
  text: string | undefined,
  fallback: Move,
  series?: readonly number[],
): Move {
  const sign = text ? LEADING_SIGN.exec(text)?.[1] : undefined;
  if (sign) return sign === '+' ? 'up' : 'down';
  if (series && series.length > 1) {
    const first = series[0];
    const last = series[series.length - 1];
    if (last > first) return 'up';
    if (last < first) return 'down';
  }
  return fallback;
}
