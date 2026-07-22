// "Tonight, so far." — the session folded into one screen. Everything here is derived
// from what actually happened: real frame timestamps, the chapters the scrubber already
// derives, and each thread's own settled narration as its summary line. Nothing is
// generated or reworded — a recap that misquoted the session would be worse than none.
import type { TurnFrame } from '../history';
import type { Chapter } from '../scrubber/chapters';
import { correctionMarks } from '../heal/corrections';
import { fmtClock } from '../voice/clock';

export interface RecapRow {
  title: string;
  clock: string;
  /** The thread's latest spoken line — where that topic actually landed. */
  line: string;
  /** Jump target: the moment whose canvas shows this state. */
  frameIndex: number;
  /** Set when a later turn declared it corrects a moment in this thread — the recap shows
   *  the honest "was → now" instead of letting an outdated line stand unmarked. */
  corrected?: string;
}

export interface RecapModel {
  heading: string;
  meta: string;
  rows: RecapRow[];
}

function dayPart(hour: number): string {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'This morning';
  if (hour < 17) return 'This afternoon';
  return 'Tonight';
}

function span(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function buildRecap(frames: TurnFrame[], chapters: Chapter[]): RecapModel | null {
  if (frames.length === 0 || chapters.length === 0) return null;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const heading = `${dayPart(new Date(first.at).getHours())}, so far.`;
  const meta = [
    `${fmtClock(first.at)} – ${fmtClock(last.at)}`,
    span(last.at - first.at),
    `${chapters.length} ${chapters.length === 1 ? 'topic' : 'topics'}`,
    `${frames.length} ${frames.length === 1 ? 'moment' : 'moments'}`,
  ].join(' · ');
  const corrected = correctionMarks(frames);
  const rows: RecapRow[] = [];
  for (const ch of chapters) {
    const head = ch.moments[0];
    const tail = ch.moments[ch.moments.length - 1];
    const settled = frames[tail.frameIndex];
    const line = settled?.narration || settled?.question || '';
    if (!line) continue;
    // A correction anywhere in this thread is worth owning on the recap row.
    const mark = ch.moments.map((m) => corrected.get(m.frameIndex)).find(Boolean);
    rows.push({
      title: ch.title,
      clock: fmtClock(frames[head.frameIndex]?.at),
      line,
      frameIndex: tail.frameIndex,
      ...(mark
        ? { corrected: `Corrected — ${mark.note.what}: was ${mark.note.was}, now ${mark.note.now}` }
        : {}),
    });
  }
  return rows.length ? { heading, meta, rows } : null;
}
