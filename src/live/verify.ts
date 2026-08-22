// verify.ts — accuracy guardrail. Pure consistency checks over a validated
// LiveResponse that catch the mistakes a model actually makes: a "trend" chart
// with one point, a breakdown whose shares don't add up, a chart whose data and
// labels disagree, or an answer that never varies its visualization.
//
// These run on EVERY turn (free, no model call). When they fire, generateLive does
// ONE fast self-correction pass — so clean answers stay instant and only suspect
// ones pay for a repair. This is the speed/accuracy balance: verify cheaply, repair
// only when needed.
// The value import comes from the dependency-free leaf so verify.ts doesn't transitively pin the
// catalog through liveSchema; the type stays a type-only import (erased at build).
import { FRONTIER_BLOCK_TYPES } from '../engine/blockTypes';
import type { LiveResponse } from '../engine/liveSchema';
import type { Block, InsightProps } from '../data/conversation';
import { parseAmount, type ParsedAmount } from './ground/number';
import type { AskComplexity } from './select/complexity';

// parseAmount now lives in the shared spine (ground/number.ts); re-exported here so existing
// importers of verify.ts are unchanged. ParsedAmount is NOT re-exported — nothing ever imported the
// type through this module, and a re-export nobody takes is weight in every graph that walks it.
export { parseAmount };

export interface Issue {
  code: string;
  detail: string;
}

/** Shares can round; only flag a breakdown whose total is clearly not a whole. */
const BREAKDOWN_SUM_TOLERANCE = 12;

/** Two mentions of the same quantity may round; >1% apart is a real contradiction. */
const VALUE_CONFLICT_TOLERANCE = 0.01;

/* ------------------------------------------------------------------ *
 * Fabricated action claims. Mavéa's whole action surface is PROPOSE-then-confirm — an
 * "action" block is a confirm card, and nothing runs until the user taps it — so narration
 * that says the deed is already DONE ("I've sent that email") is a hallucination even when
 * the model correctly proposed the action, and an outright lie when it didn't propose one at
 * all. This is the highest-trust-damage class of mistake the surface can make, so it's
 * checked on every turn, for free.
 * ------------------------------------------------------------------ */

/** Past-tense/completion-verb → base-form map, used to rewrite a false completion claim
 *  ("I've sent the email") into an honest offer ("I can send the email") without a model
 *  round-trip. Deliberately broad — it also catches claims about things Mavéa can't do at all
 *  (a "texted"/"paid" it never performed), not just the connected actions (calendar/GitHub). */
const ACTION_VERB_BASE: Record<string, string> = {
  sent: 'send',
  added: 'add',
  booked: 'book',
  scheduled: 'schedule',
  created: 'create',
  posted: 'post',
  emailed: 'email',
  drafted: 'draft',
  filed: 'file',
  submitted: 'submit',
  updated: 'update',
  deleted: 'delete',
  removed: 'remove',
  cancelled: 'cancel',
  canceled: 'cancel',
  paid: 'pay',
  purchased: 'purchase',
  ordered: 'order',
  messaged: 'message',
  texted: 'text',
  called: 'call',
  notified: 'notify',
  shared: 'share',
  uploaded: 'upload',
  deployed: 'deploy',
  merged: 'merge',
  approved: 'approve',
  confirmed: 'confirm',
  registered: 'register',
  invited: 'invite',
  reserved: 'reserve',
};

/** Matches a first-person, PAST-tense/completion framing only — "I've sent", "I have added",
 *  "I just booked", "I already scheduled" — never a future offer ("I'll send", "I can add") or
 *  a conditional ("I would book"), so an honest offer never gets misflagged. */
const ACTION_COMPLETION_RE = new RegExp(
  `\\bI(?:'ve|\\s+have|\\s+just|\\s+already)\\s+(?:just\\s+|already\\s+)?(${Object.keys(
    ACTION_VERB_BASE,
  ).join('|')})\\b`,
  'i',
);

/** True when `text` claims an action already happened. */
function claimsActionDone(text: string): boolean {
  return ACTION_COMPLETION_RE.test(text);
}

