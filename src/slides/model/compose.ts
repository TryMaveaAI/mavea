// Compose a Mavéa answer into a slide deck. This is the presentation analogue of the document
// export's normalize→paginate: it reuses the same archetype `Section[]` (so every block type is
// already covered) and assigns each section to one slide layout, deriving the cover, an optional
// agenda, section dividers between answers, and a closing.
//
// Two invariants the rest of the system relies on:
//   • Real-data-only — every slide is built from real section data; nothing is invented. Empty
//     slots are dropped (a media-less deck simply has no teamGrid/fullBleed slides).
//   • Bounded slides — each layout has a conservative item cap; a section with more items is
//     split across continuation slides ("… (cont.)") so content never overflows the 16:9 frame.
import type { ConversationSpec } from '../../data/conversation';
import type { ExportMeta, Section } from '../../export/model/ExportDoc';
import { buildMeta, normalize } from '../../export/model/normalize';
import type { Slide, SlideDataMap, SlideKind } from './Slide';

/** Per-layout item caps — chosen so a full slide stays comfortably inside 1920×1080. */
const CAP = {
  agenda: 5,
  process: 5,
  roadmap: 5,
  table: 7,
  chart: 8,
  stats: 5,
  team: 4,
  compareRows: 6,
} as const;

/** True when every entry stays a short single line — the condition for a raised item cap. */
const shortAll = (xs: (string | undefined)[], max: number): boolean =>
  xs.every((s) => (s ?? '').length <= max);

type SlideDraft = {
  [K in SlideKind]: { kind: K; data: SlideDataMap[K]; kicker?: string; notes?: string };
}[SlideKind];

