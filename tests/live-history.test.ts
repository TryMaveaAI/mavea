import { describe, it, expect } from 'vitest';
import { buildSendHistory, KEEP_RECENT_TURNS } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';

/** Build a synthetic transcript of `n` user+assistant turns. */
function transcript(n: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ role: 'user', content: `question ${i}` });
    out.push({ role: 'assistant', content: `answer ${i}` });
  }
  return out;
}

describe('buildSendHistory — keep recent verbatim, fold older into a recap', () => {
  it('returns a short history unchanged (nothing to compact)', () => {
    const h = transcript(2);
    expect(buildSendHistory(h)).toEqual(h);
  });

  it('keeps only the last N turns verbatim + one recap for a long chat', () => {
    const h = transcript(20);
    const sent = buildSendHistory(h);
    // One recap message + the last KEEP_RECENT_TURNS turns (×2 messages).
    expect(sent.length).toBe(1 + KEEP_RECENT_TURNS * 2);
    expect(sent[0].role).toBe('user');
    expect(sent[0].content).toMatch(/earlier in this conversation/i);
    // The verbatim tail is the genuine most-recent turns.
    expect(sent[sent.length - 2]).toEqual({ role: 'user', content: 'question 19' });
    expect(sent[sent.length - 1]).toEqual({ role: 'assistant', content: 'answer 19' });
  });

  it('the recap mentions the earlier questions (context preserved, cheaply)', () => {
    const sent = buildSendHistory(transcript(10));
    expect(sent[0].content).toContain('question 0');
    expect(sent[0].content).toContain('question 1');
  });

  it('caps the recap length so cost stays flat on a very long chat', () => {
    const sent = buildSendHistory(transcript(500));
    // Recap is bounded (≤ ~650 chars incl. the framing), not proportional to 500 turns.
    expect(sent[0].content.length).toBeLessThan(800);
    expect(sent.length).toBe(1 + KEEP_RECENT_TURNS * 2);
  });

  it('does not mutate the input array', () => {
    const h = transcript(20);
    const copy = h.slice();
    buildSendHistory(h);
    expect(h).toEqual(copy);
  });

  it('respects a custom keepTurns', () => {
    const sent = buildSendHistory(transcript(20), 2);
    expect(sent.length).toBe(1 + 2 * 2);
  });

  it('on a continuation turn, the recap names ONLY the focus thread (no stale-topic drift)', () => {
    // Older turns were about other topics; a topic-less follow-up ("more in depth") pins the thread.
    const sent = buildSendHistory(transcript(20), KEEP_RECENT_TURNS, {
      focusTopic: 'linked lists',
    });
    expect(sent[0].role).toBe('user');
    expect(sent[0].content).toMatch(/continuing the current thread about: linked lists/i);
    // The flat "earlier the user asked about …" recap of every old topic is suppressed.
    expect(sent[0].content).not.toMatch(/earlier in this conversation the user asked about/i);
    expect(sent[0].content).not.toContain('question 0');
  });
});
