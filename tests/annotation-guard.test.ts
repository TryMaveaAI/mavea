// A pronunciation the voice does not need is worse than no pronunciation at all.
//
// The said side of a [[shown|said]] span is INVENTED by the model, not looked up. Told to annotate
// anything "a synthesizer could plausibly mispronounce", it respells ordinary vocabulary too — and
// the voice then says a common word wrong, out loud, with confidence. These lock the floor that
// throws those out while leaving the annotations that genuinely earn their place.
import { describe, it, expect } from 'vitest';
import { guardAnnotations } from '../src/lib/annotationGuard';
import { forDisplay, forSpeech } from '../src/lib/spokenText';

describe('an ordinary English word keeps its ordinary pronunciation', () => {
  it('drops an invented respelling of a common word', () => {
    expect(guardAnnotations('The [[analysis|uh-nal-uh-sis]] holds.')).toBe('The analysis holds.');
    expect(guardAnnotations('It [[often|off-ten]] happens.')).toBe('It often happens.');
    expect(guardAnnotations('A clear [[hierarchy|hire-arky]].')).toBe('A clear hierarchy.');
  });

  it('leaves the reader’s text identical either way', () => {
    const before = 'The [[analysis|uh-nal-uh-sis]] holds.';
    expect(forDisplay(guardAnnotations(before))).toBe(forDisplay(before));
  });

  it('makes the VOICE read the ordinary spelling instead of the guess', () => {
    expect(forSpeech(guardAnnotations('It [[often|off-ten]] happens.'))).toBe('It often happens.');
  });

  it('drops a respelling that was never a respelling', () => {
    expect(guardAnnotations('[[process|process]] it')).toBe('process it');
  });
});

describe('a term that genuinely needs help keeps it', () => {
  const kept = [
    '[[gnocchi|nyoh-kee]]',
    '[[nginx|engine x]]',
    '[[CUDA|kooda]]',
    '[[GUI|gooey]]',
    '[[PyTorch|pie torch]]',
    '[[Qwen|kwen]]',
    '[[Nguyen|win]]',
    '[[Omakase|oh-mah-kah-seh]]',
    '[[$5,000/mo|five thousand dollars a month]]',
    '[[3.4×|three point four times]]',
    '[[1990s|nineteen nineties]]',
    '[[E=mc²|E equals m c squared]]',
    '[[Aug 2|august second]]',
    '[[Dr.|doctor]]',
    '[[St. Louis|saint louis]]',
    '[[approx.|approximately]]',
    '[[~20%|about twenty percent]]',
  ];
  for (const span of kept) {
    it(`keeps ${span}`, () => {
      expect(guardAnnotations(`before ${span} after`)).toBe(`before ${span} after`);
    });
  }
});

describe('the guard is what the whole speech path runs through', () => {
  // It lives inside forSpeech rather than at any one caller, so narration, tour lines, notes, a
  // rehearsal reply, a briefing and a reel voiceover are all covered by construction.
  it('forSpeech reads the ordinary word, not the invented respelling', () => {
    expect(forSpeech('It [[often|off-ten]] happens.')).toBe('It often happens.');
  });

  it('forSpeech still reads a real respelling', () => {
    expect(forSpeech('We ate [[gnocchi|nyoh-kee]].')).toBe('We ate nyoh-kee.');
  });

  it('forDisplay is unchanged either way — the reader never sees a difference', () => {
    for (const line of ['It [[often|off-ten]] happens.', 'We ate [[gnocchi|nyoh-kee]].']) {
      expect(forDisplay(line)).toBe(forDisplay(guardAnnotations(line)));
    }
  });
});

describe('it is safe to run anywhere, any number of times', () => {
  it('returns unannotated text byte-identical', () => {
    const plain = 'Growth reached 12% in the second half, which is the whole story.';
    expect(guardAnnotations(plain)).toBe(plain);
    expect(guardAnnotations('')).toBe('');
  });

  it('is idempotent', () => {
    const once = guardAnnotations('The [[analysis|uh-nal-uh-sis]] of [[gnocchi|nyoh-kee]].');
    expect(guardAnnotations(once)).toBe(once);
  });

  it('handles several spans in one line, keeping and dropping independently', () => {
    expect(guardAnnotations('[[often|off-ten]] we cook [[gnocchi|nyoh-kee]] here')).toBe(
      'often we cook [[gnocchi|nyoh-kee]] here',
    );
  });

  it('leaves a bare [[x]] span alone — it carries no invented pronunciation', () => {
    expect(guardAnnotations('a [[literal]] span')).toBe('a [[literal]] span');
  });
});
