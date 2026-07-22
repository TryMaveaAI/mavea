import { describe, expect, it } from 'vitest';
import { sharedUrl, looksLikeShare, claimCheckAsk } from '../src/live/shareIn';

// Share-to-Mavéa intake: a bare pasted link (± a few words) is a share; a written sentence
// that happens to contain a link is the user's own ask and stays untouched.

describe('sharedUrl', () => {
  it('finds the link and trims prose punctuation', () => {
    expect(sharedUrl('look: https://example.com/story?id=1.')).toBe(
      'https://example.com/story?id=1',
    );
    expect(sharedUrl('no link here')).toBeNull();
  });
});

describe('looksLikeShare', () => {
  it('a bare link or link-with-a-comment is a share', () => {
    expect(looksLikeShare('https://x.com/some/claim')).toBe(true);
    expect(looksLikeShare('is this real?? https://x.com/some/claim')).toBe(true);
  });
  it('a full written sentence containing a link is not', () => {
    expect(
      looksLikeShare(
        'I was reading https://example.com yesterday and it made me think about how the refinance market has been shifting since the last rate decision and whether we should revisit our plan',
      ),
    ).toBe(false);
    expect(looksLikeShare('plain text with no link at all')).toBe(false);
  });
});

describe('claimCheckAsk', () => {
  it('asks for grounded verdicts about the exact link', () => {
    const ask = claimCheckAsk('https://x.com/claim');
    expect(ask).toContain('https://x.com/claim');
    expect(ask).toMatch(/true.*shaky.*missing context/i);
    expect(ask).toMatch(/real sources/i);
  });
});
