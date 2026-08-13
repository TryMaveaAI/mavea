import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { SightWordEntry, SightWordListProps, SightWordMastery } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { cancelKokoro, kokoroKnownAvailable, speakKokoroResult } from '../../../voice/kokoro';

type Props = SightWordListProps & { delay?: number };

// K-2 sight-word practice list: each word is a tap-to-hear chip (local Kokoro, same pattern as
// PhonicsWord) whose color/border encode how well it's known. The mastered/practicing/new
// tallies are computed from the words themselves — real data only, nothing invented.

const MASTERY_LABEL: Record<SightWordMastery, string> = {
  new: 'New',
  practicing: 'Practicing',
  mastered: 'Mastered',
};

// Fixed draw order so the legend and the tallies always read new → practicing → mastered,
// however the words themselves are ordered.
const MASTERY_ORDER: SightWordMastery[] = ['new', 'practicing', 'mastered'];

export function SightWordList({
  title,
  icon = 'captions',
  iconColor = 'var(--presence)',
  listName,
  words,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.captions;
  const safeWords = (words ?? []).filter((w): w is SightWordEntry => !!w?.word);

  const [playing, setPlaying] = useState<number | null>(null);
  // Kokoro is the only voice: when it isn't running a chip animates and nothing is heard, so the
  // card says so once. Taps keep working — the service may come up later.
  const [voiceDown, setVoiceDown] = useState(false);

  useEffect(() => () => cancelKokoro(), []);

  const speak = useCallback((text: string, idx: number) => {
    cancelKokoro();
    setPlaying(idx);
    void speakKokoroResult(text, 'mavea').then((played) => {
      setPlaying((cur) => (cur === idx ? null : cur));
      // A cancelled line resolves false too (the tap above drains the previous one), so only
      // the settled health probe is proof the service is actually down.
      if (!played && kokoroKnownAvailable() === false) setVoiceDown(true);
    });
  }, []);

  const tally: Record<SightWordMastery, number> = { new: 0, practicing: 0, mastered: 0 };
  for (const w of safeWords) tally[w.mastery ?? 'new']++;

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

      <p className="lr-swl-caption">
        {listName ? `${listName} sight words` : 'Sight words'} &middot; {safeWords.length}{' '}
        {safeWords.length === 1 ? 'word' : 'words'}
      </p>

      {safeWords.length === 0 ? (
        <p className="lr-swl-empty">No words yet.</p>
      ) : (
        <>
          <div className="lr-swl-words" role="group" aria-label="Sight words">
            {safeWords.map((w, i) => {
              const mastery = w.mastery ?? 'new';
              const isMastered = mastery === 'mastered';
              return (
                <button
                  key={i}
                  type="button"
                  className="lr-swl-chip m-stagger-item m-fade-rise"
                  data-mastery={mastery}
                  data-playing={playing === i || undefined}
                  style={{ ['--i' as string]: i } as CSSProperties}
                  onClick={() => speak(w.word, i)}
                  title={`Hear "${w.word}"`}
                  aria-label={`${w.word}, ${MASTERY_LABEL[mastery]}, tap to hear`}
                >
                  {isMastered && <Icon.check className="ic lr-swl-check" />}
                  <span className="lr-swl-word">{w.word}</span>
                </button>
              );
            })}
          </div>

          <div className="lr-swl-legend">
            {MASTERY_ORDER.map((m) => (
              <span key={m} className="lr-swl-legend-item" data-mastery={m}>
                <i className="lr-swl-legend-dot" aria-hidden="true" />
                {MASTERY_LABEL[m]} &middot; {tally[m]}
              </span>
            ))}
          </div>

          {voiceDown && (
            <p className="insight-summary" role="status" style={{ marginTop: 10 }}>
              Voice is off — start the local voice service to hear this.
            </p>
          )}
        </>
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
