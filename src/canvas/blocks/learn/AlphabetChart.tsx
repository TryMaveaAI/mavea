import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AlphabetChartProps, AlphabetLetter } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AlphabetChartProps & { delay?: number };

// A-Z reference grid: "Aa is for Apple" per cell. The classic keyword mnemonics below are the
// sensible default the component renders when the model omits `letters` entirely — a reference
// chart should never come up empty. They also backfill a keyword for any supplied letter that's
// missing one, so a loosely-specified list (just letters, no keywords) still reads complete.
const DEFAULT_ALPHABET: Required<Pick<AlphabetLetter, 'letter' | 'keyword'>>[] = [
  { letter: 'A', keyword: 'Apple' },
  { letter: 'B', keyword: 'Ball' },
  { letter: 'C', keyword: 'Cat' },
  { letter: 'D', keyword: 'Dog' },
  { letter: 'E', keyword: 'Elephant' },
  { letter: 'F', keyword: 'Fish' },
  { letter: 'G', keyword: 'Goat' },
  { letter: 'H', keyword: 'Hat' },
  { letter: 'I', keyword: 'Igloo' },
  { letter: 'J', keyword: 'Jam' },
  { letter: 'K', keyword: 'Kite' },
  { letter: 'L', keyword: 'Lion' },
  { letter: 'M', keyword: 'Moon' },
  { letter: 'N', keyword: 'Nest' },
  { letter: 'O', keyword: 'Owl' },
  { letter: 'P', keyword: 'Pig' },
  { letter: 'Q', keyword: 'Queen' },
  { letter: 'R', keyword: 'Rabbit' },
  { letter: 'S', keyword: 'Sun' },
  { letter: 'T', keyword: 'Tiger' },
  { letter: 'U', keyword: 'Umbrella' },
  { letter: 'V', keyword: 'Van' },
  { letter: 'W', keyword: 'Whale' },
  { letter: 'X', keyword: 'Xylophone' },
  { letter: 'Y', keyword: 'Yarn' },
  { letter: 'Z', keyword: 'Zebra' },
];
const DEFAULT_KEYWORD: Record<string, string> = Object.fromEntries(
  DEFAULT_ALPHABET.map((l) => [l.letter, l.keyword]),
);

interface NormalizedLetter {
  upper: string;
  lower: string;
  keyword?: string;
  icon?: AlphabetLetter['icon'];
}

function normalize(entries: AlphabetLetter[]): NormalizedLetter[] {
  const out: NormalizedLetter[] = [];
  for (const l of entries) {
    const ch = (l.letter ?? '').trim().slice(0, 1);
    if (!ch) continue; // no usable character — skip rather than render a blank cell
    const upper = ch.toUpperCase();
    out.push({
      upper,
      lower: ch.toLowerCase(),
      keyword: l.keyword?.trim() || DEFAULT_KEYWORD[upper],
      icon: l.icon,
    });
  }
  return out;
}

export function AlphabetChart({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  letters,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;
  const normalized = normalize(letters ?? []);
  // A reference chart is never allowed to render empty — fall back to the full default set
  // whenever the supplied list is missing or every entry turned out unusable.
  const cells = normalized.length > 0 ? normalized : normalize(DEFAULT_ALPHABET);

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

      <ul className="lr-abc-grid">
        {cells.map((c, i) => {
          const CellIcon = c.icon ? Icon[c.icon] : undefined;
          return (
            <li
              key={`${c.upper}-${i}`}
              className="lr-abc-cell m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
              aria-label={c.keyword ? `${c.upper} is for ${c.keyword}` : c.upper}
            >
              <div className="lr-abc-glyph" aria-hidden="true">
                <span className="lr-abc-upper">{c.upper}</span>
                <span className="lr-abc-lower">{c.lower}</span>
              </div>
              {(c.keyword || CellIcon) && (
                <div className="lr-abc-keyword" aria-hidden="true">
                  {CellIcon && <CellIcon className="ic lr-abc-icon" />}
                  {c.keyword && <span>{c.keyword}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

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
