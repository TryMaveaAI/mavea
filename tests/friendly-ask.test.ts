import { describe, it, expect } from 'vitest';
import { friendlyAsk } from '../src/live/friendlyAsk';
import { buildBriefPrompt } from '../src/live/brief';
import { sortAsk } from '../src/live/thinkaloud/thinkaloud';

describe('friendlyAsk — synthetic prompts never reach the screen', () => {
  it('maps the morning-brief prompt to a short label', () => {
    const prompt = buildBriefPrompt(['shoulder rehab', 'a 6 pack']);
    // Sanity: the real prompt is the verbose instruction we never want shown.
    expect(prompt).toContain('You are Mavéa, an AI presence');
    expect(prompt).toContain('Do not explain what you are doing');
    expect(friendlyAsk(prompt)).toBe('Morning brief');
  });

  it('maps a correction prompt to "Correction: <fact>"', () => {
    const p =
      'Correction — you understood "Mars is the largest planet", but it\'s actually "Jupiter is the largest planet". Keep the rest of your understanding and update the answer wherever this changes it.';
    expect(friendlyAsk(p)).toBe('Correction: Jupiter is the largest planet');
  });

  it('maps a fuse prompt to "Fuse: A × B"', () => {
    const p =
      'Fuse these two: what is the real relationship between "Revenue" and "Headcount"? Lead with the single most useful connection, and be explicit about correlation versus cause.';
    expect(friendlyAsk(p)).toBe('Fuse: Revenue × Headcount');
  });

  it('maps a legacy keep-live refresh prompt to its question', () => {
    const p =
      'Refresh this — is "S&P 500 today" still current? Re-answer with today\'s real figures, and lead with what (if anything) changed: what is the S&P 500 at';
    expect(friendlyAsk(p)).toBe('S&P 500 today');
  });

  it('maps a sorted think-aloud prompt to its label', () => {
    expect(friendlyAsk(sortAsk(['I should ship the fix', 'or maybe wait'], 3))).toBe(
      'Your thinking, sorted',
    );
  });

  it('maps a mind-map answer prompt to its center', () => {
    const p =
      "I've been thinking out loud and here's what it comes down to: whether to take the job\n\nWants:\n- more pay\n\nPull this together and help me with it.";
    expect(friendlyAsk(p)).toBe('whether to take the job');
  });

  it('returns an ordinary question unchanged', () => {
    expect(friendlyAsk('what is the capital of France?')).toBe('what is the capital of France?');
  });

  it('is idempotent — a label passed back returns itself', () => {
    expect(friendlyAsk('Morning brief')).toBe('Morning brief');
    expect(friendlyAsk(friendlyAsk(buildBriefPrompt([])))).toBe('Morning brief');
  });

  it('handles empty / nullish input', () => {
    expect(friendlyAsk('')).toBe('');
    expect(friendlyAsk(null)).toBe('');
    expect(friendlyAsk(undefined)).toBe('');
  });
});
