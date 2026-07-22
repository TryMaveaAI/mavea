// briefing/path.ts — the pure, deterministic path-builder for The Briefing. Given the settled map's
// claims, threads, and (optional) veracity verdicts, it composes the flight: open on the single most
// load-bearing claim (graph centrality over the threads), dwell on the real contradictions/tensions,
// then the troubled verdicts, fast-pan a little context, and LAND on the weakest point. Every caption
// is assembled from real titles, verbatim quotes, thread relations, and verdict labels — no new prose,
// so the briefing can only ever say what the document (and its checked verdicts) actually say.
import type { Placed } from '../layout';
import type { Thread, ThreadRelation } from '../types';
import { VERDICT_META, type Verdict } from '../veracity';
import type { BriefingBeat } from './types';

/** Caps so a briefing stays a ~40-60s arc, not an exhaustive tour. */
const MAX_TENSIONS = 4;
const MAX_VERDICTS = 3;
const MAX_CONTEXT = 2;

/** Severity for ranking which trouble is the "weakest point" — a hard contradiction beats a mere
 *  "no source found". (unsupported is honest absence, not a flaw in the document, so it ranks last.) */
const SEVERITY: Record<Verdict, number> = {
  contradicted: 4,
  disputed: 3,
  outdated: 2,
  unsupported: 1,
  holds: 0,
};

const RELATION_VERB: Record<ThreadRelation, string> = {
  contradicts: 'contradicts',
  'in-tension': 'is in tension with',
  agrees: 'agrees with',
};

