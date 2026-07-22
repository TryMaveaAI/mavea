// dashboards-talk-intent — pure phrasing check for the "talk to this dashboard" ask box. No model
// call is involved, so this is a plain prefix test: a handful of command verbs mean "add it", anything
// else means "answer it".
import { describe, it, expect } from 'vitest';
import { detectTalkIntent } from '../src/live/dashboards/talkIntent';

describe('detectTalkIntent', () => {
  it('reads a leading command verb as add', () => {
    expect(detectTalkIntent('add yankees scores')).toBe('add');
    expect(detectTalkIntent('track AAPL')).toBe('add');
  });

  it('reads a genuine question as ask', () => {
    expect(detectTalkIntent('is my thesis holding?')).toBe('ask');
    expect(detectTalkIntent('What does AAPL price tell me right now?')).toBe('ask');
  });

  it('is case-insensitive on the command verb', () => {
    expect(detectTalkIntent('ADD tesla')).toBe('add');
  });

  it('tolerates leading whitespace before the command verb', () => {
    expect(detectTalkIntent('   track bitcoin')).toBe('add');
  });

  it('accepts one known false positive as a cheap, reversible trade-off', () => {
    // "Watch out, ..." isn't a command to track anything — but the whole point of a zero-cost
    // prefix check is that it doesn't parse the rest of the sentence. Worst case here is one
    // extra pinned widget, which the auto-add note calls out and the user can remove in a click;
    // that's a fine trade for never spending a model call just to classify the ask box.
    expect(detectTalkIntent('Watch out, is my thesis ok?')).toBe('add');
  });
});
