import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ParseTree } from '../src/canvas/blocks/learn/ParseTree';
import type { ParseTreeNode } from '../src/canvas/blocks/learn/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: every leaf word, POS tag, and phrase label is centred on a
// fixed 62px-wide (LEAF_GAP) slot with no width check — the demo fixture's short words ("the",
// "fox") and short tags ("N", "V", "NP") fit, but a model-authored long word
// ("Congratulations") or a multi-word phrase label ("Prepositional Phrase") runs well past its
// slot and bleeds into the neighbouring leaf.

describe('ParseTree', () => {
  it('truncates a long leaf word and POS tag instead of letting them overflow their slot', () => {
    const root: ParseTreeNode = {
      label: 'S',
      children: [
        { label: 'INTERJ', word: 'Congratulations' },
        { label: 'ADVERBIAL-PHRASE-MODIFIER', word: 'wholeheartedly' },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const wordNodes = Array.from(container.querySelectorAll('text.prs-word'));
    const posNodes = Array.from(container.querySelectorAll('text.prs-pos'));
    expect(wordNodes).toHaveLength(2);
    expect(posNodes).toHaveLength(2);

    // Every rendered label's visible glyphs must fit inside the 62px leaf slot at its font-size —
    // none may be long enough to bleed into a neighbouring leaf.
    for (const node of [...wordNodes, ...posNodes]) {
      expect(visibleText(node).length).toBeLessThanOrEqual(10);
    }
    expect(visibleText(wordNodes[0]).endsWith('…')).toBe(true);
    expect(visibleText(posNodes[1]).endsWith('…')).toBe(true);

    // The untruncated strings are still available, via native <title> tooltips.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Congratulations');
    expect(titles).toContain('ADVERBIAL-PHRASE-MODIFIER');
  });

  it('truncates a long phrase (internal node) label', () => {
    const root: ParseTreeNode = {
      label: 'PREPOSITIONAL-PHRASE-MODIFIER',
      children: [
        { label: 'P', word: 'under' },
        { label: 'N', word: 'bridge' },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const phraseNode = container.querySelector('text.prs-phrase');
    expect(phraseNode).toBeTruthy();
    expect(visibleText(phraseNode!).length).toBeLessThanOrEqual(10);
    expect(visibleText(phraseNode!).endsWith('…')).toBe(true);
    const title = phraseNode!.querySelector('title');
    expect(title?.textContent).toBe('PREPOSITIONAL-PHRASE-MODIFIER');
  });

  it('leaves short words, tags, and phrase labels untouched', () => {
    const root: ParseTreeNode = {
      label: 'S',
      children: [
        {
          label: 'NP',
          children: [
            { label: 'Det', word: 'The' },
            { label: 'N', word: 'fox' },
          ],
        },
        { label: 'VP', children: [{ label: 'V', word: 'jumps' }] },
      ],
    };
    const { container } = render(<ParseTree title="Parse" root={root} />);

    const wordNodes = Array.from(container.querySelectorAll('text.prs-word'));
    expect(wordNodes.map((n) => n.textContent)).toEqual(['The', 'fox', 'jumps']);
    const phraseNodes = Array.from(container.querySelectorAll('text.prs-phrase'));
    expect(phraseNodes.map((n) => n.textContent)).toEqual(['S', 'NP', 'VP']);
    expect(container.querySelector('title')).toBeNull();
  });
});