/** The global twin of ACTION_COMPLETION_RE, compiled once. `lastIndex` is reset before each
 *  use so the shared instance is safe across calls. */
const ACTION_COMPLETION_ALL_RE = new RegExp(ACTION_COMPLETION_RE.source, 'gi');

/** Rewrite every false completion claim in `text` into an honest offer, e.g.
 *  "I've sent the email" → "I can send the email". Falls back to leaving the match alone if
 *  the captured verb somehow isn't in the base-form map (defensive; can't happen given the
 *  regex is built from that same map's keys). */
function deClaimActions(text: string): string {
  ACTION_COMPLETION_ALL_RE.lastIndex = 0;
  return text.replace(ACTION_COMPLETION_ALL_RE, (whole, verb: string) => {
    const base = ACTION_VERB_BASE[verb.toLowerCase()];
    return base ? `I can ${base}` : whole;
  });
}

/** The always-on standard dozen (base floor + the frontier cousins). Everything else in the
 *  much larger catalog (see RAW_CATALOG in canvas/blocks/catalog — 400+ components and still
 *  growing) is a "specialized" component — the hand-built-demo visuals the library exists for.
 *  A canvas reaching ONLY into this set is the generic-chatbot floor. */
const STANDARD_TYPES: ReadonlySet<string> = FRONTIER_BLOCK_TYPES;

/** A rich canvas is expected to reach past the staples into the specialized library; below
 *  this block count a short, complete answer can legitimately be all-staples. */
const RICH_CANVAS_MIN = 8;

/** The fewest DISTINCT specialized (non-staple) component types a rich canvas must use before
 *  we treat it as the "same ten components every time" collapse and ask for a rebuild. */
const MIN_SPECIALIZED_TYPES = 3;

/** Distinct specialized (non-standard) block types on the canvas — the visuals that make an
 *  answer look composed for the topic rather than assembled from the generic dozen. `action`
 *  is a tool button, not a data visual, so it never counts toward variety. */
function specializedTypes(blocks: Block[]): Set<string> {
  return new Set(
    blocks.map((b) => b.type as string).filter((t) => !STANDARD_TYPES.has(t) && t !== 'action'),
  );
}

/** The pure-prose staples — cards that render as running text, not a data visualization. A canvas
 *  built ENTIRELY from these is "another wall of text": exactly what Mavéa exists to replace with
 *  something you can SEE. Every other type — chart, compare, timeline, breakdown, ring, kpi, the
 *  bars/stack/donut/gauge family, and the whole specialized library — renders a visual, so a single
 *  one of them clears the floor. `action` is a bare tool button, so it doesn't count as a visual. */
const PROSE_STAPLE_TYPES: ReadonlySet<string> = new Set(['insight', 'list', 'blanks']);

/** Does the canvas carry at least one genuine visual (anything past the prose staples)? */
function hasVisualBlock(blocks: Block[]): boolean {
  return blocks.some((b) => {
    const t = b.type as string;
    return t !== 'action' && !PROSE_STAPLE_TYPES.has(t);
  });
}

/* ------------------------------------------------------------------ *
 * Cross-block numeric consistency. The failure this catches: one canvas
 * says "Future: $1,800" in a kpi and "$1,100" for the same bucket in a
 * donut. Two charts on one screen disagreeing kills trust instantly, so
 * we extract every LABELED ABSOLUTE AMOUNT (never pct shares — those are
 * relative to each block's own whole and legitimately differ) and flag
 * any label whose values disagree across blocks. We never guess which
 * number is right, so this is a HARD issue: the model reconciles it.
 * ------------------------------------------------------------------ */

/** Currency amount embedded in a label, e.g. donut row "Future $1,100" or
 *  ring label "3-month target ($7,500)". Requires a currency symbol and a
 *  single occurrence so prose numbers ("3-month") never match. */
const EMBEDDED_RE = /[$€£]\d{1,3}(?:,\d{3})*(?:\.\d+)?[kKmM]?/g;

/** Case-insensitive, punctuation-free label key; '' when too short to be meaningful. */
function normalizeLabel(s: string): string {
  const key = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return key.length >= 3 && /[a-z]/.test(key) ? key : '';
}