/** Trim a quote to a readable caption length at a word boundary, with an ellipsis when cut. */
function snippet(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/** Pace a beat to its spoken length so silent reading and (opt-in) narration co-time: ~17 chars/sec
 *  plus a breath, floored so even a short line is readable and capped so a long one doesn't drag. */
function dwellFor(spoken: string): number {
  return Math.max(2600, Math.min(7000, Math.round(spoken.length * 60) + 1200));
}

/** Graph centrality: how many threads touch each claim (the spine is the most-connected load-bearing
 *  claim). */
function degrees(threads: readonly Thread[]): Map<string, number> {
  const deg = new Map<string, number>();
  for (const t of threads) {
    deg.set(t.a, (deg.get(t.a) ?? 0) + 1);
    deg.set(t.b, (deg.get(t.b) ?? 0) + 1);
  }
  return deg;
}

/**
 * Build the briefing flight. Deterministic: the same settled map always produces the same beats. An
 * empty map yields no beats; a map with no tensions and no troubled verdicts still gets an honest open
 * + close ("nothing here contradicts itself — the case rests on this, and it holds").
 */
export function buildBriefing(
  claims: readonly Placed[],
  threads: readonly Thread[],
  verdicts: ReadonlyMap<string, Verdict>,
): BriefingBeat[] {
  if (claims.length === 0) return [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const deg = degrees(threads);
  const beats: BriefingBeat[] = [];
  const shown = new Set<string>();
  let n = 0;
  const push = (
    kind: BriefingBeat['kind'],
    claimIds: string[],
    caption: string,
    spoken: string,
  ) => {
    beats.push({ id: `b${(n += 1)}`, kind, claimIds, caption, spoken, dwellMs: dwellFor(spoken) });
    for (const id of claimIds) shown.add(id);
  };

  // ── open: the single claim the document leans on most ──
  const pool = claims.filter((c) => c.role === 'load-bearing');
  const candidates = pool.length > 0 ? pool : claims;
  const keystone = [...candidates].sort(
    (a, b) =>
      (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.page - b.page || a.id.localeCompare(b.id),
  )[0];
  push(
    'open',
    [keystone.id],
    `The case rests on this — “${snippet(keystone.quote, 96)}” · p.${keystone.page}`,
    `The whole case rests on this, on page ${keystone.page}. ${snippet(keystone.quote, 220)}`,
  );

  // ── tensions: the real contradictions, then softer tensions (hard clashes first) ──
  const order: Record<ThreadRelation, number> = { contradicts: 0, 'in-tension': 1, agrees: 2 };
  const tensionThreads = threads
    .filter((t) => t.relation !== 'agrees' && byId.has(t.a) && byId.has(t.b))
    .sort((x, y) => order[x.relation] - order[y.relation])
    .slice(0, MAX_TENSIONS);
  for (const t of tensionThreads) {
    const a = byId.get(t.a)!;
    const b = byId.get(t.b)!;
    const across = t.crossDoc ? ' (across documents)' : '';
    push(
      'tension',
      [a.id, b.id],
      `p.${a.page}: “${snippet(a.quote, 52)}” — ${RELATION_VERB[t.relation]}${across} — p.${b.page}: “${snippet(b.quote, 52)}”`,
      `On page ${a.page}, the document says ${snippet(a.quote, 140)}. But it ${RELATION_VERB[t.relation]} page ${b.page}: ${snippet(b.quote, 140)}.`,
    );
  }

  // ── verdicts: claims the world troubled, not already shown as a tension ──
  const troubled = claims
    .map((c) => ({ c, v: verdicts.get(c.id) }))
    .filter(
      (x): x is { c: Placed; v: Verdict } => !!x.v && SEVERITY[x.v] >= 2 && !shown.has(x.c.id),
    )
    .sort((x, y) => SEVERITY[y.v] - SEVERITY[x.v] || x.c.page - y.c.page)
    .slice(0, MAX_VERDICTS);
  for (const { c, v } of troubled) {
    const label = VERDICT_META[v].label;
    push(
      'verdict',
      [c.id],
      `${label} — “${snippet(c.quote, 72)}” · p.${c.page}`,
      `The public record marks this ${label.toLowerCase()}: ${snippet(c.quote, 160)}`,
    );
  }

  // ── context: a couple of background/definition claims, fast — only if not already central ──
  const context = claims
    .filter((c) => (c.role === 'context' || c.kind === 'definition') && !shown.has(c.id))
    .sort((a, b) => a.page - b.page)
    .slice(0, MAX_CONTEXT);
  for (const c of context) {
    push(
      'context',
      [c.id],
      `Context — ${snippet(c.title, 64)} · p.${c.page}`,
      `For context: ${c.title}.`,
    );
  }

  // ── close: land on the weakest point ──
  const worst = claims
    .map((c) => ({ c, v: verdicts.get(c.id) }))
    .filter((x): x is { c: Placed; v: Verdict } => !!x.v && SEVERITY[x.v] >= 2)
    .sort((x, y) => SEVERITY[y.v] - SEVERITY[x.v] || x.c.page - y.c.page)[0];
  if (worst) {
    const label = VERDICT_META[worst.v].label;
    push(
      'close',
      [worst.c.id],
      `The weak point — ${label}: “${snippet(worst.c.quote, 68)}” · p.${worst.c.page}`,
      `So the weakest point: the public record marks this ${label.toLowerCase()} — ${snippet(worst.c.quote, 150)}`,
    );
  } else if (tensionThreads.length > 0) {
    const t = tensionThreads[0];
    const a = byId.get(t.a)!;
    const b = byId.get(t.b)!;
    push(
      'close',
      [a.id, b.id],
      `The weak point — the document contradicts itself: p.${a.page} vs p.${b.page}`,
      `And the weakest point is that the document contradicts itself, between page ${a.page} and page ${b.page}.`,
    );
  } else {
    const holds = verdicts.get(keystone.id) === 'holds';
    push(
      'close',
      [keystone.id],
      holds
        ? `Nothing here contradicts itself — the case rests on this one claim, and it holds.`
        : `Nothing here contradicts itself — the whole case rests on this one claim.`,
      holds
        ? `Nothing here contradicts itself. The case rests entirely on that one claim — and the public record backs it.`
        : `Nothing here contradicts itself. The whole case rests on that one claim.`,
    );
  }

  return beats;
}
