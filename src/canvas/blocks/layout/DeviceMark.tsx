// DeviceMark.tsx — a text passage with rhetorical/literary devices highlighted.
// Each annotated phrase is wrapped in a styled span coloured by device class
// (metaphor, simile, alliteration, …). A compact legend decodes the colours.
// The annotation is reconstructed from the original text: the mark's `phrase`
// is located (case-insensitive, first occurrence) and wrapped; any phrase not
// found in the text is silently skipped rather than corrupting the display.
// Use for AP-English/IB analysis, debate rhetoric, speechwriting tuition, and
// any "find the technique" exercise.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DeviceMarkProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DeviceMarkProps & { delay?: number };

// Device → design-token colour (background tint, foreground implied by contrast).
const DEVICE_COLOR: Record<string, string> = {
  metaphor: 'color-mix(in oklab, var(--presence) 25%, transparent)',
  simile: 'color-mix(in oklab, var(--insight) 25%, transparent)',
  alliteration: 'color-mix(in oklab, var(--warning) 22%, transparent)',
  irony: 'color-mix(in oklab, var(--danger) 20%, transparent)',
  anaphora: 'color-mix(in oklab, var(--presence) 35%, transparent)',
  hyperbole: 'color-mix(in oklab, var(--warning) 32%, transparent)',
  personification: 'color-mix(in oklab, var(--insight) 30%, transparent)',
  allusion: 'color-mix(in oklab, var(--presence) 18%, transparent)',
  parallelism: 'color-mix(in oklab, var(--insight) 22%, transparent)',
  antithesis: 'color-mix(in oklab, var(--danger) 25%, transparent)',
  oxymoron: 'color-mix(in oklab, var(--warning) 28%, transparent)',
  repetition: 'color-mix(in oklab, var(--presence) 20%, transparent)',
  chiasmus: 'color-mix(in oklab, var(--insight) 28%, transparent)',
  assonance: 'color-mix(in oklab, var(--warning) 18%, transparent)',
  other: 'color-mix(in oklab, var(--text-muted) 22%, transparent)',
};

const DEVICE_BORDER: Record<string, string> = {
  metaphor: 'var(--presence)',
  simile: 'var(--insight)',
  alliteration: 'var(--warning)',
  irony: 'var(--danger)',
  anaphora: 'var(--presence)',
  hyperbole: 'var(--warning)',
  personification: 'var(--insight)',
  allusion: 'var(--presence)',
  parallelism: 'var(--insight)',
  antithesis: 'var(--danger)',
  oxymoron: 'var(--warning)',
  repetition: 'var(--presence)',
  chiasmus: 'var(--insight)',
  assonance: 'var(--warning)',
  other: 'var(--text-muted)',
};

// Segment = plain text string | annotated span.
interface Plain {
  kind: 'plain';
  text: string;
}
interface Marked {
  kind: 'marked';
  text: string;
  device: string;
  note?: string;
}
type Segment = Plain | Marked;

function buildSegments(
  text: string,
  marks: { phrase: string; device: string; note?: string }[],
): Segment[] {
  // Sort marks longest-first so a longer phrase is preferred over a shorter substring.
  const sorted = [...marks].sort((a, b) => b.phrase.length - a.phrase.length);
  // Find non-overlapping occurrences using a greedy left-to-right pass.
  type Hit = { start: number; end: number; device: string; phrase: string; note?: string };
  const hits: Hit[] = [];
  for (const m of sorted) {
    const lower = text.toLowerCase();
    const phraseLower = m.phrase.toLowerCase();
    let idx = 0;
    while (idx < lower.length) {
      const pos = lower.indexOf(phraseLower, idx);
      if (pos < 0) break;
      // Skip if overlapping an existing hit.
      const overlaps = hits.some((h) => pos < h.end && pos + m.phrase.length > h.start);
      if (!overlaps)
        hits.push({
          start: pos,
          end: pos + m.phrase.length,
          device: m.device,
          phrase: text.slice(pos, pos + m.phrase.length),
          note: m.note,
        });
      idx = pos + 1;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const segs: Segment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) segs.push({ kind: 'plain', text: text.slice(cursor, h.start) });
    segs.push({ kind: 'marked', text: h.phrase, device: h.device, note: h.note });
    cursor = h.end;
  }
  if (cursor < text.length) segs.push({ kind: 'plain', text: text.slice(cursor) });
  return segs.length ? segs : [{ kind: 'plain', text }];
}

export function DeviceMark({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  text,
  marks,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const safeMarks = useMemo(() => marks ?? [], [marks]);

  const segments = useMemo(() => buildSegments(text, safeMarks), [text, safeMarks]);
  const devicesUsed = useMemo(() => [...new Set(safeMarks.map((m) => m.device))], [safeMarks]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <p className="dm-passage">
        {segments.map((seg, i) => {
          if (seg.kind === 'plain') return seg.text;
          const bg = DEVICE_COLOR[seg.device] ?? DEVICE_COLOR.other;
          const border = DEVICE_BORDER[seg.device] ?? DEVICE_BORDER.other;
          return (
            <span
              key={i}
              className="dm-mark"
              style={{ '--dm-bg': bg, '--dm-border': border } as CSSProperties}
              title={seg.note ? `${seg.device}: ${seg.note}` : seg.device}
              aria-label={`${seg.text} [${seg.device}${seg.note ? ': ' + seg.note : ''}]`}
            >
              {seg.text}
            </span>
          );
        })}
      </p>

      {devicesUsed.length > 0 && (
        <div className="dm-legend">
          {devicesUsed.map((d) => {
            const bg = DEVICE_COLOR[d] ?? DEVICE_COLOR.other;
            const border = DEVICE_BORDER[d] ?? DEVICE_BORDER.other;
            // Find the note for this device if any mark carries one.
            const noteEntry = safeMarks.find((m) => m.device === d && m.note);
            return (
              <span key={d} className="dm-legend-item">
                <span
                  className="dm-legend-swatch"
                  style={{ '--dm-bg': bg, '--dm-border': border } as CSSProperties}
                />
                <span className="dm-legend-label">
                  {d[0].toUpperCase() + d.slice(1)}
                  {noteEntry && <span className="dm-legend-note"> — {noteEntry.note}</span>}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {caption && <div className="block-caption dm-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          dangerouslySetInnerHTML={richInnerHtml(footer)}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}