interface LabeledAmount {
  label: string;
  value: number;
  raw: string;
  blockIndex: number;
  blockTitle: string;
}

function blockTitle(b: Block): string {
  const p = b.props as { title?: string; eyebrow?: string };
  return p.title || p.eyebrow || b.type;
}

/** Collect every labeled absolute amount on the canvas (kpi values, breakdown
 *  row amounts, stack segment displays, bar values, amounts embedded in donut
 *  and ring labels). Pct shares are deliberately excluded. */
function extractLabeledAmounts(blocks: Block[]): LabeledAmount[] {
  const out: LabeledAmount[] = [];
  const push = (i: number, b: Block, labelRaw: string, parsed: ParsedAmount | null) => {
    if (!parsed || parsed.kind !== 'amount') return;
    const label = normalizeLabel(labelRaw);
    if (!label) return;
    out.push({
      label,
      value: parsed.value,
      raw: parsed.raw,
      blockIndex: i,
      blockTitle: blockTitle(b),
    });
  };
  // A label that itself carries a currency amount ("Future $1,100") splits into
  // label text + value; only one embedded amount is trusted.
  const pushEmbedded = (i: number, b: Block, labelRaw: string) => {
    const hits = labelRaw.match(EMBEDDED_RE);
    if (hits?.length !== 1) return;
    push(i, b, labelRaw.replace(hits[0], ' '), parseAmount(hits[0]));
  };

  blocks.forEach((b, i) => {
    if (b.type === 'kpi') for (const k of b.props.kpis) push(i, b, k.label, parseAmount(k.val));
    if (b.type === 'breakdown')
      for (const row of b.props.rows) push(i, b, row.name, parseAmount(row.val));
    if (b.type === 'stack')
      for (const s of b.props.segments) {
        push(i, b, s.label, parseAmount(s.display));
        pushEmbedded(i, b, s.label);
      }
    if (b.type === 'bars' && !(b.props.unit ?? '').includes('%'))
      for (const bar of b.props.bars)
        push(i, b, bar.label, { value: bar.value, kind: 'amount', raw: String(bar.value) });
    if (b.type === 'donut') for (const row of b.props.rows) pushEmbedded(i, b, row.label);
    if (b.type === 'ring')
      for (const ring of b.props.rings) {
        push(i, b, ring.label, parseAmount(ring.display));
        pushEmbedded(i, b, ring.label);
      }
  });
  return out;
}

function relDiff(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base === 0 ? 0 : Math.abs(a - b) / base;
}

/** One issue per label whose amounts contradict each other ACROSS blocks (>1% apart). */
function checkValueConflicts(blocks: Block[]): Issue[] {
  const byLabel = new Map<string, LabeledAmount[]>();
  for (const v of extractLabeledAmounts(blocks)) {
    const list = byLabel.get(v.label) ?? [];
    list.push(v);
    byLabel.set(v.label, list);
  }
  const issues: Issue[] = [];
  for (const [label, vals] of byLabel) {
    let conflict: [LabeledAmount, LabeledAmount] | null = null;
    for (let i = 0; i < vals.length && !conflict; i++)
      for (let j = i + 1; j < vals.length; j++)
        if (
          vals[i].blockIndex !== vals[j].blockIndex &&
          relDiff(vals[i].value, vals[j].value) > VALUE_CONFLICT_TOLERANCE
        ) {
          conflict = [vals[i], vals[j]];
          break;
        }
    if (conflict) {
      const [a, b] = conflict;
      issues.push({
        code: 'value-conflict',
        detail: `"${label}" is ${a.raw} in "${a.blockTitle}" but ${b.raw} in "${b.blockTitle}" — the same quantity must show the SAME number in every block. Reconcile the whole canvas (and the narration's direction words) to ONE consistent set of figures.`,
      });
    }
  }
  return issues;
}

/** Detect data-shape ↔ block-type mismatches and degenerate visuals. Pure.
 *
 *  `complexity` sizes the sparsity floor: a 'brief' ask (the user explicitly asked to keep
 *  it short) is exempt from `too-sparse` down to a single block — otherwise this HARD issue
 *  routes every genuinely brief answer through a repair round-trip whose only effect is to
 *  pad it back up, undoing the brevity the user asked for. Every other complexity keeps the
 *  existing 3-block floor. */
