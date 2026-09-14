import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeEntities, plainFromMarkup, stripTags } from '../src/lib/plainText';
import { plain } from '../src/export/model/normalize';

describe('plain text from markup', () => {
  it('leaves no tag behind, and no fragment of one', () => {
    // Pinned as words, not as "does not match /<[^>]*>/": the residue a mis-read tag leaves is
    // its own attribute tail ('">hi'), which carries no "<" and so passes that pattern while
    // carrying exactly the characters the strip was meant to remove. The one input that does keep
    // a fragment is the crafted one below, which has its own case because the ceiling is a
    // stated behaviour.
    const cases: Array<[string, string]> = [
      ['<b>bold</b>', 'bold'],
      ['<b <i>>bold', '>bold'],
      ['<<a>b>x', 'x'],
      ['<p class=">">hi</p>', 'hi'],
      ['<!--<b-->i>', 'i>'],
    ];
    for (const [raw, want] of cases) expect(stripTags(raw), raw).toBe(want);
  });

  it('reads a quoted attribute value whole, ">" and all', () => {
    // MessageDraft renders the body through the sanitizer, which parses this correctly and paints
    // "link". Ending the tag at the first ">" copied ' b">link' to the clipboard instead, so the
    // clipboard disagreed with the card on exactly the markup it was stripping.
    expect(stripTags('<a title="a > b">link</a>')).toBe('link');
    expect(stripTags("<a title='a > b'>link</a>")).toBe('link');
    expect(plainFromMarkup('<td data-x="1>2">7</td>')).toBe('7');
  });

  it('treats a quote in an UNQUOTED value as an ordinary character', () => {
    // A quote only opens a value straight after the "=". Read as an opening anywhere in the tag,
    // the apostrophe in `class=o'brien` runs to the next apostrophe — the one in the element's own
    // words — and takes the whole sentence with it, so a card with text on screen copies as empty
    // and canvas/lib/empty judges the block blank. Every expectation here is what DOMParser gives.
    expect(stripTags("<em class=o'brien>O'Brien wrote it</em>")).toBe("O'Brien wrote it");
    expect(stripTags("<p class=it's>Tom's dog</p>")).toBe("Tom's dog");
    expect(stripTags('<b class=5">x"y</b>')).toBe('x"y');
    // Whitespace around the "=" is still a quoted value, since a parser reads it as one.
    expect(stripTags('<a title = "a > b">link</a>')).toBe('link');
  });

  it('ends an unbalanced quote at the first ">", rather than eating the prose after it', () => {
    // The quote never closes inside its own tag, so treating it as a value would run to the next
    // tag's attributes and take the sentence between them along — a whole missing paragraph is
    // worse than a stray tag.
    expect(stripTags('<a title="x> hello <b class="y">')).toBe(' hello ');
  });

  it('strips nesting a reader could author, and stops where MAX_PASSES says', () => {
    // Each level costs one pass: a leftover "<" closes up against what the removed tag left
    // behind and forms a fresh opening.
    expect(stripTags('<'.repeat(8) + 'b>'.repeat(8))).toBe('');
    expect(stripTags('<'.repeat(16) + 'script>'.repeat(16))).toBe('');
    // Past the ceiling the loop hands back what it has — text, for callers that only ever treat
    // it as text. Pinned so the bound stays a stated behaviour rather than a surprise.
    expect(stripTags('<'.repeat(20) + 'script>'.repeat(20))).toBe(
      '<'.repeat(4) + 'script>'.repeat(4),
    );
  });

  it('drops a comment whose body contains a ">"', () => {
    // One pass of a tag regex stops at that inner ">" and hands the comment's own words to the
    // reader as if the author had written them.
    expect(plainFromMarkup('Total <!-- note > here --> paid')).toBe('Total paid');
  });

  it('keeps a comparison — "<" with no tag name after it is arithmetic, not markup', () => {
    expect(plainFromMarkup('3 < 4 and 5 > 4')).toBe('3 < 4 and 5 > 4');
    expect(plainFromMarkup('margin < 5% <b>today</b>')).toBe('margin < 5% today');
  });

  it('decodes each entity once, so escaped markup stays escaped', () => {
    expect(decodeEntities('&amp;amp;')).toBe('&amp;');
    expect(plainFromMarkup('&amp;lt;b&amp;gt; is how you write a bold tag')).toBe(
      '&lt;b&gt; is how you write a bold tag',
    );
  });

  it('decodes the entities real content uses', () => {
    expect(plainFromMarkup('Fuji&nbsp;is 3,776&nbsp;m &mdash; &quot;tall&quot; &amp; cold')).toBe(
      'Fuji is 3,776 m — "tall" & cold',
    );
  });

  it('separates runs only when asked, so adjacent inline tags do not gain a space', () => {
    expect(plainFromMarkup('<w:t>one</w:t><w:t>two</w:t>', ' ')).toBe('one two');
    expect(plainFromMarkup('<b>one</b><i>two</i>')).toBe('onetwo');
  });

  it('the export model reads markup the same way', () => {
    expect(plain('<p>Revenue &amp;lt;5%&nbsp;of total</p>')).toBe('Revenue &lt;5% of total');
  });
});

describe('the callers that took a local regex read the one seam', () => {
  // Each of these once carried its own `replace(/<[^>]*>/g, '')`, and nothing else pins them
  // here — so reverting one to a local regex would be invisible, and a local regex is precisely
  // the incompleteness the cases above are about.
  //
  // Three markup strips are deliberately NOT on this list, because they are not this seam:
  // spokenText's `forDisplay` and voice/tts's `sayable` strip as a SAFETY measure on text already
  // headed for a reader or a synthesizer — decoding entities there would turn an escaped
  // `&lt;script&gt;` back into live markup — and live/content/notableIn strips inside a scorer
  // that wants no entity decoding either. Adding one to this list means changing what it does.
  const callers = [
    'canvas/blocks/compose/MessageDraft.tsx',
    'canvas/blocks/layout/Deflist.tsx',
    'canvas/blocks/learn/quizResult.ts',
    'canvas/lib/empty.ts',
    'export/model/normalize.ts',
    'live/prism/officeDoc.ts',
    'live/search/brave.ts',
    'live/search/tavily.ts',
    'live/search/wikipedia.ts',
    'live/srs/extractCards.ts',
    'live/srs/suggestCards.ts',
  ];

  it.each(callers)('%s takes its plain text from lib/plainText', (file) => {
    const src = readFileSync(join(__dirname, '..', 'src', file), 'utf8');
    expect(src).toMatch(
      /import \{[^}]*(?:stripTags|decodeEntities|plainFromMarkup)[^}]*\} from '[./]*lib\/plainText'/,
    );
    expect(src).not.toMatch(/<\[\^>\]\*>/);
  });
});
