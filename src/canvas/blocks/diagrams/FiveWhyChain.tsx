// FiveWhyChain — a 5-Whys root-cause chain: a problem card at the top, then a vertical
// stack of why → answer cards linked by downward connectors, each one drilling a level
// deeper. The final card (an explicit `rootCause` if given, else the last `whys` entry) is
// accent-highlighted so the conclusion is unmistakable. Card height is computed per row from
// its own wrapped text, and the chain renders whatever length `whys` actually is — five is
// the convention, not a hard limit, so a real answer with three or eight steps still lays
// out cleanly.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FiveWhyChainProps, FiveWhyEntry } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FiveWhyChainProps & { delay?: number };

// --- viewBox geometry (user units) ---
// Inside a viewBox a font-size is a SHARE OF THE FIGURE, not a pixel count: this chain renders
// ~320px wide in a half-width card, so a unit lands at ~0.62px there. Everything below — type,
// line heights, padding — is sized against that ratio, which is why the numbers read large next
// to CSS pixels. Type authored from the HTML fluid ramp (--fs-2xs floors at 9px) rendered at
// 5.6px here, well under the ~9px legibility floor the UI audit enforces.
const VB_W = 520;
const PAD_X = 24;
const PAD_TOP = 18;
const PAD_BOT = 18;
const CARD_W = VB_W - PAD_X * 2;
const GAP = 26; // vertical gap between cards, room for the connector + arrowhead
const LINE_H = 23;
const CARD_PAD_Y = 18;
const Q_LINE_H = 22;
const MIN_CARD_H = 78;
/** Left inset of the text column from the card edge — clear of the 4-unit accent rail. */
const TEXT_INSET = 18;
/** Wrap budget. Sized off the widest a line can get — an all-caps run at .fwy-answer's size is
 *  ~0.6em per character — so a shouty real answer stays inside the card, not just the fixture's
 *  mixed-case prose. */
const CHARS_PER_LINE = 40;
/** Baseline of the badge ("Problem" / "Why n" / "Root cause") below the card top. */
const BADGE_BASELINE = 23;
/** Ascent of the first content line — how far its baseline sits below the top of its own band. */
const FIRST_LINE_ASCENT = 13;
/** Extra vertical room between the badge baseline and the first content baseline. Without it the
 *  first line's ascent reached up through the badge's glyphs (the two baselines sat 8px apart —
 *  less than a 12px line's ascent), which read as overlapping text; export skins with taller
 *  faces made it worse. Sized so the fonts can grow ~20% and the bands still clear. */
const BADGE_CLEARANCE = 16;

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows. Pure and
 *  bounded — a pathological single long word is hard-truncated, never looped. Local copy of
 *  the same idiom every sibling in this family carries (CycleWheel, CausationChain, …). */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        truncated = true;
        cur = '';
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length) {
    const li = lines.length - 1;
    let last = lines[li];
    if (last.length > perLine) last = last.slice(0, perLine - 1).trimEnd();
    if (truncated || lines[li].length > perLine) last = last.replace(/[…\s]*$/, '') + '…';
    lines[li] = last;
  }
  return lines.length ? lines : [''];
}

interface Row {
  kind: 'problem' | 'why' | 'root';
  badge: string;
  questionLines: string[];
  answerLines: string[];
  h: number;
  y: number;
}

function rowHeight(questionLines: number, answerLines: number): number {
  const qh = questionLines ? questionLines * Q_LINE_H + 4 : 0;
  const ah = answerLines * LINE_H;
  // The badge clearance shifts every content line down, so the card grows by the same amount —
  // otherwise the last line would eat the bottom padding instead.
  return Math.max(MIN_CARD_H, CARD_PAD_Y * 2 + BADGE_CLEARANCE + qh + ah);
}