export function checkConsistency(r: LiveResponse, complexity: AskComplexity = 'rich'): Issue[] {
  const issues: Issue[] = [];

  for (const b of r.blocks) {
    if (b.type === 'breakdown') {
      const rows = b.props.rows;
      if (rows.length >= 2) {
        const sum = rows.reduce((a, row) => a + row.pct, 0);
        if (Math.abs(sum - 100) > BREAKDOWN_SUM_TOLERANCE) {
          issues.push({
            code: 'breakdown-sum',
            detail: `breakdown "${b.props.title}" shares sum to ${Math.round(sum)}, not ~100 — fix the pct values so they add up.`,
          });
        }
      }
    }

    if (b.type === 'chart') {
      const labelCount = b.props.labels.length;
      for (const s of b.props.series) {
        if (s.data.length < 2) {
          issues.push({
            code: 'chart-too-short',
            detail: `chart "${b.props.title}" series "${s.name}" has fewer than 2 points — a chart is for a trend over time; use insight, kpi, or breakdown for a single value.`,
          });
        }
        if (s.data.length !== labelCount) {
          issues.push({
            code: 'chart-len-mismatch',
            detail: `chart "${b.props.title}" series "${s.name}" has ${s.data.length} data points but ${labelCount} labels — they must match 1:1.`,
          });
        }
      }
    }

    // Donut shares are parts of a whole, same contract as breakdown: ~100.
    if (b.type === 'donut') {
      const rows = b.props.rows;
      if (rows.length >= 2) {
        const sum = rows.reduce((a, row) => a + row.pct, 0);
        if (Math.abs(sum - 100) > BREAKDOWN_SUM_TOLERANCE) {
          issues.push({
            code: 'donut-sum',
            detail: `donut "${b.props.title}" shares sum to ${Math.round(sum)}, not ~100 — fix the pct values so they add up.`,
          });
        }
      }
    }

    // A stack states its own total — the segments must actually sum to it. We can't
    // know whether the total or a segment is wrong, so this is a HARD issue.
    if (b.type === 'stack' && b.props.total) {
      const total = parseAmount(b.props.total);
      const segs = b.props.segments;
      if (total && total.value > 0 && segs.length >= 2) {
        const displays = segs.map((s) => parseAmount(s.display));
        const usingDisplays = displays.every((d) => d && d.kind === total.kind);
        const sum = usingDisplays
          ? displays.reduce((a, d) => a + (d?.value ?? 0), 0)
          : segs.reduce((a, s) => a + s.value, 0);
        // Raw segment values that sum to ~100 against a non-100 total are pct-style
        // shares (a legitimate encoding), not a mismatch.
        const pctStyle =
          !usingDisplays && Math.abs(sum - 100) <= 2 && Math.abs(total.value - 100) > 2;
        if (!pctStyle && relDiff(sum, total.value) > VALUE_CONFLICT_TOLERANCE) {
          issues.push({
            code: 'stack-sum',
            detail: `stack "${b.props.title}" states total ${total.raw} but its segments sum to ${sum} — the parts must add up to the stated total exactly; correct whichever figures are wrong.`,
          });
        }
      }
    }

    if (b.type === 'compare') {
      if (b.props.options.length < 2) {
        issues.push({
          code: 'compare-too-few',
          detail: `compare "${b.props.eyebrow ?? ''}" needs at least 2 options.`,
        });
      }
    }
  }

  // Sparsity: a one-card canvas is a degenerate answer — it renders as a lone block
  // floating in a grid built for a spread (the "one element, looks odd" failure). autoFix
  // has already framed a lone NON-insight with an opener by here, so a surviving single
  // block is a bare insight (or a truncation that salvaged one block). Flag it HARD so the
  // repair pass asks the model for a fuller, complete answer — autoFix can't invent the
  // missing content under the real-data rule, so only a re-ask fixes it.
  const sparseFloor = complexity === 'brief' ? 1 : 3;
  if (r.blocks.length < sparseFloor) {
    issues.push({
      code: 'too-sparse',
      detail: `the canvas has only ${r.blocks.length} block${r.blocks.length === 1 ? '' : 's'} — that's too sparse. Produce a fuller answer: at least ${sparseFloor} complementary blocks covering the question (the direct answer plus context and a related visual), never fewer than ${sparseFloor} card${sparseFloor === 1 ? '' : 's'}.`,
    });
  }

  // Fabricated action claim: narration says a real-world deed is DONE ("I've sent the
  // email") but this turn never actually proposed the matching "action" block — the model
  // narrated a completion that never happened. autoFix rewrites this deterministically
  // (see below), so it's not a HARD issue; it's reported here so the fix is observable and
  // covered whenever checkConsistency runs on a response autoFix hasn't touched yet.
  if (
    claimsActionDone(r.narration) &&
    !r.blocks.some((b) => (b as { type: string }).type === 'action')
  ) {
    issues.push({
      code: 'fabricated-action-claim',
      detail: `narration claims an action is already done ("${r.narration}") but no "action" block was proposed this turn — rewrite it as an offer ("I can …"), never a completed deed, unless you actually include the matching action block.`,
    });
  }

  // Cross-block contradictions: the same labeled quantity carrying different
  // values in different blocks (the "two charts disagree" failure).
  issues.push(...checkValueConflicts(r.blocks));

  // Variety: if there are multiple blocks but they're all the same type, the answer
  // is probably under-using the canvas.
  const types = r.blocks.map((b) => b.type);
  if (types.length > 1 && new Set(types).size === 1) {
    issues.push({
      code: 'no-variety',
      detail: `all ${types.length} blocks are "${types[0]}" — vary the visualization where it fits.`,
    });
  }

  // Specialization floor: a full canvas built ENTIRELY from the common staples is the
  // "same ten components every time" collapse — the library has 200+ specialized visuals and a
  // rich answer should reach them, the way a hand-built demo does. We count DISTINCT specialized
  // types and flag a rich canvas that uses too few, so the repair pass rebuilds it around the
  // hero components the turn actually offered. Only fires on a genuinely large canvas, so a short,
  // complete answer is never padded with exotic blocks it doesn't need. HARD (see HARD_ISSUE_CODES):
  // code can't add a fitting specialized component under the real-data rule — only the model can.
  if (r.blocks.length >= RICH_CANVAS_MIN) {
    const specialized = specializedTypes(r.blocks);
    if (specialized.size < MIN_SPECIALIZED_TYPES) {
      issues.push({
        code: 'low-variety',
        detail: `this ${r.blocks.length}-block canvas uses only ${specialized.size} specialized component${specialized.size === 1 ? '' : 's'} — the rest are the common staples every chatbot falls back to. Rebuild it AROUND the specialized HERO components offered for this question (keep the common types as connective tissue only), so the canvas looks designed for THIS topic. Use real data only — if a component would require inventing figures, choose a different one that fits.`,
      });
    }
  }

  // Visual-presence floor: independent of the RICH_CANVAS_MIN gate above. Mavéa's whole promise is
  // "see what it means", not another wall of text — yet a valid answer can still land as nothing but
  // prose cards (insight/list/blanks) with no chart, comparison, timeline, or diagram to SEE. That
  // reads as a broken/generic reply even when the words are right, and it's the common shape of a
  // small or slow-model turn (capped below the 8-block floor, so low-variety never catches it). Flag
  // it HARD so the repair pass rebuilds around a fitting visual hero. Brief asks are exempt: a couple
  // of text cards is a complete answer to a quick factual question. autoFix can't invent a real-data
  // visual, so — like low-variety — only the model can fix this.
  if (complexity !== 'brief' && r.blocks.length >= 2 && !hasVisualBlock(r.blocks)) {
    issues.push({
      code: 'no-visual',
      detail: `this ${r.blocks.length}-block answer is all text cards (${r.blocks.map((b) => (b as { type: string }).type).join(', ')}) — there is nothing to SEE. Mavéa answers by SHOWING, not by writing paragraphs. Rebuild it around at least ONE fitting VISUAL that carries the point — a chart over time, a comparison, a timeline, a breakdown, a gauge/ring, or a specialized component offered for this question — and keep the text only as support. Use real data only: if a visual would require inventing figures, structure what you DO know (e.g. a compare of the real options, or a breakdown of the real parts) rather than a fabricated chart.`,
    });
  }

  return issues;
}

