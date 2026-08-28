// notableIn.ts — the one thing worth pointing at on a block, derived from the block itself.
//
// The study's first aside condensed a block's own summary, which is why it read as saying nothing:
// the card already said it, usually in the same words. A note has to POINT — name one specific
// thing on this object and say why it is the thing to look at. That is what a person does when
// they explain something, and it is the difference between a caption and a remark.
//
// Everything here is READ, never invented. Each observation is a fact about the structure the
// block already committed to on screen — which option took the most rows, which share dominates,
// how far a series actually moved — so it can always be checked against the object beside it. No
// model call: a BYOK reader pays per token, and an aside is not worth one.
//
// `at` is the on-card text the pen should mark, in the block's own words, so the note and the
// stroke land on the same thing. Null when the block has no structure to read: prose, an image, a
// diagram. Silence is the honest answer there — a remark invented about a paragraph is exactly
// the noise this file exists to replace.
import type { Block } from '../../data/conversation';

export interface Notable {
  /** The remark, in Mavéa's voice. Never contains a figure the block does not itself display. */
  text: string;
  /** A question turns passive reading into a small teaching prompt; every other observation is an
   *  insight the reader can verify directly on the object. */
  kind?: 'insight' | 'caution' | 'question' | 'takeaway';
  /** The exact on-card text to point the pen at, when there is a single thing to point at. */
  at?: string;
}

/** Rounded the way a person says a share out loud — the card carries the precise figure. */
const pct = (n: number): string => `${Math.round(n)}%`;

