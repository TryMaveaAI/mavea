// A row's tag is often a severity word, and its colour has to agree with the word. Painting it
// in the row's series colour put "critical" in the calm green the backlog bars use, so a word
// that names a level of alarm takes that level's colour and every other tag keeps the row's.
const ALARM =
  /\b(critical|blocker|blocking|urgent|severe|sev ?[01]|p[01]|overdue|failing|failed|at risk|high risk)\b/i;
const CAUTION = /\b(warning|warn|watch|high|elevated|sev ?2|p2|delayed|stale|degraded)\b/i;

export function tagTone(tag: string, rowColor: string): string {
  if (ALARM.test(tag)) return 'var(--danger)';
  if (CAUTION.test(tag)) return 'var(--warning)';
  return rowColor;
}