/**
 * Issues a model CANNOT be cheaply replaced on — they signal a genuinely wrong
 * choice (a "trend" with one point, a comparison with one option, a lone single-card
 * canvas) that needs the model to rethink. Numeric contradictions are here too:
 * code cannot know WHICH of two disagreeing numbers is right, and silently
 * mutating data would be worse than the bug, so only the model can reconcile.
 * Everything else is fixed for free by autoFix below, so we only ever spend a
 * second model call on these.
 */
export const HARD_ISSUE_CODES = new Set<string>([
  'chart-too-short',
  'compare-too-few',
  'too-sparse',
  'value-conflict',
  'stack-sum',
  // The staple-collapse: only the model can swap in a fitting specialized component (autoFix
  // can't invent one under the real-data rule), so a re-ask is the only fix.
  'low-variety',
  // All-prose canvas (no chart/comparison/diagram at all): same deal — only the model can add a
  // real-data visual, so re-ask rather than ship a wall of text.
  'no-visual',
]);

export function hasHardIssue(issues: Issue[]): boolean {
  return issues.some((i) => HARD_ISSUE_CODES.has(i.code));
}

/**
 * Deterministic, zero-cost repair of the COMMON, mechanical issues — no model
 * call. Normalizes breakdown shares to 100 and aligns chart series/labels lengths.
 * This is the "be smart, save calls" layer: it clears most checkConsistency hits
 * without a round-trip, leaving only the rare semantic ones (HARD_ISSUE_CODES) for
 * the model. Pure.
 */
