// insights.ts — the atlas's "Mavéa noticed" panel, derived purely from the real record set. The
// mockup shows three kinds of insight: an OPEN LOOP (something you left unresolved), a CONNECTION
// (two parts of your life that move together), and a PATTERN (a question you keep circling). Every
// one here is grounded in actual records — counts, dates, and the user's own words. If the data
// doesn't support an insight, we don't show it: the panel is honest or empty, never invented.
import type { AtlasRecord } from './store';
import type { Neighborhood } from './neighborhoods';
import { connectionArcs } from './connections';
import type { HoodPlace } from './flight';
import { salientTerms } from './neighborhoods';

export type InsightKind = 'open-loop' | 'connection' | 'pattern';

export interface AtlasInsight {
  kind: InsightKind;
  kindLabel: string;
  /** The insight sentence, built from real records. */
  text: string;
  /** Call-to-action verb. */
  cta: string;
  /** Accent token for the dot/kind/cta. */
  color: string;
  /** The neighborhood this insight belongs to (-1 if none) — clicking flies there. */
  hoodIndex: number;
  /** For an open loop: the record to re-open. */
  recordId?: string;
}

const DAY = 86_400_000;

/** Records whose ask is decision/question-shaped — the ones that tend to leave loops open. */
function looksUnresolved(r: AtlasRecord): boolean {
  const s = (r.title + ' ' + r.question).toLowerCase();
  return /\b(should i|should we|decide|whether|or not|do i|is it worth|worth it|the offer|\?)\b/.test(
    s,
  );
}

/** A short, human fragment of a record's subject for an insight sentence. */
function subject(r: AtlasRecord): string {
  const s = (r.title || r.question).trim().replace(/\s+/g, ' ');
  return s.length > 38 ? s.slice(0, 37).trimEnd() + '…' : s;
}

/**
 * Build the "Mavéa noticed" insights, newest-and-most-relevant first, capped at three so the panel
 * stays calm. `lastOpen` is the previous atlas-open timestamp (insights about the gap since then
 * read as "while you were away").
 */
export function buildInsights(
  hoods: readonly Neighborhood[],
  places: readonly HoodPlace[],
  records: readonly AtlasRecord[],
  lastOpen: number,
): AtlasInsight[] {
  const out: AtlasInsight[] = [];
  const now = Date.now();

  const hoodOf = (id: string): number => hoods.findIndex((h) => h.records.some((r) => r.id === id));

  // 1) OPEN LOOP — the oldest still-unresolved decision question, surfaced if it's been a while.
  const unresolved = records.filter(looksUnresolved).sort((a, b) => a.savedAt - b.savedAt)[0];
  if (unresolved) {
    const days = Math.floor((now - unresolved.savedAt) / DAY);
    out.push({
      kind: 'open-loop',
      kindLabel: 'OPEN LOOP',
      text:
        days >= 1
          ? `${subject(unresolved)} — you left this open ${days === 1 ? 'a day' : `${days} days`} ago, still unsettled.`
          : `${subject(unresolved)} — still open from today.`,
      cta: 'Reopen it',
      color: 'var(--warning)',
      hoodIndex: hoodOf(unresolved.id),
      recordId: unresolved.id,
    });
  }

  // 2) CONNECTION — a real cross-life co-occurrence (same engine the galaxy arc uses; the layout
  // is passed in rather than recomputed here since the caller already has it from the galaxy render).
  const conn = connectionArcs(hoods, places)[0];
  if (conn) {
    const an = hoods[conn.a].name.charAt(0) + hoods[conn.a].name.slice(1).toLowerCase();
    const bn = hoods[conn.b].name.charAt(0) + hoods[conn.b].name.slice(1).toLowerCase();
    out.push({
      kind: 'connection',
      kindLabel: 'CONNECTION',
      text: `Your ${an} and ${bn} nights ${conn.label}.`,
      cta: 'Show the link',
      color: 'var(--presence)',
      hoodIndex: conn.a,
    });
  }

  // 3) PATTERN — a salient subject word that recurs across the most conversations (a thing you
  //    keep circling). Only count it a pattern at 3+ occurrences, so it's real, not noise.
  const termCount = new Map<string, { n: number; ids: string[] }>();
  for (const r of records) {
    for (const t of new Set(salientTerms(r))) {
      const e = termCount.get(t) ?? { n: 0, ids: [] };
      e.n += 1;
      e.ids.push(r.id);
      termCount.set(t, e);
    }
  }
  let topTerm: { term: string; n: number; ids: string[] } | null = null;
  for (const [term, e] of termCount) {
    if (e.n >= 3 && (!topTerm || e.n > topTerm.n)) topTerm = { term, n: e.n, ids: e.ids };
  }
  if (topTerm) {
    const hoodIdx = hoodOf(topTerm.ids[0]);
    const hoodName =
      hoodIdx >= 0
        ? hoods[hoodIdx].name.charAt(0) + hoods[hoodIdx].name.slice(1).toLowerCase()
        : '';
    out.push({
      kind: 'pattern',
      kindLabel: 'PATTERN',
      text: `You've circled “${topTerm.term}” ${topTerm.n} times${hoodName ? ` across ${hoodName}` : ''}.`,
      cta: hoodName ? `Go to ${hoodName}` : 'Explore it',
      color: 'var(--insight)',
      hoodIndex: hoodIdx,
    });
  }

  // Mark insights that happened entirely "while you were away" — purely cosmetic; the sub-label in
  // the header already says it, so we don't duplicate per-item. (lastOpen kept for future per-item use.)
  void lastOpen;

  return out.slice(0, 3);
}
