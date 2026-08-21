// The same defect tests/counted-but-blank.test.tsx pins for keyed tables, in the shape an
// UnderstandCard takes: `items` is a plain list, so an entry whose `text` is blank still counts as
// an item and still draws its check circle, its source slot and its "Fix this" button. The card
// then reads as three confident inferences with nothing inferred.
//
// `text` is an HtmlString, so "blank" has to mean blank AFTER rendering: `<b></b>` paints nothing,
// and a zero-width space survives every trim (the lesson readableLabel already learned).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { UnderstandCard } from '../src/canvas/UnderstandCard';
import { readableText, resolvesTextItems } from '../src/canvas/lib/empty';

describe('readableText tells "present" from "shows something"', () => {
  it.each([
    ['plain words', 'You ship on Fridays', true],
    ['marked-up words', 'You ship on <b>Fridays</b>', true],
    ['an empty string', '', false],
    ['whitespace', '   \n\t ', false],
    ['tags with no text', '<b></b><i> </i>', false],
    ['a zero-width space', '​', false],
    ['a zero-width space inside tags', '<b>​</b>', false],
    ['a bare line break', '<br/>', false],
  ])('%s', (_label, text, expected) => {
    expect(readableText(text)).toBe(expected);
  });
});

describe('resolvesTextItems refuses only on positive evidence', () => {
  it('is false when no item would show anything', () => {
    expect(resolvesTextItems('understand', { items: [{ text: '' }, { text: '<b></b>' }] })).toBe(
      false,
    );
  });

  it('is true when even one item carries words — partial data is still data', () => {
    expect(resolvesTextItems('understand', { items: [{ text: '' }, { text: 'Real' }] })).toBe(true);
  });

  it('leaves absence to the validator requires-check', () => {
    expect(resolvesTextItems('understand', { items: [] })).toBe(true);
    expect(resolvesTextItems('understand', {})).toBe(true);
  });

  it('passes any type it does not know about', () => {
    expect(resolvesTextItems('datatable', { items: [{ text: '' }] })).toBe(true);
  });
});

/** `understand` has to be named in the allowed set, the way counted-but-blank names `datatable`. */
const answer = (items: unknown) =>
  validateLiveResponse(
    {
      title: 'About you',
      narration: 'Here is what I picked up.',
      blocks: [{ type: 'understand', props: { title: 'What I learned about you', items } }],
    },
    new Set(['understand']),
    1,
  );

describe('the validator drops an understand card that would render blank', () => {
  it('drops a card whose every item is blank', () => {
    const out = answer([{ text: '' }, { text: '   ' }]);
    expect(out?.blocks.some((b) => b.type === 'understand')).toBe(false);
  });

  it('drops a card whose items are markup with no words', () => {
    const out = answer([{ text: '<b></b>' }]);
    expect(out?.blocks.some((b) => b.type === 'understand')).toBe(false);
  });

  it('keeps a card where at least one item carries words', () => {
    const out = answer([{ text: '' }, { text: 'You publish on Fridays' }]);
    expect(out?.blocks.some((b) => b.type === 'understand')).toBe(true);
  });
});

describe('the renderer drops blank rows too, for frames the validator never sees', () => {
  it('renders only the items that carry words', () => {
    render(
      <UnderstandCard
        items={[{ text: 'You publish on Fridays' }, { text: '' }, { text: '<b></b>' }]}
      />,
    );
    expect(screen.getByText('You publish on Fridays')).toBeInTheDocument();
    // One row, not three — no check circle or "Fix this" button standing over nothing.
    expect(document.querySelectorAll('.understand-row')).toHaveLength(1);
    expect(screen.getAllByTitle('Fix this')).toHaveLength(1);
  });

  it('renders nothing at all when no item carries words', () => {
    const { container } = render(<UnderstandCard items={[{ text: '' }, { text: '​' }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