function firstFigure(text: string | undefined): string | null {
  if (!text) return null;
  return text.match(/(?:[$€£]\s*)?[+-]?\d[\d,.]*(?:\.\d+)?(?:%|[KMBT]?)?/i)?.[0] ?? null;
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

export function notableIn(block: Block): Notable | null {
  switch (block.type) {
    case 'insight': {
      const { stat, delta, summary, conf } = block.props;
      if (!stat && !delta) return null;
      const assumption = firstFigure(summary);
      // A WHOLE-stat figure test, anchored: "$15.1M" is a scenario output, "Pocket Wi-Fi" and
      // "7 Hills Trail" are names — calling a name "a scenario output, not an observed result"
      // is the wrong register on every non-numeric answer.
      const isFigure = (value: string | undefined): boolean =>
        !!value && /^(?:[$€£]\s*)?[+-]?\d[\d,.]*\s*(?:%|[KMBT])?$/i.test(value.trim());
      if (conf && conf !== 'strong') {
        if (!delta && !isFigure(stat)) {
          return {
            text: `${stat} is marked ${conf} — a read to double-check, not a measurement.`,
            kind: 'caution',
            at: stat,
          };
        }
        const dependency =
          delta && assumption
            ? ` The ${delta} move already depends on the ${assumption} assumption beneath it.`
            : delta
              ? ` The ${delta} move is conditional on the assumptions beneath it.`
              : '';
        return {
          text: `${stat ?? delta} is a scenario output, not an observed result.${dependency}`,
          kind: 'caution',
          at: delta ?? stat,
        };
      }
      if (stat && delta) {
        return {
          text: `Read ${stat} together with ${delta}; the change is the decision signal, not the headline alone.`,
          at: delta,
        };
      }
      return {
        text: `${stat ?? delta} is the number this object asks you to carry forward.`,
        at: stat ?? delta,
      };
    }

    case 'compare': {
      const { options, criteria } = block.props;
      if (options.length < 2 || criteria.length === 0) return null;
      // Which option actually took the most rows — the card marks each winning cell, but never
      // adds them up, so the count is genuinely something only the reader-or-Mavéa works out.
      const wins = options.map((_, i) => criteria.filter((c) => c.cells[i]?.win).length);
      const best = wins.indexOf(Math.max(...wins));
      const top = wins[best];
      if (top === 0) return null;
      const name = options[best]?.name;
      if (!name) return null;
      if (top === criteria.length) {
        return { text: `${name} takes every row — nothing else here is close.`, at: name };
      }
      const tied = wins.filter((w) => w === top).length > 1;
      if (tied) {
        return {
          text: `No clear winner — the top options split the rows ${top} apiece.`,
          at: name,
        };
      }
      return {
        text: `${name} takes ${top} of the ${criteria.length} rows. That is the whole case for it.`,
        at: name,
      };
    }

    case 'breakdown': {
      const rows = block.props.rows.filter((r) => Number.isFinite(r.pct));
      if (rows.length < 2) return null;
      const top = rows.reduce((a, b) => (b.pct > a.pct ? b : a));
      const rest = rows.length - 1;
      // pct doubles as bar SCALE on many real answers (longest bar = 100). Share language —
      // "X alone is 62%" — is only honest when the rows genuinely sum to a whole; otherwise
      // say what the bars draw (who leads) and print no fabricated share.
      const sum = rows.reduce((a, r) => a + r.pct, 0);
      const shareLike = Math.abs(sum - 100) <= 2;
      if (shareLike && top.pct >= 50) {
        return {
          text: `${top.name} alone is ${pct(top.pct)} — the other ${rest} together are the minority.`,
          at: top.val || top.name,
        };
      }
      const spread = top.pct - rows.reduce((a, b) => (b.pct < a.pct ? b : a)).pct;
      if (spread < 8) {
        return {
          text: `These are near-evenly split — no single one carries it.`,
          at: top.val || top.name,
        };
      }
      return shareLike
        ? { text: `${top.name} leads at ${pct(top.pct)}.`, at: top.val || top.name }
        : { text: `${top.name} leads the field here.`, at: top.val || top.name };
    }

    case 'chart': {
      const { labels, series } = block.props;
      const first = series[0];
      if (!first || first.data.length < 2 || labels.length < 2) return null;
      const start = first.data[0];
      const end = first.data[first.data.length - 1];
      if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return null;
      const move = ((end - start) / Math.abs(start)) * 100;
      const from = labels[0];
      const to = labels[labels.length - 1];
      if (Math.abs(move) < 2) {
        return { text: `${first.name} is essentially flat from ${from} to ${to}.`, at: to };
      }
      // Stated as a direction and a rounded move — both are properties of the plotted data, so the
      // sentence cannot outrun what the chart itself draws.
      return {
        text: `${first.name} ${move > 0 ? 'rose' : 'fell'} ${pct(Math.abs(move))} between ${from} and ${to}.`,
        at: to,
      };
    }

    case 'kpi': {
      const kpis = block.props.kpis;
      if (kpis.length < 2) return null;
      const lead = kpis[0];
      if (!lead?.label || !lead.val) return null;
      // Word-tiles ("Pocket Wi-Fi", "Easy", "Today") are a checklist, not a scoreboard — the
      // scoreboard framing reads absurd there, so stay silent and let the pressure-test prompt
      // speak. For genuinely numeric grids, ask the question a grid cannot answer about itself.
      if (!kpis.some((k) => /\d/.test(k.val))) return null;
      return {
        text: `Which of these ${kpis.length} actually changes what you do next?`,
        kind: 'question',
        at: lead.val,
      };
    }

    case 'datatable': {
      const footer = plainText(block.props.footer);
      const total = firstFigure(footer);
      if (total) {
        return {
          text: `Treat the table as the receipt: its rows should reconcile to ${total} before the headline earns trust.`,
          kind: 'takeaway',
          at: total,
        };
      }
      if (block.props.rows.length > 1) {
        return {
          text: `${block.props.rows.length} rows support this object. Which one changes the conclusion most?`,
          kind: 'question',
        };
      }
      return null;
    }

    case 'donut': {
      const rows = block.props.rows.filter((row) => Number.isFinite(row.pct));
      if (rows.length < 2) return null;
      const ordered = [...rows].sort((a, b) => b.pct - a.pct);
      const first = ordered[0];
      const second = ordered[1];
      if (!first || !second) return null;
      return {
        text: `${first.label} is ${pct(first.pct)}, ${Math.round(first.pct - second.pct)} points ahead of ${second.label}.`,
        at: first.label,
      };
    }

    case 'gauge': {
      const { value, max = 100, band } = block.props;
      if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
      return {
        text: `${value} is ${pct((value / max) * 100)} of this dial's range${band ? ` and already sits in “${band}”` : ''}. Watch the threshold, not the decoration.`,
        kind: 'insight',
        at: String(value),
      };
    }

    case 'timeline': {
      const events = block.props.events;
      if (events.length < 2) return null;
      const first = events[0];
      const last = events[events.length - 1];
      if (!first || !last) return null;
      return {
        text: `${events.length} steps connect ${first.title} to ${last.title}. Which handoff is least reversible?`,
        kind: 'question',
      };
    }

    case 'checks': {
      const failed = block.props.items.filter((item) => item.status === 'fail').length;
      const passed = block.props.items.filter((item) => item.status === 'pass').length;
      if (failed > 0) {
        return {
          text: `${failed} check${failed === 1 ? '' : 's'} failed while ${passed} passed. The failures, not the score, set the next move.`,
          kind: 'takeaway',
        };
      }
      if (passed > 0) {
        return {
          text: `All ${passed} completed checks pass; the remaining risk sits outside this checklist.`,
          kind: 'takeaway',
        };
      }
      return null;
    }

    case 'list': {
      const items = block.props.items;
      if (items.length < 3) return null;
      return {
        text: `These ${items.length} items are a set, not a ranking. Which one would you test first?`,
        kind: 'question',
      };
    }

    default:
      return null;
  }
}

/** A Study-only prompt for objects with no structural observation or source receipt. It never
 * repeats the block's narration: it turns the object into a question the nearby objects can test. */
export function studyPromptIn(block: Block): Notable {
  const props = block.props;
  const title =
    'title' in props && typeof props.title === 'string' && props.title.trim()
      ? props.title.trim()
      : null;
  return {
    // A title-less block gets the pointer phrasing, never its raw type token in quotes —
    // “What would have to change for "datatable" to stop being true” reads as a bug.
    text: title
      ? `What would have to change for “${title}” to stop being true? Pull a nearby object forward to test it.`
      : 'What would have to change for this to stop being true? Pull a nearby object forward to test it.',
    kind: 'question',
  };
}