const chunk = <T>(xs: T[], size: number): T[][] => {
  if (xs.length <= size) return [xs];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

/** Append a "(cont.)" marker to continuation-slide titles so a split reads as one section. */
const cont = (title: string | undefined, i: number): string | undefined =>
  i === 0 || !title ? title : `${title} (cont.)`;

const firstSentence = (s: string, max = 150): string => {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (stop > 60 ? cut.slice(0, stop + 1) : cut).trim() + (stop > 60 ? '' : '…');
};

// The most a prose slide holds at its smallest type tier — kept conservative so even the densest
// serif skin (Press, the tightest real band at ~765px, plus its drop cap's effective line cost)
// fits. A longer body is split across continuation prose slides so nothing is silently clipped.
const PROSE_MAX = 620;

/**
 * Split an over-long paragraph into chunks that each fit a prose slide. Prefers sentence
 * boundaries; a run with no sentence punctuation (or a single enormous sentence) is hard-split on
 * word boundaries so a chunk can never exceed `max` regardless of how the text is written.
 */
const splitProse = (body: string, max = PROSE_MAX): string[] => {
  const t = body.trim();
  if (t.length <= max) return [t];
  // First break into sentences, then break any still-oversize piece on word boundaries.
  const units: string[] = [];
  for (const piece of t.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [t]) {
    if (piece.length <= max) {
      units.push(piece);
      continue;
    }
    let cur = '';
    for (const word of piece.split(/(\s+)/)) {
      if (cur && (cur + word).length > max) {
        units.push(cur);
        cur = '';
      }
      cur += word;
    }
    if (cur) units.push(cur);
  }
  // Re-pack the units into the fewest chunks that each stay within the budget.
  const out: string[] = [];
  let buf = '';
  for (const u of units) {
    if (buf && (buf + u).length > max) {
      out.push(buf.trim());
      buf = '';
    }
    buf += u;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

/** Map one normalized section to one or more slide drafts. */
function draftsForSection(s: Section): SlideDraft[] {
  switch (s.kind) {
    case 'findingCallout': {
      const d = s.data;
      const kicker = d.num
        ? `Finding ${d.num}${d.conf ? ` · ${d.conf}` : ''}`
        : d.conf
          ? `Finding · ${d.conf}`
          : 'Finding';
      if (d.summary)
        return splitProse(d.summary).map((part, i) => ({
          kind: 'prose' as const,
          kicker: i === 0 ? kicker : `${kicker} (cont.)`,
          data: { heading: i === 0 ? d.title : undefined, body: part },
          notes: i === 0 ? d.summary : undefined,
        }));
      return [{ kind: 'quote', kicker, data: { body: d.title }, notes: d.title }];
    }

    case 'spotlightCard': {
      const d = s.data;
      return [
        {
          kind: 'quote',
          kicker: d.label,
          data: { body: d.title, attribution: d.body },
          notes: d.title,
        },
      ];
    }

    case 'prose': {
      const d = s.data;
      const body = d.body || d.heading || '';
      if (!body) return [];
      if (!d.heading && body.length <= 140) return [{ kind: 'quote', data: { body }, notes: body }];
      return splitProse(body).map((part, i) => ({
        kind: 'prose' as const,
        kicker: i === 0 ? 'Note' : 'Note (cont.)',
        data: { heading: i === 0 ? d.heading : undefined, body: part },
        notes: i === 0 ? (d.heading ?? body) : undefined,
      }));
    }

    case 'metricTiles': {
      const d = s.data;
      if (d.tiles.length === 0) return [];
      if (d.tiles.length > 6) {
        // Too many for a hero+stats slide — show them honestly as a value table.
        return chunk(d.tiles, CAP.table).map((rows, i) => ({
          kind: 'dataTable' as const,
          kicker: 'Metrics',
          data: {
            title: cont(d.heading, i) ?? 'Key metrics',
            columns: ['Metric', 'Value'],
            rows: rows.map((t) => [t.label, t.value]),
          },
        }));
      }
      const [hero, ...rest] = d.tiles;
      return [
        {
          kind: 'keyFigure',
          kicker: d.heading ?? 'Key figure',
          data: {
            value: hero.value,
            unit: hero.label,
            stats: rest.slice(0, CAP.stats).map((t) => ({ label: t.label, value: t.value })),
          },
          notes: `${hero.value} — ${hero.label}`,
        },
      ];
    }

    case 'figureGrid': {
      const d = s.data;
      const bars = d.cells
        .map((c) => ({ label: c.title || c.label || '', pct: c.pct, value: c.value }))
        .filter((b) => b.label);
      if (!bars.length) return [];
      return chunk(bars, CAP.chart).map((part, i) => ({
        kind: 'chart' as const,
        kicker: 'Figure',
        data: { title: cont(d.heading, i), body: i === 0 ? d.caption : undefined, bars: part },
        notes: d.heading ?? d.caption,
      }));
    }

    case 'distributionBars': {
      const d = s.data;
      if (!d.bars.length) return [];
      return chunk(d.bars, CAP.chart).map((part, i) => ({
        kind: 'chart' as const,
        kicker: 'Breakdown',
        data: {
          title: cont(d.heading, i),
          bars: part.map((b) => ({ label: b.label, pct: b.pct, value: b.value })),
          total: i === 0 ? d.total : undefined,
          note: i === 0 ? d.note : undefined,
        },
        notes: d.heading,
      }));
    }

    case 'rankedList': {
      const d = s.data;
      if (!d.items.length) return [];
      // Short one-line entries fit a sixth ruled row without crowding the frame.
      const cap = shortAll(
        d.items.map((it) => it.name),
        48,
      )
        ? 6
        : CAP.agenda;
      return chunk(d.items, cap).map((part, i) => ({
        kind: 'agenda' as const,
        kicker: 'Overview',
        data: {
          title: cont(d.heading, i) ?? 'Overview',
          items: part.map((it) => ({ title: it.name, sub: it.meta })),
        },
        notes: d.heading,
      }));
    }

    case 'ratingMatrix': {
      const d = s.data;
      if (!d.rows.length) return [];
      if (d.columns.length === 2) {
        return chunk(d.rows, CAP.compareRows).map((part, i) => ({
          kind: 'comparison' as const,
          kicker: 'Comparison',
          data: {
            title: cont(d.heading, i),
            columns: d.columns.map((col, ci) => ({
              title: col,
              rows: part.map((r) => ({ label: r.label, value: String(r.values[ci] ?? '') })),
            })),
            note: i === 0 ? d.note : undefined,
          },
          notes: d.heading,
        }));
      }
      const scale =
        d.scale ??
        Math.max(1, ...d.rows.flatMap((r) => r.values.map((v) => (typeof v === 'number' ? v : 0))));
      return chunk(d.rows, CAP.table).map((part, i) => ({
        kind: 'dataTable' as const,
        kicker: 'Matrix',
        data: {
          title: cont(d.heading, i),
          columns: ['', ...d.columns],
          rows: part.map((r) => [r.label, ...r.values.map((v) => String(v))]),
          ratingScale: scale,
          note: i === 0 ? d.note : undefined,
        },
        notes: d.heading,
      }));
    }

    case 'checklist': {
      const d = s.data;
      if (!d.items.length) return [];
      return chunk(d.items, CAP.process).map((part, i) => ({
        kind: 'process' as const,
        kicker: 'Checklist',
        data: {
          title: cont(d.heading, i),
          checks: true,
          steps: part.map((it) => ({ title: it.title, body: it.note, status: it.status })),
        },
        notes: d.heading,
      }));
    }

    case 'verticalTimeline': {
      const d = s.data;
      if (!d.events.length) return [];
      return chunk(d.events, CAP.roadmap).map((part, i) => ({
        kind: 'roadmap' as const,
        kicker: 'Timeline',
        data: {
          title: cont(d.heading, i),
          phases: part.map((e) => ({ marker: e.marker, title: e.title, body: e.body })),
        },
        notes: d.heading,
      }));
    }

    case 'numberedMilestones': {
      const d = s.data;
      if (!d.items.length) return [];
      return chunk(d.items, CAP.process).map((part, i) => ({
        kind: 'process' as const,
        kicker: 'Process',
        data: {
          title: cont(d.heading, i),
          steps: part.map((it) => ({ title: it.title, body: it.body })),
        },
        notes: d.heading,
      }));
    }

    case 'specTable': {
      const d = s.data;
      if (!d.rows.length) return [];
      // A narrow table of short cells carries nine rows at the layout's compact rhythm; anything
      // wordier keeps the conservative cap so no row is ever clipped.
      const compact =
        d.columns.length <= 4 && (d.heading ?? '').length <= 48 && shortAll(d.rows.flat(), 12);
      const cap = compact ? 9 : CAP.table;
      return chunk(d.rows, cap).map((part, i) => ({
        kind: 'dataTable' as const,
        kicker: 'Table',
        data: {
          title: cont(d.heading, i),
          columns: d.columns,
          rows: part,
          note: i === 0 ? d.note : undefined,
        },
        notes: d.heading,
      }));
    }

    case 'figure': {
      // A rich visual is atomic — one slide showing its real component at full fidelity.
      const d = s.data;
      return [
        {
          kind: 'figure' as const,
          kicker: 'Figure',
          data: { block: d.block, embed: d.embed, heading: d.heading, caption: d.caption },
          notes: d.heading ?? d.caption,
        },
      ];
    }

    default:
      return [];
  }
}

/** A short, human title used to build the agenda from real content. */
function slideTitle(s: Slide): string | undefined {
  switch (s.kind) {
    case 'quote':
      return firstSentence(s.data.body, 64);
    case 'prose':
      return s.data.heading ?? firstSentence(s.data.body, 64);
    case 'figure':
      return s.data.heading;
    case 'sectionDivider':
    case 'cover':
    case 'closing':
      return s.data.title;
    default:
      return 'title' in s.data ? s.data.title : undefined;
  }
}

function fmtDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

/**
 * Compose normalized sections + masthead facts into an ordered deck. Pure and DOM-free so it runs
 * identically in a test, the export preview, and Present.
 */
export function composeSlides(sections: Section[], meta: ExportMeta): Slide[] {
  const out: Slide[] = [];
  const push = <K extends SlideKind>(
    kind: K,
    id: string,
    source: number,
    data: SlideDataMap[K],
    extra?: { kicker?: string; notes?: string },
  ): void => {
    out.push({ kind, id, source, data, ...extra } as Slide);
  };

  // Cover — from the first answer's masthead facts.
  push(
    'cover',
    'cover',
    -1,
    { title: meta.title, subtitle: meta.sub, date: fmtDate(meta.generatedAt) },
    { kicker: meta.topic },
  );

  // Content — section dividers at answer boundaries, then one+ slide per section. The running
  // chapter title replaces the generic "Note" eyebrow on prose slides, so every kicker carries a
  // real name from the deck instead of filler.
  const content: Slide[] = [];
  let chapter: string | undefined;
  for (const s of sections) {
    if (s.kind === 'prose' && s.lead && s.source > 0) {
      chapter = s.data.heading || undefined;
      content.push({
        kind: 'sectionDivider',
        id: `div-${s.source}`,
        source: s.source,
        data: {
          number: String(s.source + 1).padStart(2, '0'),
          title: s.data.heading || `Part ${s.source + 1}`,
          subtitle: s.data.body || undefined,
        },
      });
      continue;
    }
    draftsForSection(s).forEach((draft, i) => {
      const label = chapter ?? meta.topic;
      const kicker =
        draft.kind === 'prose' && label && draft.kicker?.startsWith('Note')
          ? draft.kicker.replace(/^Note/, label)
          : draft.kicker;
      content.push({ ...draft, kicker, id: `${s.id}#${i}`, source: s.source } as Slide);
    });
  }

  // Agenda — only when the deck is substantial; built from up to five real, distinct titles.
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const s of content) {
    const t = slideTitle(s);
    if (t && !seen.has(t)) {
      seen.add(t);
      titles.push(t);
    }
    if (titles.length >= 5) break;
  }
  if (content.length >= 5 && titles.length >= 4) {
    push('agenda', 'agenda', -1, { title: 'Agenda', items: titles.map((t) => ({ title: t })) });
  }

  out.push(...content);

  // Closing — provenance only, never filler. A deck should end on its substance, so the old
  // unconditional "Thank you" card is gone; the slide exists solely to attribute sources, and
  // only when there are sources to attribute. It only ever shows the source name (no link on
  // paper/screen-share), so drop the URL here.
  if (meta.sources.length > 0) {
    push('closing', 'closing', -1, {
      title: 'Sources',
      subtitle: meta.sub ?? meta.topic,
      sources: meta.sources.map((s) => s.name),
    });
  }

  return out;
}

/** Convenience: compose straight from selected answers (used by export + Present). */
export function composeDeck(
  specs: ConversationSpec[],
  generatedAt: number,
): { meta: ExportMeta; slides: Slide[] } {
  const meta = buildMeta(specs, generatedAt);
  const slides = composeSlides(normalize(specs), meta);
  return { meta, slides };
}
