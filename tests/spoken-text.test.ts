import { describe, expect, it } from 'vitest';
import {
  collapseRepeatedValues,
  forDisplay,
  forSpeech,
  hasAnnotation,
  proseForDisplay,
  proseForSpeech,
  stripLinks,
} from '../src/lib/spokenText';

// The model marks tricky spans inline as [[shown|said]]; forDisplay keeps the shown side (screen)
// and forSpeech keeps the said side (voice). One string, parsed two ways.
describe('spokenText — [[shown|said]] parsing', () => {
  it('forDisplay keeps the shown side; forSpeech keeps the said side', () => {
    const s = 'It runs on a [[$5,000/mo|five thousand dollars a month]] rig with [[CUDA|kooda]].';
    expect(forDisplay(s)).toBe('It runs on a $5,000/mo rig with CUDA.');
    expect(forSpeech(s)).toBe('It runs on a five thousand dollars a month rig with kooda.');
  });

  it('handles an equation span', () => {
    const s = '[[E=mc²|E equals m c squared]] ties energy to mass.';
    expect(forDisplay(s)).toBe('E=mc² ties energy to mass.');
    expect(forSpeech(s)).toBe('E equals m c squared ties energy to mass.');
  });

  it('treats a bare [[x]] span as the same text on both sides', () => {
    expect(forDisplay('say [[exactly]] this')).toBe('say exactly this');
    expect(forSpeech('say [[exactly]] this')).toBe('say exactly this');
  });

  it('drops a dangling, still-streaming "[[…" so brackets are never shown or spoken', () => {
    const partial = 'It uses [[CUDA|koo';
    expect(forDisplay(partial)).toBe('It uses');
    expect(forSpeech(partial)).toBe('It uses');
  });

  it('leaves un-annotated text untouched', () => {
    const plain = 'A calm sentence with nothing tricky.';
    expect(forDisplay(plain)).toBe(plain);
    expect(forSpeech(plain)).toBe(plain);
  });

  it('hasAnnotation detects an opening marker', () => {
    expect(hasAnnotation('a [[b|c]] d')).toBe(true);
    expect(hasAnnotation('plain text')).toBe(false);
  });

  it('resolves a malformed, nested annotation instead of leaking a raw "shown|said" pair', () => {
    const s = 'outer [[a [[nested|x]] b|said]] end';
    expect(forDisplay(s)).toBe('outer a nested b end');
    expect(forSpeech(s)).toBe('outer said end');
  });
});

// A search-grounded answer sometimes echoes a source inline as a markdown link or bare URL, which
// renders as literal "[fifa.com](https://…)" on the card and reads as gibberish aloud — while the
// real sources already show in the answer's SOURCES footer. stripLinks (folded into forDisplay and
// forSpeech) keeps the prose clean without touching that footer, which lives on a separate field.
describe('spokenText — stripLinks', () => {
  it('drops a citation parenthetical (markdown link) whole, leaving clean prose', () => {
    const s =
      'The tournament runs to the final on Sunday, July 19, 2026. ([fifa.com](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexico2026/schedule?cm_s=1))';
    expect(stripLinks(s)).toBe('The tournament runs to the final on Sunday, July 19, 2026.');
    expect(proseForDisplay(s)).toBe('The tournament runs to the final on Sunday, July 19, 2026.');
    // Plain forDisplay must NOT strip links — block props (an image src) rely on it.
    expect(forDisplay('src is [x](https://example.com/a.jpg)')).toContain('https://example.com');
  });

  it('drops a bare-URL parenthetical citation', () => {
    expect(stripLinks('Kickoff is confirmed (https://fifa.com/schedule).')).toBe(
      'Kickoff is confirmed.',
    );
  });

  it('keeps the visible text of a standalone markdown link, drops its URL', () => {
    expect(stripLinks('See [the schedule](https://fifa.com/x) for details.')).toBe(
      'See the schedule for details.',
    );
  });

  it('removes a stray bare URL sitting in prose', () => {
    expect(stripLinks('More at https://fifa.com/schedule today.')).toBe('More at today.');
  });

  it('strips links for the voice too, so a URL is never read aloud', () => {
    const s = 'The final is July 19. ([fifa.com](https://www.fifa.com/schedule))';
    expect(proseForSpeech(s)).toBe('The final is July 19.');
  });

  it('drops a still-streaming, half-arrived citation instead of flashing raw brackets', () => {
    expect(proseForDisplay('The final is July 19. ([fifa.com](https://www.fif')).toBe(
      'The final is July 19.',
    );
  });

  it('leaves ordinary parentheticals and link-free prose untouched', () => {
    expect(stripLinks('Half to needs (the non-negotiables), a third to wants.')).toBe(
      'Half to needs (the non-negotiables), a third to wants.',
    );
    expect(stripLinks('A calm sentence with nothing tricky.')).toBe(
      'A calm sentence with nothing tricky.',
    );
  });
});

// A blank-completion turn occasionally restates a filled value back-to-back; collapseRepeatedValues
// is the deterministic floor that keeps "$200, $200" off the screen and out of the voice.
describe('spokenText — collapseRepeatedValues', () => {
  it('collapses an immediately-repeated currency value', () => {
    expect(collapseRepeatedValues('Your comp is $200, $200 today.')).toBe(
      'Your comp is $200 today.',
    );
    expect(collapseRepeatedValues('It costs 200 dollars 200 dollars.')).toBe(
      'It costs 200 dollars.',
    );
  });

  it('folds a triple down to a single value', () => {
    expect(collapseRepeatedValues('$5, $5, $5')).toBe('$5');
  });

  it('collapses a repeat regardless of case in the unit word', () => {
    expect(collapseRepeatedValues('200 Dollars 200 dollars')).toBe('200 Dollars');
  });

  it('keeps two DIFFERENT values and legitimate phrasing untouched', () => {
    expect(collapseRepeatedValues('from $200 to $100,000')).toBe('from $200 to $100,000');
    expect(collapseRepeatedValues('grew from 200 to 200% of plan')).toBe(
      'grew from 200 to 200% of plan',
    );
    expect(collapseRepeatedValues('$200 and $200 each')).toBe('$200 and $200 each');
  });

  it('leaves value-free text alone', () => {
    expect(collapseRepeatedValues('A calm sentence.')).toBe('A calm sentence.');
  });
});
