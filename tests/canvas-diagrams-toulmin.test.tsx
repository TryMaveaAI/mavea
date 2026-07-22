import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toulmin } from '../src/canvas/blocks/diagrams/Toulmin';

// Toulmin lays the six argument roles along their logical flow. These tests lock the contract the
// Live path depends on: the required roles always draw, the OPTIONAL roles (backing/qualifier/
// rebuttal) appear only when supplied (never as empty cards), an absent title is tolerated, and a
// long field is kept as a single wrapping text node rather than being split or truncated — the
// card grows, it never overflows.

const FULL = {
  title: 'Toulmin Analysis',
  claim: 'Harry is a British citizen.',
  grounds: 'Harry was born in Bermuda.',
  warrant: 'A person born in Bermuda is generally a British citizen.',
  backing: 'On account of the British Nationality Acts.',
  qualifier: 'presumably',
  rebuttal: 'his parents were foreign nationals.',
};

const roleTexts = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('.toul-role-text')).map((n) => n.textContent);

describe('Toulmin', () => {
  it('renders a card for every role when all six are present', () => {
    const { container } = render(<Toulmin {...FULL} />);
    const roles = container.querySelectorAll('.toul-role');
    expect(roles).toHaveLength(5); // grounds, warrant, backing, claim, rebuttal (qualifier is a chip)
    const texts = roleTexts(container).join(' | ');
    expect(texts).toContain('born in Bermuda');
    expect(texts).toContain('British citizen');
    // The qualifier rides the "so" bridge, not a role card.
    expect(container.querySelector('.toul-qual')?.textContent).toBe('presumably');
  });

  it('omits the optional roles when they are absent (no empty cards)', () => {
    const { container } = render(
      <Toulmin claim="C" grounds="G" warrant="W" />, // only the three required
    );
    expect(container.querySelectorAll('.toul-role')).toHaveLength(3);
    expect(container.querySelector('.toul-role--backing')).toBeNull();
    expect(container.querySelector('.toul-role--rebuttal')).toBeNull();
    expect(container.querySelector('.toul-qual')).toBeNull();
    // The "so" bridge still renders as the connective between grounds and claim.
    expect(container.querySelector('.toul-so')).not.toBeNull();
  });

  it('tolerates a missing title and empty/degenerate fields without crashing', () => {
    const { container } = render(<Toulmin claim="" grounds="" warrant="" />);
    expect(container.querySelector('.card-eyebrow')).toBeNull(); // title optional → no eyebrow
    expect(container.querySelectorAll('.toul-role')).toHaveLength(0); // nothing falsy renders a card
    expect(container.querySelector('.card')).not.toBeNull(); // shell still mounts
  });

  it('keeps a long field as one wrapping text node rather than splitting or truncating it', () => {
    const long =
      'A person born in Bermuda is generally a British citizen because the relevant nationality statutes have historically conferred citizenship by place of birth within British territory.';
    const { container } = render(<Toulmin {...FULL} warrant={long} />);
    const warrant = container.querySelector('.toul-role--warrant .toul-role-text');
    expect(warrant?.textContent).toBe(long); // verbatim, no ellipsis
    expect(warrant).not.toBeNull();
  });
});