export function FiveWhyChain({
  title,
  icon = 'eye',
  iconColor = 'var(--presence)',
  problem,
  whys,
  rootCause,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.eye;
  const safeRootCause = typeof rootCause === 'string' ? rootCause.trim() : '';

  const { rows, vbH } = useMemo(() => {
    const built: Row[] = [];
    let y = PAD_TOP;

    const problemLines = wrap(typeof problem === 'string' ? problem : '', CHARS_PER_LINE, 3);
    const problemH = rowHeight(0, problemLines.length);
    built.push({
      kind: 'problem',
      badge: 'Problem',
      questionLines: [],
      answerLines: problemLines,
      h: problemH,
      y,
    });
    y += problemH + GAP;

    const entries: FiveWhyEntry[] = (Array.isArray(whys) ? whys : []).filter(
      (w): w is FiveWhyEntry =>
        !!w && typeof w === 'object' && typeof w.answer === 'string' && w.answer.trim() !== '',
    );
    const lastIdx = entries.length - 1;

    entries.forEach((w, i) => {
      const isFinalRow = i === lastIdx && !safeRootCause;
      const question = typeof w.question === 'string' ? w.question.trim() : '';
      const questionLines = question ? wrap(question, CHARS_PER_LINE, 2) : [];
      const answerLines = wrap(w.answer, CHARS_PER_LINE, 3);
      const h = rowHeight(questionLines.length, answerLines.length);
      built.push({
        kind: isFinalRow ? 'root' : 'why',
        badge: `Why ${i + 1}`,
        questionLines,
        answerLines,
        h,
        y,
      });
      y += h + GAP;
    });

    if (safeRootCause) {
      const rootLines = wrap(safeRootCause, CHARS_PER_LINE, 3);
      const h = rowHeight(0, rootLines.length);
      built.push({
        kind: 'root',
        badge: 'Root cause',
        questionLines: [],
        answerLines: rootLines,
        h,
        y,
      });
      y += h + GAP;
    }

    return { rows: built, vbH: Math.max(120, y - GAP + PAD_BOT) };
  }, [problem, whys, safeRootCause]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage fwy-stage">
        <svg
          viewBox={`0 0 ${VB_W} ${vbH}`}
          className="dg-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="fwy-arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="fwy-arrowhead" />
            </marker>
          </defs>

          {/* connectors, drawn first so the cards sit on top of where they meet */}
          {rows.slice(1).map((r, i) => {
            const prev = rows[i];
            const x = VB_W / 2;
            return (
              <line
                key={`link-${i}`}
                x1={x}
                y1={prev.y + prev.h}
                x2={x}
                y2={r.y - 5}
                className="fwy-link"
                markerEnd="url(#fwy-arrow)"
              />
            );
          })}

          {rows.map((r, i) => {
            const textX = PAD_X + TEXT_INSET;
            const badgeY = r.y + BADGE_BASELINE;
            const qStartY = r.y + CARD_PAD_Y + FIRST_LINE_ASCENT + BADGE_CLEARANCE;
            const answerStartY =
              r.questionLines.length > 0
                ? qStartY + r.questionLines.length * Q_LINE_H + 4
                : qStartY;
            return (
              <g key={i}>
                <rect
                  x={PAD_X}
                  y={r.y}
                  width={CARD_W}
                  height={r.h}
                  rx={12}
                  className={`fwy-card fwy-card--${r.kind}`}
                />
                <rect
                  x={PAD_X}
                  y={r.y}
                  width={4}
                  height={r.h}
                  rx={2}
                  className={`fwy-rail fwy-rail--${r.kind}`}
                />
                <text x={textX} y={badgeY} className={`fwy-badge fwy-badge--${r.kind}`}>
                  {r.badge}
                </text>
                {r.questionLines.length > 0 && (
                  <text className="fwy-question">
                    {r.questionLines.map((ln, li) => (
                      <tspan key={li} x={textX} y={qStartY + li * Q_LINE_H}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                )}
                <text className={`fwy-answer fwy-answer--${r.kind}`}>
                  {r.answerLines.map((ln, li) => (
                    <tspan key={li} x={textX} y={answerStartY + li * LINE_H}>
                      {ln}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
