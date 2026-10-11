/** Authored examples for the design studio; no provider data or model calls. */
export const RETENTION = [100, 82, 70, 61, 55, 50, 46, 44, 42] as const;
export const LAUNCH_STEPS = [
  { title: 'Find the signal', detail: 'Interview 12 early customers', day: '01–03', state: 'done' },
  {
    title: 'Build the smallest promise',
    detail: 'One workflow. One measurable win.',
    day: '04–10',
    state: 'active',
  },
  { title: 'Let people in', detail: 'A focused beta with 50 teams', day: '11–17', state: 'next' },
  {
    title: 'Follow what works',
    detail: 'Measure activation, then widen access',
    day: '18–21',
    state: 'next',
  },
] as const;

export function retentionScenario(lift: number): number[] {
  const bounded = Number.isFinite(lift) ? Math.max(0, Math.min(30, lift)) : 0;
  return RETENTION.map((value, week) => Math.min(100, value + bounded * (week / 8) ** 0.6));
}

export function retentionPath(values: readonly number[]): string {
  return values
    .map((value, i) => `${i ? 'L' : 'M'} ${60 + i * 82.5} ${280 - value * 2.2}`)
    .join(' ');
}

export type StudioScene = 'growth' | 'launch';
export type StudioView = 'canvas' | 'compare' | 'connections';

export function exampleForQuestion(question: string): StudioScene | null {
  if (/launch|plan|ship|roadmap|product/i.test(question)) return 'launch';
  if (/growth|retention|onboard|customer|acquisition/i.test(question)) return 'growth';
  return null;
}
