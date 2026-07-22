// The answer hero accents the figures the voice leans on — "$240/mo", "5.9%", "800Gbps" —
// so the spoken sentence reads like the headline of its own evidence. Detection is a
// conservative tokenizer over the display text: a figure needs a currency mark, a unit, a
// percent/multiplier, or a range to qualify. Bare integers stay plain (years, "747", "B2B"),
// because over-accenting reads as decoration, not measurement.
//
// Output is plain segments rendered as React text nodes — no HTML path, nothing to sanitize.
import { Fragment, type ReactNode } from 'react';

export interface HeroSegment {
  text: string;
  accent: boolean;
}

// Spelled-out units that mark a number as a measurement when separated by a space.
const UNIT_WORDS =
  'percent|points?|seconds?|minutes?|min|hours?|hrs?|days?|weeks?|months?|mo|years?|yrs?|miles?|km|kg|lbs?|watts?';

// Compact suffix units glued to the number: 96ms · 800Gbps · 50kW · 30°C · 12V.
const UNIT_SUFFIX = '(?:[kKMGT]?(?:W|Wh|B|bps|Hz|V|A)|ms|km|mi|kg|lb|oz|ft|°[CF]?)';

// digits with optional thousands groups — never ending on a comma (",950," would
// otherwise swallow sentence punctuation into the accent)
const NUM = String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?`;

const FIGURE = new RegExp(
  String.raw`(?<![\w.])(?:` +
    // money, optionally signed, ranged, scaled, or per-something: +$12k · $1,284.10 · $6–8B · €30/mo
    String.raw`[+\-−]?[$€£]\s?${NUM}(?:\s?[–—-]\s?${NUM})?(?:\s?(?:k|K|m|M|bn|B|T|million|billion|trillion)(?![A-Za-z]))?(?:\s?\/\s?[a-z]{1,5})?` +
    String.raw`|` +
    // a range, with or without a glued unit: 50–100kW · 6–8
    String.raw`${NUM}\s?[–—-]\s?${NUM}\s?(?:${UNIT_SUFFIX}|%)?` +
    String.raw`|` +
    // percentages and multipliers, optionally signed: 5.9% · +2.4% · 1.6× · 3x
    String.raw`[+\-−]?${NUM}\s?(?:%|×|x(?![A-Za-z0-9]))` +
    String.raw`|` +
    // number glued to a unit: 96ms · 800Gbps · 100kW
    String.raw`${NUM}${UNIT_SUFFIX}(?![A-Za-z0-9])` +
    String.raw`|` +
    // number + spelled-out unit: 11 months · 22 min · 40 watts
    String.raw`${NUM}\s(?:${UNIT_WORDS})\b` +
    String.raw`)`,
  'g',
);

/** Split display text into plain/accented runs. Joining the runs reproduces the input. */
export function heroSegments(text: string): HeroSegment[] {
  const out: HeroSegment[] = [];
  let last = 0;
  FIGURE.lastIndex = 0;
  for (let m = FIGURE.exec(text); m; m = FIGURE.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false });
    out.push({ text: m[0], accent: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false });
  return out;
}

/** The hero line as React nodes: accented runs in `<em class="hero-accent">`, the rest as text. */
export function renderHeroLine(text: string): ReactNode[] {
  return heroSegments(text).map((seg, i) =>
    seg.accent ? (
      <em key={i} className="hero-accent">
        {seg.text}
      </em>
    ) : (
      <Fragment key={i}>{seg.text}</Fragment>
    ),
  );
}
