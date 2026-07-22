// A short, human-readable name for any block — used to label the per-block "ask about this"
// affordance, the pinned-element chips above the Live composer, and the on-screen context the
// model receives. Block props vary widely across the library's 200+ types, so we probe the
// handful of fields that actually carry a heading (title/label/…) and fall back to a friendly
// name for the block kind. Pure and dependency-free so any layer can call it.
import type { Block } from '../data/conversation';

/** Friendly names for the core block kinds, so a label-less block still reads naturally. */
const TYPE_NAMES: Record<string, string> = {
  insight: 'Insight',
  chart: 'Chart',
  breakdown: 'Breakdown',
  timeline: 'Timeline',
  list: 'List',
  compare: 'Comparison',
  ring: 'Stat',
  bars: 'Bar chart',
  stack: 'Stacked bars',
  scatter: 'Scatter plot',
  map: 'Map',
  heat: 'Heatmap',
  flow: 'Flow',
  gallery: 'Gallery',
  donut: 'Donut chart',
  gauge: 'Gauge',
  scoreboard: 'Scoreboard',
  standings: 'Standings',
  pipeline: 'Pipeline',
  kpi: 'KPIs',
  quotes: 'Quote',
  checklist: 'Checklist',
};

/** The fields, in priority order, that tend to hold a block's heading. */
const LABEL_FIELDS = [
  'title',
  'label',
  'heading',
  'name',
  'question',
  'caption',
  'eyebrow',
] as const;

const MAX_LABEL = 80;

/** A block's own heading text if one of the heading fields actually carries it, else null — so
 *  callers can tell a real title apart from the friendly type-name fallback. */
function headingOf(b: Block): string | null {
  const props = (b.props ?? {}) as unknown as Record<string, unknown>;
  for (const field of LABEL_FIELDS) {
    const value = props[field];
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      return text.length > MAX_LABEL ? text.slice(0, MAX_LABEL - 1).trimEnd() + '…' : text;
    }
  }
  return null;
}

/** A concise display name for a block: its own heading if it has one, else a friendly kind name. */
export function blockLabel(b: Block): string {
  return headingOf(b) ?? TYPE_NAMES[b.type] ?? b.type;
}

// Short, punchy kind nouns for the Focus-mode filmstrip eyebrow (a single uppercase word reads
// better there than a sentence-case name). Only the few that want a shorter or friendlier word
// than TYPE_NAMES live here; everything else falls back to TYPE_NAMES, then the raw type.
const KIND_NAMES: Record<string, string> = {
  insight: 'Finding',
  scatter: 'Scatter',
  bars: 'Bars',
  stack: 'Stacked',
  checklist: 'Progress',
};

/** An uppercase kind label for a block — the small eyebrow above a filmstrip thumbnail. */
export function blockKind(b: Block): string {
  return (KIND_NAMES[b.type] ?? TYPE_NAMES[b.type] ?? b.type).toUpperCase();
}

/** The fields, in priority order, that tend to hold a block's one-line body/explanation. */
const BODY_FIELDS = ['summary', 'narrative', 'detail', 'sub', 'caption', 'body', 'text'] as const;

const MAX_BODY = 180;

/** A clause of a block's own body text (whitespace-collapsed, clamped), distinct from `exclude` so we
 *  don't echo the heading back, or null when it carries none. */
function bodyOf(b: Block, exclude: string | null): string | null {
  const props = (b.props ?? {}) as unknown as Record<string, unknown>;
  for (const field of BODY_FIELDS) {
    const value = props[field];
    if (typeof value === 'string' && value.trim() && value.trim() !== exclude) {
      const body = value.trim().replace(/\s+/g, ' ');
      return body.length > MAX_BODY ? body.slice(0, MAX_BODY - 1).trimEnd() + '…' : body;
    }
  }
  return null;
}

/**
 * A short spoken line about a block — its heading, plus a clause of its own body when it has one.
 * Used when the user taps a card in Focus mode so Mavéa actually talks about what they pointed at,
 * the way a friend would. Pure; reads only the block's real props (never invents content).
 */
export function blockNarration(b: Block): string {
  const title = blockLabel(b);
  const body = bodyOf(b, title);
  return body ? `${title}. ${body}` : title;
}

/**
 * Like {@link blockNarration}, but returns null when the block has no real heading AND no body — i.e.
 * when the only thing to say would be a bare type-name ("Chart", "Map"). Focus mode uses this so a
 * tapped content-less card takes the stage silently instead of having Mavéa blurt a lone, confusing
 * noun. A card with a real heading and/or body still gets a natural line. Pure; invents nothing.
 */
export function speakableLine(b: Block): string | null {
  const heading = headingOf(b);
  const body = bodyOf(b, heading);
  if (heading && body) return `${heading}. ${body}`;
  return heading ?? body ?? null;
}