export function autoFix(r: LiveResponse): LiveResponse {
  const blocks = r.blocks.map((b): LiveResponse['blocks'][number] => {
    if (b.type === 'breakdown') {
      const rows = b.props.rows;
      const sum = rows.reduce((a, x) => a + x.pct, 0);
      if (rows.length >= 2 && sum > 0 && Math.abs(sum - 100) > BREAKDOWN_SUM_TOLERANCE) {
        const rounded = rows.map((x) => ({ ...x, pct: Math.round((x.pct / sum) * 100) }));
        // push any rounding drift onto the largest row so the total is exactly 100
        const drift = 100 - rounded.reduce((a, x) => a + x.pct, 0);
        if (drift !== 0) {
          let maxI = 0;
          for (let i = 1; i < rounded.length; i++) if (rounded[i].pct > rounded[maxI].pct) maxI = i;
          rounded[maxI] = { ...rounded[maxI], pct: rounded[maxI].pct + drift };
        }
        return { ...b, props: { ...b.props, rows: rounded } };
      }
    }
    // Donut shares: same mechanical normalization as breakdown (parts of a whole → 100).
    if (b.type === 'donut') {
      const rows = b.props.rows;
      const sum = rows.reduce((a, x) => a + x.pct, 0);
      if (rows.length >= 2 && sum > 0 && Math.abs(sum - 100) > BREAKDOWN_SUM_TOLERANCE) {
        const rounded = rows.map((x) => ({ ...x, pct: Math.round((x.pct / sum) * 100) }));
        const drift = 100 - rounded.reduce((a, x) => a + x.pct, 0);
        if (drift !== 0) {
          let maxI = 0;
          for (let i = 1; i < rounded.length; i++) if (rounded[i].pct > rounded[maxI].pct) maxI = i;
          rounded[maxI] = { ...rounded[maxI], pct: rounded[maxI].pct + drift };
        }
        return { ...b, props: { ...b.props, rows: rounded } };
      }
    }
    if (b.type === 'chart') {
      const maxData = Math.max(0, ...b.props.series.map((s) => s.data.length));
      const target = Math.min(b.props.labels.length || maxData, maxData);
      if (target > 0) {
        const labels =
          b.props.labels.length > target ? b.props.labels.slice(0, target) : b.props.labels;
        const series = b.props.series.map((s) =>
          s.data.length > target ? { ...s, data: s.data.slice(0, target) } : s,
        );
        return { ...b, props: { ...b.props, labels, series } };
      }
    }
    return b;
  });

  // Fabricated action claim: rewrite it into an honest offer, for free, whenever narration
  // claims a deed is done but no matching "action" block was actually proposed this turn (see
  // claimsActionDone/deClaimActions above). The voice twin gets the same treatment so the
  // spoken line never says something the screen doesn't.
  const hasActionBlock = blocks.some((b) => (b as { type: string }).type === 'action');
  const narration =
    !hasActionBlock && claimsActionDone(r.narration) ? deClaimActions(r.narration) : r.narration;
  const spoken =
    r.spoken && !hasActionBlock && claimsActionDone(r.spoken) ? deClaimActions(r.spoken) : r.spoken;
  const declaimed: LiveResponse = { ...r, narration, ...(spoken ? { spoken } : {}) };

  // Ensure a framing card: a lone NON-insight block (a bare compare / list /
  // timeline) gets a short insight prepended, so every answer opens with a
  // headline. Zero model calls — this fixes weaker models that return just the
  // main visual instead of the framing + visual Mavéa wants.
  if (blocks.length === 1 && blocks[0].type !== 'insight') {
    const props: InsightProps = { title: r.title || "Here's what I found", conf: 'inferred' };
    const summary = r.sub || narration;
    if (summary) props.summary = summary;
    const framing: Block = { type: 'insight', col: 4, delay: 0, id: 'live-1', num: '1', props };
    return { ...declaimed, blocks: [framing, ...blocks] };
  }

  return { ...declaimed, blocks };
}

