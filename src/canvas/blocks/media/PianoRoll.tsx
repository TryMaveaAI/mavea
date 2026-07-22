import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import { fitText } from '../../lib/fitText';
import type { PianoRollProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PianoRollProps & { delay?: number };

// Semitone offset of each natural note within an octave.
const NATURALS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const PITCH_RE = /^([a-gA-G])([#♯b♭]?)(-?\d{1,2})$/;

/** Scientific pitch or MIDI number → MIDI 0–127, or null when malformed (the note is skipped —
 *  a wrong guess must never place a bar on the wrong key). */
function toMidi(pitch: unknown): number | null {
  if (typeof pitch === 'number' && Number.isFinite(pitch)) {
    const m = Math.round(pitch);
    return m >= 0 && m <= 127 ? m : null;
  }
  if (typeof pitch !== 'string') return null;
  const s = pitch.trim();
  if (!s) return null;
  if (/^\d{1,3}$/.test(s)) {
    const m = Number(s);
    return m >= 0 && m <= 127 ? m : null;
  }
  const match = PITCH_RE.exec(s);
  if (!match) return null;
  const base = NATURALS[match[1].toLowerCase()];
  const acc =
    match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0;
  const oct = Number(match[3]);
  const midi = (oct + 1) * 12 + base + acc;
  return midi >= 0 && midi <= 127 ? midi : null;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// Roll geometry, in viewBox units. The left gutter holds the mini keyboard; the bottom band
// holds the bar numbers.
const GUT = 44;
const ROW = 14;
const TOP = 4;
const RPAD = 6;
const BOT = 26;
const MAX_BEATS = 128;

interface RollNote {
  midi: number;
  start: number;
  dur: number;
  vel: number;
  label?: string;
}

export function PianoRoll({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  notes,
  beatsPerBar,
  tempo,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.play;

  // A number, a numeric string, or NaN — the beat fields tolerate the looser shapes a model emits.
  const num = (v: unknown): number =>
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;

  const all = Array.isArray(notes) ? notes : [];
  let skipped = Math.max(0, all.length - 96); // beyond the render cap counts as skipped, honestly
  const parsed: RollNote[] = [];
  for (const raw of all.slice(0, 96)) {
    if (!raw || typeof raw !== 'object') {
      skipped++;
      continue;
    }
    const midi = toMidi(raw.pitch);
    const rawStart = num(raw.start);
    const start = Number.isFinite(rawStart) ? Math.max(0, rawStart) : NaN;
    const dur = num(raw.duration);
    if (midi === null || !Number.isFinite(start) || !(dur > 0) || start >= MAX_BEATS) {
      skipped++;
      continue;
    }
    const vel =
      typeof raw.velocity === 'number' && Number.isFinite(raw.velocity)
        ? Math.min(1, Math.max(0, raw.velocity))
        : 0.75;
    parsed.push({
      midi,
      start,
      dur: Math.min(dur, MAX_BEATS - start),
      vel,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined,
    });
  }

  if (parsed.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        {title && (
          <div className="card-eyebrow">
            <Ic className="ic" style={{ color: iconColor }} /> {title}
          </div>
        )}
        <BlockEmpty
          message="No playable notes"
          hint={
            skipped ? `${skipped} malformed note${skipped === 1 ? '' : 's'} skipped` : undefined
          }
        />
      </div>
    );
  }

  const bpb = Math.min(16, Math.max(1, Math.round(Number(beatsPerBar) || 4)));

  // Pitch range: the notes plus one row of headroom each side, widened to a minimum band so a
  // two-note motif still reads as a keyboard rather than a sliver.
  let lo = Math.max(0, Math.min(...parsed.map((n) => n.midi)) - 1);
  let hi = Math.min(127, Math.max(...parsed.map((n) => n.midi)) + 1);
  while (hi - lo + 1 < 8 && (lo > 0 || hi < 127)) {
    if (lo > 0) lo--;
    if (hi - lo + 1 < 8 && hi < 127) hi++;
  }
  const rowCount = hi - lo + 1;

  // Time range: whole bars, covering the furthest note end.
  const maxEnd = parsed.reduce((mx, n) => Math.max(mx, n.start + n.dur), 0);
  const bars = Math.max(1, Math.ceil(Math.ceil(Math.max(1, maxEnd)) / bpb));
  const beats = bars * bpb;
  const beatW = 24;

  const W = GUT + beats * beatW + RPAD;
  const H = TOP + rowCount * ROW + BOT;
  const rowY = (midi: number): number => TOP + (hi - midi) * ROW;
  const barStep = bars <= 16 ? 1 : Math.ceil(bars / 12);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="pnr-meta">
        {tempo && <span className="pnr-chip">{tempo}</span>}
        <span className="pnr-chip">{bpb} beats/bar</span>
        <span className="pnr-chip pnr-chip-dim">
          {noteName(lo + 1)}–{noteName(hi - 1)}
        </span>
      </div>

      <div className="pnr-figwrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pnr-svg"
          role="img"
          aria-label={title || 'Piano roll'}
        >
          {/* row bands — black-key rows tinted across the whole roll */}
          {Array.from({ length: rowCount }, (_, i) => {
            const midi = hi - i;
            const black = BLACK_KEYS.has(midi % 12);
            return black ? (
              <rect
                key={midi}
                x={GUT}
                y={TOP + i * ROW}
                width={beats * beatW}
                height={ROW}
                className="pnr-blackband"
              />
            ) : null;
          })}

          {/* beat grid; bar lines heavier */}
          {Array.from({ length: beats + 1 }, (_, b) => (
            <line
              key={b}
              x1={GUT + b * beatW}
              y1={TOP}
              x2={GUT + b * beatW}
              y2={TOP + rowCount * ROW}
              className={b % bpb === 0 ? 'pnr-barline' : 'pnr-beatline'}
            />
          ))}
          {Array.from({ length: rowCount + 1 }, (_, i) => (
            <line
              key={i}
              x1={GUT}
              y1={TOP + i * ROW}
              x2={GUT + beats * beatW}
              y2={TOP + i * ROW}
              className="pnr-rowline"
            />
          ))}

          {/* the mini keyboard gutter */}
          {Array.from({ length: rowCount }, (_, i) => {
            const midi = hi - i;
            const black = BLACK_KEYS.has(midi % 12);
            const y = TOP + i * ROW;
            return (
              <g key={midi}>
                <rect
                  x={2}
                  y={y + 0.5}
                  width={GUT - 6}
                  height={ROW - 1}
                  rx={2}
                  className={black ? 'pnr-key-black' : 'pnr-key-white'}
                />
                {midi % 12 === 0 && (
                  <text x={GUT - 10} y={y + ROW / 2} className="pnr-octave">
                    {noteName(midi)}
                  </text>
                )}
              </g>
            );
          })}

          {/* note bars — tint intensity follows velocity */}
          {parsed.map((n, i) => {
            const x = GUT + n.start * beatW;
            const w = Math.max(2.5, n.dur * beatW - 1.2);
            const y = rowY(n.midi) + 1.6;
            const text = n.label ?? noteName(n.midi);
            const fit =
              w >= 16
                ? fitText(text, { maxWidth: w - 7, fontSize: 7.5, minFontSize: 5.5, maxLines: 1 })
                : null;
            // The label shows only when the FULL name fits on one line — never truncated.
            const label = fit && fit.lines.length === 1 ? fit : null;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={ROW - 3.2}
                  rx={2.4}
                  className="pnr-note"
                  fill={`color-mix(in oklab, var(--presence) ${Math.round(30 + n.vel * 55)}%, transparent)`}
                >
                  <title>{`${noteName(n.midi)} · beat ${Math.round((n.start + 1) * 100) / 100} · ${Math.round(n.dur * 100) / 100} beat${n.dur === 1 ? '' : 's'}`}</title>
                </rect>
                {label && (
                  <text
                    x={x + 3.5}
                    y={y + (ROW - 3.2) / 2}
                    className="pnr-notelabel"
                    style={{ fontSize: label.fontSize }}
                  >
                    {label.lines[0]}
                  </text>
                )}
              </g>
            );
          })}

          {/* bar numbers along the bottom */}
          {Array.from({ length: bars }, (_, b) =>
            b % barStep === 0 ? (
              <text
                key={b}
                x={GUT + b * bpb * beatW + 3}
                y={TOP + rowCount * ROW + 12}
                className="pnr-barnum tab-num"
              >
                {b + 1}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {skipped > 0 && (
        <div className="pnr-skip">
          {skipped} note{skipped === 1 ? '' : 's'} skipped (unpitched or out of range)
        </div>
      )}

      {caption && <div className="pnr-caption">{caption}</div>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
