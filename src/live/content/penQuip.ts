// penQuip.ts — the short line Mavéa scrawls in the margin beside an object.
//
// Not the note card's voice. The note card explains; the margin is where a hand jots the one
// thing worth remembering, in five or six words — "wants ≠ needs. be honest", "boring is the
// strategy". So this reads the block's OWN structure and writes about THAT object: a quip that
// could be about any card is the failure mode (a generic "what would have to change for this to
// stop being true?" beside every object is wallpaper, not a remark).
//
// Everything here is READ, never invented — the same rule notableIn works under. No model call:
// a BYOK reader pays per token, and a scrawl is not worth one. Returns null when the block has
// no structure worth a remark; the margin simply stays clean, which is always allowed.
import type { Block } from '../../data/conversation';

/** The margin is ~150px of handwriting: past this a quip stops reading as a scrawl. */
const MAX = 46;

const fits = (text: string): string | null => (text.length <= MAX ? text : null);

/** Rounded the way a person says a share out loud. */
const pct = (n: number): string => `${Math.round(n)}%`;

/** Trim a label down to something a hand would actually write. */
function shortLabel(value: string | undefined, cap = 22): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > cap) return null;
  return text;
}

/**
 * One handwritten remark for this block, or null. `seed` (the block's position) picks between
 * equally-true phrasings so an answer carrying three lists does not scrawl the same words three
 * times — variety without invention.
 */
export function penQuip(block: Block, seed = 0): string | null {
  const pick = <T>(options: readonly T[]): T => options[seed % options.length];

  switch (block.type) {
    case 'insight': {
      const { stat, delta, conf } = block.props;
      if (delta && stat) return fits(pick([`${delta} is the move`, `read ${stat} with ${delta}`]));
      if (conf && conf !== 'strong' && stat) return fits(`${stat} — worth double-checking`);
      if (stat) return fits(`carry ${stat} forward`);
      return null;
    }

    case 'kpi': {
      const kpis = block.props.kpis;
      if (kpis.length < 2) return null;
      return pick(['which one changes what you do?', 'a scoreboard, not a reason']);
    }

    case 'breakdown': {
      const rows = block.props.rows.filter((r) => Number.isFinite(r.pct));
      if (rows.length < 2) return null;
      const top = rows.reduce((a, b) => (b.pct > a.pct ? b : a));
      const sum = rows.reduce((a, r) => a + r.pct, 0);
      const shareLike = Math.abs(sum - 100) <= 2;
      const name = shortLabel(top.name);
      if (!name) return pick(['the top row carries this', 'watch the leader here']);
      const spread = top.pct - rows.reduce((a, b) => (b.pct < a.pct ? b : a)).pct;
      if (spread < 8) return fits(`near-even — nothing carries it`);
      return fits(shareLike ? `${name} is ${pct(top.pct)} of it` : `${name} leads the field`);
    }

    case 'donut': {
      const rows = block.props.rows.filter((row) => Number.isFinite(row.pct));
      if (rows.length < 2) return null;
      const ordered = [...rows].sort((a, b) => b.pct - a.pct);
      const name = shortLabel(ordered[0]?.label);
      const gap = Math.round((ordered[0]?.pct ?? 0) - (ordered[1]?.pct ?? 0));
      if (!name) return null;
      return fits(gap >= 5 ? `${name} by ${gap} points` : `${name} — but it's close`);
    }

    case 'chart': {
      const { labels, series } = block.props;
      const first = series[0];
      if (!first || first.data.length < 2) return null;
      const start = first.data[0];
      const end = first.data[first.data.length - 1];
      if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return null;
      const move = ((end - start) / Math.abs(start)) * 100;
      const to = shortLabel(labels[labels.length - 1], 12);
      if (Math.abs(move) < 2) return fits(`flat — that IS the finding`);
      const dir = move > 0 ? 'up' : 'down';
      return fits(
        to ? `${dir} ${pct(Math.abs(move))} by ${to}` : `${dir} ${pct(Math.abs(move))} end to end`,
      );
    }

    case 'compare': {
      const { options, criteria } = block.props;
      if (options.length < 2 || criteria.length === 0) return null;
      const wins = options.map((_, i) => criteria.filter((c) => c.cells[i]?.win).length);
      const best = wins.indexOf(Math.max(...wins));
      const top = wins[best];
      if (!top) return null;
      const name = shortLabel(options[best]?.name, 16);
      if (wins.filter((w) => w === top).length > 1) return `no clear winner — split`;
      if (!name) return fits(`one option takes ${top} of ${criteria.length}`);
      return fits(
        top === criteria.length ? `${name} takes every row` : `${name}: ${top}/${criteria.length}`,
      );
    }

    case 'timeline': {
      const events = block.props.events;
      if (events.length < 2) return null;
      return pick([
        `${events.length} steps — which is hardest?`,
        'which handoff is least reversible?',
      ]);
    }

    case 'checks': {
      const failed = block.props.items.filter((i) => i.status === 'fail').length;
      if (failed > 0) return fits(`${failed} failed — start there`);
      const passed = block.props.items.filter((i) => i.status === 'pass').length;
      return passed > 0 ? `all clear — risk sits outside` : null;
    }

    case 'list': {
      const items = block.props.items;
      if (items.length < 3) return null;
      return pick([
        `pick ONE. today.`,
        `${items.length} items — not a ranking`,
        'which do you test first?',
      ]);
    }

    case 'datatable': {
      if (block.props.rows.length < 2) return null;
      return pick(['the receipt — make it reconcile', 'which row moves the answer?']);
    }

    // ── The shapes real answers reach for beyond the core set ───────────────────────────────
    case 'howtosteps': {
      const steps = block.props.steps;
      if (!Array.isArray(steps) || steps.length < 2) return null;
      return pick([`${steps.length} steps — order matters`, 'step one is the commitment']);
    }

    case 'checklist': {
      const rows = block.props.rows;
      if (!Array.isArray(rows) || rows.length < 2) return null;
      return pick([`${rows.length} to clear`, 'do the top one first']);
    }

    case 'maproute': {
      const stops = block.props.waypoints;
      if (!Array.isArray(stops) || stops.length < 2) return null;
      return pick([`${stops.length} stops — mind the gaps`, 'the route is the argument']);
    }

    case 'cohortgrid': {
      const cohorts = block.props.cohorts;
      if (!Array.isArray(cohorts) || cohorts.length < 2) return null;
      return pick(['read DOWN a column, not across', 'the newest row tells the truth']);
    }

    case 'stack': {
      const segments = block.props.segments;
      if (!Array.isArray(segments) || segments.length < 2) return null;
      return pick([
        `${segments.length} parts — where's the bulk?`,
        'the biggest block sets the rest',
      ]);
    }

    case 'gauge': {
      const { value, max = 100 } = block.props;
      if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
      return fits(`${pct((value / max) * 100)} of the dial`);
    }

    default:
      return null;
  }
}