/** The user-turn instruction for a single self-correction pass. When the canvas collapsed to
 *  the staples (`low-variety`), `unusedHeroes` names the specialized components the turn offered
 *  but the model skipped, so the rebuild has concrete targets instead of a vague "vary it". */
export function repairInstruction(issues: Issue[], unusedHeroes: readonly string[] = []): string {
  const lines = ['Your previous answer had these problems:', ...issues.map((i) => `- ${i.detail}`)];
  if (
    issues.some((i) => i.code === 'low-variety' || i.code === 'no-visual') &&
    unusedHeroes.length
  ) {
    lines.push(
      `Reach for the specialized components you were offered but did not use — e.g. ${unusedHeroes.join(', ')} — wherever one presents the real data more clearly than a plain block. Add only the ones that genuinely FIT this answer's content; never force a component that doesn't fit just to raise the count.`,
    );
  }
  lines.push(
    'Return a corrected single JSON object (same schema, same narration) that fixes ALL of them. Keep everything that was already good.',
  );
  return lines.join('\n');
}

/**
 * The recovery re-ask: fired when the first pass produced nothing usable (or far too few blocks)
 * for an ask that deserves a full canvas — the failure that collapses a substantive question to a
 * single "Here's what I can say" text card. Unlike repairInstruction (which fixes a listed defect),
 * this re-asks for the WHOLE answer with a firm block floor, so a weak model that under-delivered or
 * emitted unparseable/truncated JSON gets ONE concrete second chance before we degrade to text.
 * `floor` is the minimum block count the ask warrants.
 */
export function recoverInstruction(ask: string, floor: number): string {
  return [
    'Your previous answer did not render — it produced no usable visual blocks.',
    `Answer the question again, in full, as a COMPLETE visual canvas of at least ${floor} blocks.`,
    `Lead with one "insight" giving the direct answer, then add ${Math.max(1, floor - 1)}+ complementary blocks (a list, comparison, timeline, chart, diagram, code, etc.) that fully cover it.`,
    'Use REAL data you are confident about. For a teaching or explanatory answer, well-established facts and definitions are knowledge you HAVE — do not hedge them: omit "conf", or set the lead insight "conf":"strong", never "inferred".',
    'Return ONE valid JSON object in the documented schema. Every block MUST have a "type" and its required props filled. Do not truncate.',
    `Question: ${ask}`,
  ].join('\n');
}
