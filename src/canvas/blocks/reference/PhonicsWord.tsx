import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { PhonicsWordProps, PhonicsChunk } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { cancelKokoro, kokoroKnownAvailable, speakKokoroResult } from '../../../voice/kokoro';

type Props = PhonicsWordProps & { delay?: number };

// Phonics word-decoding card: the target word split into the sound chunks it is read in,
// each drawn as a box you can tap to hear it through local Kokoro, then blended into the word.
// Digraphs/blends are one highlighted unit (sh, str), silent letters are greyed, and an
// optional rhyming-words row reinforces the rime. The segmented boxes are the point — the
// chunk text reconstructs the word, so nothing on the card is invented: it all comes from props.

// A digraph/blend is a single sound spelled with several letters, so it reads as one box;
// a silent letter is shown but greyed and never sounded. Everything else is one box per chunk.
const SILENT: PhonicsChunk['kind'] = 'silent';

export function PhonicsWord({
  title,
  icon = 'captions',
  iconColor = 'var(--presence)',
  word,
  chunks,
  rhymes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.captions;
  const safeChunks = (chunks ?? []).filter((c) => c && c.text);
  const safeRhymes = (rhymes ?? []).filter(Boolean);

  // Which box (or the whole word, keyed -1) is currently sounding — for the pressed state.
  const [playing, setPlaying] = useState<number | null>(null);
  // Kokoro is the only voice: when it isn't running the boxes animate and nothing is heard,
  // so the card says so once. Taps keep working — the service may come up later.
  const [voiceDown, setVoiceDown] = useState(false);

  // Cancel queued local speech on unmount so nothing keeps talking after the card leaves.
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

      {/* the segmented word — each chunk is a box, tap to hear its sound */}
      <div className="pw-word" role="group" aria-label={`Sound out ${word}`}>
        {safeChunks.map((chunk, i) => {
          const kind = chunk.kind ?? 'grapheme';
          const isSilent = kind === SILENT;
          const isPlaying = playing === i;
          return (
            <button
              key={i}
              type="button"
              className="pw-chunk"
              data-kind={kind}
              data-playing={isPlaying || undefined}
              // a silent letter makes no sound, so its box is inert (but still shown to teach the spelling)
              disabled={isSilent}
              // `sound` is IPA notation for the eye, not for TTS — the letters are what's spoken.
              onClick={() => speak(chunk.text, i)}
              title={isSilent ? `"${chunk.text}" is silent` : `Hear "${chunk.text}"`}
              aria-label={
                isSilent
                  ? `${chunk.text}, silent`
                  : `Hear ${chunk.text}${chunk.sound ? `, ${chunk.sound}` : ''}`
              }
            >
              <span className="pw-chunk-text">{chunk.text}</span>
              {chunk.sound && <span className="pw-chunk-sound">{chunk.sound}</span>}
            </button>
          );
        })}
      </div>

      {/* blend the chunks back into the whole word — tap to hear it read normally */}
      <button
        type="button"
        className="pw-blend"
        data-playing={playing === -1 || undefined}
        onClick={() => speak(word, -1)}
        title={`Hear "${word}"`}
        aria-label={`Hear the whole word, ${word}`}
      >
        {playing === -1 ? (
          <span className="pw-wave" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <Icon.play className="ic pw-blend-ic" style={{ width: 12, height: 12 }} />
        )}
        <span className="pw-blend-word">{word}</span>
      </button>

      {voiceDown && (
        <p className="insight-summary" role="status" style={{ marginTop: 10 }}>
          Voice is off — start the local voice service to hear this.
        </p>
      )}

      {caption && <div className="ipa-caption">{caption}</div>}

      {/* rhyming words share the rime — listed as plain chips */}
      {safeRhymes.length > 0 && (
        <div className="pw-rhymes">
          <span className="pw-rhymes-k">Rhymes with</span>
          <ul className="pw-rhyme-list">
            {safeRhymes.map((r, i) => (
              <li key={i} className="pw-rhyme">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

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
