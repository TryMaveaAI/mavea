import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AlignedSequence, SequenceAlignProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SequenceAlignProps & { delay?: number };

const GAP = '-';

const KIND_LABEL: Record<SequenceAlignProps['kind'], string> = {
  dna: 'DNA',
  rna: 'RNA',
  protein: 'Protein',
};

function charAt(chars: string | undefined, col: number): string {
  const c = chars ? chars[col] : undefined;
  return c === undefined ? GAP : c;
}

/** The alignment's column count. Reads are expected to already be gap-padded to one
 *  common length, but a caller can send ragged ones — the longest read sets the width and
 *  shorter reads read as trailing gaps rather than being dropped or crashing the layout. */
function alignmentWidth(rows: AlignedSequence[]): number {
  let width = 0;
  for (const r of rows) width = Math.max(width, r?.chars?.length ?? 0);
  return width;
}

/** Per column: do every read's characters (gaps included) agree? A gap lined up against a
 *  base counts as disagreement, same as two different bases would — either is a real
 *  difference between the reads at that position. */
function conservedColumns(rows: AlignedSequence[], width: number): boolean[] {
  const flags: boolean[] = new Array(width).fill(true);
  for (let col = 0; col < width; col++) {
    let ref: string | null = null;
    for (const r of rows) {
      const c = charAt(r?.chars, col);
      if (ref === null) ref = c;
      else if (c !== ref) {
        flags[col] = false;
        break;
      }
    }
  }
  return flags;
}

/** The majority character per column, derived only from the real reads given — never trusted
 *  from a caller-supplied string, since an LLM has no reliable way to hand-compute a per-column
 *  vote. Gaps don't vote; a column with no bases at all consensuses to a gap, and a column with
 *  no single majority (a tie) consensuses to '.' — the honest way to say "no consensus here"
 *  rather than picking a side the data doesn't actually support. */
function computeConsensus(rows: AlignedSequence[], width: number): string {
  let out = '';
  for (let col = 0; col < width; col++) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = charAt(r?.chars, col);
      if (c === GAP) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (counts.size === 0) {
      out += GAP;
      continue;
    }
    let best = GAP;
    let bestCount = 0;
    let tied = false;
    for (const [c, n] of counts) {
      if (n > bestCount) {
        best = c;
        bestCount = n;
        tied = false;
      } else if (n === bestCount) {
        tied = true;
      }
    }
    out += tied ? '.' : best;
  }
  return out;
}

// A multiple-sequence-alignment view: one monospace row per read with a shared label column
// pinned to the left while the alignment scrolls horizontally beneath it, so a long read never
// pushes its own name out of view. When highlightMismatches is set, any column where the reads
// disagree gets a warning wash (gaps always render as a muted dash, mismatch or not). The
// optional consensus row is never taken from the caller verbatim — see computeConsensus.
export function SequenceAlign({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  kind,
  sequences,
  consensus,
  highlightMismatches = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const rows = useMemo(
    () => (Array.isArray(sequences) ? sequences.filter((s): s is AlignedSequence => !!s) : []),
    [sequences],
  );
  const width = useMemo(() => alignmentWidth(rows), [rows]);
  const conserved = useMemo(
    () => (highlightMismatches && width > 0 ? conservedColumns(rows, width) : null),
    [highlightMismatches, rows, width],
  );
  const consensusLabel = consensus?.trim();
  const consensusChars = useMemo(
    () => (consensusLabel && rows.length > 0 && width > 0 ? computeConsensus(rows, width) : null),
    [consensusLabel, rows, width],
  );
  const kindLabel = KIND_LABEL[kind] ?? 'Sequence';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sq-head">
        <span className="sq-kind">{kindLabel}</span>
        <span className="sq-stat">
          {rows.length} read{rows.length === 1 ? '' : 's'} · {width} col{width === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 || width === 0 ? (
        <div className="sq-empty">No sequence data to align.</div>
      ) : (
        <div
          className="sq-scroll"
          role="table"
          aria-label={`${kindLabel} alignment: ${rows.length} reads, ${width} columns`}
        >
          <div className="sq-rows">
            {rows.map((seq, i) => (
              <SequenceRow
                key={i}
                index={i}
                label={seq?.label}
                chars={seq?.chars}
                width={width}
                conserved={conserved}
              />
            ))}
            {consensusChars && (
              <div className="sq-row sq-consensus" role="row">
                <span className="sq-label">{consensusLabel}</span>
                <span className="sq-chars">
                  {Array.from({ length: width }, (_, col) => {
                    const c = consensusChars[col];
                    const cls = c === GAP ? ' gap' : c === '.' ? ' ambiguous' : '';
                    return (
                      <span key={col} className={`sq-char${cls}`}>
                        {c}
                      </span>
                    );
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

function SequenceRow({
  index,
  label,
  chars,
  width,
  conserved,
}: {
  index: number;
  label: string | undefined;
  chars: string | undefined;
  width: number;
  conserved: boolean[] | null;
}) {
  const displayLabel = label?.trim() || `Sequence ${index + 1}`;
  return (
    <div
      className="sq-row m-stagger-item m-fade-rise"
      role="row"
      style={{ ['--i' as string]: index } as CSSProperties}
    >
      <span className="sq-label" title={displayLabel}>
        {displayLabel}
      </span>
      <span className="sq-chars">
        {Array.from({ length: width }, (_, col) => {
          const c = charAt(chars, col);
          const isGap = c === GAP;
          const mismatch = !isGap && conserved !== null && conserved[col] === false;
          return (
            <span
              key={col}
              className={`sq-char${isGap ? ' gap' : ''}${mismatch ? ' mismatch' : ''}`}
            >
              {c}
            </span>
          );
        })}
      </span>
    </div>
  );
}
