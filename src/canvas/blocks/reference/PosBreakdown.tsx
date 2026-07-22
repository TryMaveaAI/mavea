import { type CSSProperties, useMemo, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { PosBreakdownProps, PosToken } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PosBreakdownProps & { delay?: number };

// Parts-of-speech sentence breakdown: the sentence flows as word chips, each underlined and
// tinted by its class (the pos→colour mapping lives once in styles.css), with the abbreviation
// beneath. Punctuation is grouped with its neighbouring word so a wrap never strands a comma
// at the start of a line. The legend lists only the classes actually present and click-toggles
// a spotlight — everything outside the chosen class fades back.

// Canonical legend order + abbreviations. Punctuation is deliberately absent: it renders
// unstyled beside its word and never earns a legend chip.
const POS_ORDER = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'determiner',
  'interjection',
] as const;
type WordClass = (typeof POS_ORDER)[number];

const ABBR: Record<WordClass, string> = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  preposition: 'prep.',
  conjunction: 'conj.',
  determiner: 'det.',
  interjection: 'interj.',
};

const isWordClass = (p: unknown): p is WordClass =>
  typeof p === 'string' && Object.prototype.hasOwnProperty.call(ABBR, p);

// Opening marks (¿ ¡, brackets, opening quotes) belong to the word AFTER them; every other
// mark hugs the word before it.
const OPENERS = /^[¿¡([{«‹“‘]+$/;

interface NormTok {
  word: string;
  /** undefined = unknown class — rendered as a neutral chip with no abbreviation */
  pos?: WordClass;
  punct?: boolean;
  note?: string;
  /** 1-based footnote number, assigned in reading order when a note exists */
  noteIdx?: number;
}

/** A word chip plus the punctuation glued to it, kept on one line together. */
interface Group {
  lead: NormTok[];
  word?: NormTok;
  trail: NormTok[];
}

export function PosBreakdown({
  title,
  icon = 'captions',
  iconColor = 'var(--presence)',
  tokens,
  sentence,
  translation,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.captions;

  const { groups, legend, notes } = useMemo(() => {
    const raw = Array.isArray(tokens) ? tokens : [];
    let noteCount = 0;
    const norm: NormTok[] = [];
    for (const t of raw as unknown[]) {
      // a bare string still reads as a word of unknown class
      if (typeof t === 'string') {
        if (t.trim()) norm.push({ word: t });
        continue;
      }
      if (!t || typeof t !== 'object') continue;
      const tok = t as Partial<PosToken>;
      if (typeof tok.word !== 'string' || !tok.word.trim()) continue;
      if (tok.pos === 'punctuation') {
        norm.push({ word: tok.word, punct: true });
        continue;
      }
      const note = typeof tok.note === 'string' && tok.note.trim() ? tok.note : undefined;
      norm.push({
        word: tok.word,
        pos: isWordClass(tok.pos) ? tok.pos : undefined,
        note,
        noteIdx: note ? ++noteCount : undefined,
      });
    }

    // glue punctuation to its neighbouring word
    const groups: Group[] = [];
    let lead: NormTok[] = [];
    for (const t of norm) {
      if (t.punct) {
        const last = groups[groups.length - 1];
        if (last && !OPENERS.test(t.word)) last.trail.push(t);
        else lead.push(t);
      } else {
        groups.push({ lead, word: t, trail: [] });
        lead = [];
      }
    }
    if (lead.length) {
      const last = groups[groups.length - 1];
      if (last) last.trail.push(...lead);
      else groups.push({ lead, trail: [] });
    }

    const counts = new Map<WordClass, number>();
    for (const t of norm) if (t.pos) counts.set(t.pos, (counts.get(t.pos) ?? 0) + 1);
    const legend = POS_ORDER.filter((p) => counts.has(p)).map((p) => ({
      pos: p,
      count: counts.get(p) ?? 0,
    }));

    return { groups, legend, notes: norm.filter((t) => t.noteIdx !== undefined) };
  }, [tokens]);

  // The spotlighted class; guarded against a stale selection after a prop change.
  const [only, setOnly] = useState<WordClass | null>(null);
  const active = only && legend.some((l) => l.pos === only) ? only : null;

  const punct = (p: NormTok, key: string) => (
    <span key={key} className="psb-punct" data-dim={!!active || undefined}>
      {p.word}
    </span>
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {groups.length > 0 ? (
        <div className="psb-flow">
          {groups.map((g, gi) => (
            <span className="psb-group" key={gi}>
              {g.lead.map((p, i) => punct(p, `l${i}`))}
              {g.word && (
                <span
                  className="psb-token"
                  data-pos={g.word.pos}
                  data-dim={(!!active && g.word.pos !== active) || undefined}
                  title={g.word.note ? `${g.word.word} — ${g.word.note}` : undefined}
                >
                  <span className="psb-word">
                    {g.word.word}
                    {g.word.noteIdx !== undefined && (
                      <sup className="psb-note-mark" aria-hidden="true">
                        {g.word.noteIdx}
                      </sup>
                    )}
                  </span>
                  {g.word.pos && (
                    <span className="psb-abbr" aria-hidden="true">
                      {ABBR[g.word.pos]}
                    </span>
                  )}
                </span>
              )}
              {g.trail.map((p, i) => punct(p, `t${i}`))}
            </span>
          ))}
        </div>
      ) : sentence ? (
        <p className="psb-plain">{sentence}</p>
      ) : (
        <div className="psb-empty">Nothing to break down yet.</div>
      )}

      {translation && <div className="psb-translation">{translation}</div>}

      {legend.length > 0 && (
        <div className="psb-legend" role="group" aria-label="Word classes in this sentence">
          {legend.map(({ pos, count }) => (
            <button
              key={pos}
              type="button"
              className="psb-leg"
              data-pos={pos}
              aria-pressed={active === pos}
              onClick={() => setOnly((cur) => (cur === pos ? null : pos))}
              title={active === pos ? 'Show every word' : `Spotlight every ${pos}`}
            >
              <span className="psb-leg-dot" aria-hidden="true" />
              {pos}
              {count > 1 && <span className="psb-leg-n">×{count}</span>}
            </button>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="psb-notes">
          {notes.map((t) => (
            <li key={t.noteIdx} className="psb-note">
              <sup className="psb-note-num">{t.noteIdx}</sup>
              <span className="psb-note-text">
                <span className="psb-note-word">{t.word}</span> — {t.note}
              </span>
            </li>
          ))}
        </ul>
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
