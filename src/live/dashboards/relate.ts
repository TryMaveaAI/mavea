// dashboards/relate.ts — does a Live turn relate to an existing dashboard? Atlas-style matching:
// an exact topic match first, else meaningful word overlap with the dashboard's title, thesis, and
// metric labels. Conservative on purpose — a weak match returns null, so we never auto-fold an
// unrelated conversation into someone's dashboard. Pure + testable.
import type { Dashboard } from './types';
import { meaningfulTokens } from '../ground/tokens';

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RelateTurn {
  /** The model's semantic domain for this turn (LiveResponse.topic), if any. */
  topic?: string;
  /** The user's words this turn + the answer's title, joined. */
  text: string;
}

/** The dashboard this turn most plausibly extends, or null when nothing matches confidently. */
export function relatedDashboard(dashboards: Dashboard[], turn: RelateTurn): Dashboard | null {
  if (turn.topic) {
    const t = norm(turn.topic);
    const byTopic = dashboards.find((d) => d.topic && norm(d.topic) === t);
    if (byTopic) return byTopic;
  }
  const tt = meaningfulTokens(turn.text);
  if (tt.size === 0) return null;
  let best: Dashboard | null = null;
  let bestScore = 0;
  for (const d of dashboards) {
    const hay = meaningfulTokens(
      [d.title, d.thesis.text, ...d.metrics.map((m) => m.label)].join(' '),
    );
    let overlap = 0;
    for (const w of tt) if (hay.has(w)) overlap++;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = d;
    }
  }
  // Require ≥2 shared meaningful words — one common word is too weak to fold a conversation in.
  return bestScore >= 2 ? best : null;
}