/** Where a scrawl sits relative to the card, in the design's own three positions. */
export type PenSlot = 'left' | 'bottom' | 'top';

export interface PenMark {
  text: string;
  slot: PenSlot;
}

/**
 * A SECOND remark about the same object, from a different angle than `penQuip` — the design
 * scatters two or three marks around a card, and two sentences about the same figure read as a
 * stutter. Null when the block has nothing else honest to say.
 */
function secondRemark(block: Block, seed: number): string | null {
  const pick = <T>(options: readonly T[]): T => options[seed % options.length];
  switch (block.type) {
    case 'insight': {
      const { conf } = block.props;
      return conf && conf !== 'strong'
        ? pick(['a read, not a receipt', 'check this one first'])
        : pick(['carry this one forward', 'this is the anchor']);
    }
    case 'kpi':
      return pick(['each tile needs a driver', 'no relationship stated here']);
    case 'breakdown': {
      const rows = block.props.rows.filter((r) => Number.isFinite(r.pct));
      if (rows.length < 3) return null;
      return pick(['the tail is where slack hides', 'the leader sets the ceiling']);
    }
    case 'chart':
      return pick(['the slope IS the claim', 'ends matter, middles wander']);
    case 'compare':
      return pick(['rows won ≠ right choice', 'which row do you weigh most?']);
    case 'timeline':
      return pick(['order is the argument', 'one slip moves everything']);
    case 'checks':
      return pick(['failures set the next move', 'the score hides the detail']);
    case 'list':
      return pick(['a set, not a ranking', 'order here means nothing']);
    case 'datatable':
      return pick(['every headline traces here', 'the rows are the proof']);
    case 'donut':
      return pick(['shares, not amounts', 'the gap is the point']);
    case 'howtosteps':
      return pick(['skip one and the rest slips', 'where does this usually fail?']);
    case 'checklist':
      return pick(['what is NOT on this list?', 'unticked ≠ unimportant']);
    case 'maproute':
      return pick(['time between stops is the cost', 'the last leg is the tiring one']);
    case 'cohortgrid':
      return pick(['later cohorts, thinner rows', 'the drop shows up in month one']);
    case 'stack':
      return pick(['each layer trusts the one below', 'the seam is where it breaks']);
    default:
      return null;
  }
}

/**
 * Every scrawl around one object, in the design's slots: the structural remark on the left (the
 * one the arrow points with), a second angle below, and — when the object is a claim worth
 * testing — a pressure-test above. Two or three marks is the design's own density; one is a
 * lonely card and four is graffiti over the thing you are trying to read.
 */
export function penMarks(block: Block, seed = 0): PenMark[] {
  const marks: PenMark[] = [];
  const primary = penQuip(block, seed);
  if (primary) marks.push({ text: primary, slot: 'left' });
  const second = secondRemark(block, seed);
  if (second && second !== primary && second.length <= MAX) {
    marks.push({ text: second, slot: 'bottom' });
  }
  // The question only earns the third slot when the card already carries two statements — a
  // question alone beside a bare card is the stock line this file exists to avoid.
  if (marks.length === 2) {
    const props = block.props as { title?: unknown };
    const title = typeof props.title === 'string' ? props.title.trim() : '';
    if (title && title.length <= 24) marks.push({ text: `why “${title}”?`, slot: 'top' });
    else marks.push({ text: 'what breaks this?', slot: 'top' });
  }
  return marks;
}
