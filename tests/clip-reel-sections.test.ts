// `sectionFrames` and `deriveHeading` are the pure, model-free core of the reel's topic sectioning —
// tested directly here (rather than only through the director) so a multi-topic vs. single-topic
// input is unambiguous and doesn't depend on how buildReelFallback happens to render it.
import { describe, expect, it } from 'vitest';
import type { TurnFrame } from '../src/live/history';
import type { ConversationSpec } from '../src/data/conversation';
import { sectionFrames, deriveHeading } from '../src/clip/reel/sections';
import { SLOT_BUDGET } from '../src/clip/reel/reelScript';

function frame(question: string, mode: TurnFrame['mode'], title = ''): TurnFrame {
  return {
    question,
    narration: '',
    mode,
    tour: [],
    at: 0,
    spec: { title, blocks: [] } as unknown as ConversationSpec,
  } as unknown as TurnFrame;
}

describe('sectionFrames', () => {
  it('a single-topic conversation is one section, regardless of length', () => {
    const frames = [
      frame('What are eigenvalues?', 'replace'),
      frame('Why do they matter?', 'augment'),
      frame('Go deeper on SVD', 'refine'),
      frame('One more example', 'augment'),
    ];
    const sections = sectionFrames(frames);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveLength(4);
  });

  it('splits on the SUBJECT boundary: a streamed follow-up (mode replace, topicShift false) stays put', () => {
    const sections = sectionFrames([
      { ...frame('What are eigenvalues?', 'replace'), topicShift: true },
      { ...frame('tell me more', 'replace'), topicShift: false },
      { ...frame('How do I make espresso?', 'replace'), topicShift: true },
    ]);
    expect(sections.map((s) => s.length)).toEqual([2, 1]);
  });

  it('a replace mid-conversation opens a new section', () => {
    const frames = [
      frame('What are eigenvalues?', 'replace'),
      frame('Why do they matter?', 'augment'),
      frame('How do I make espresso?', 'replace'),
      frame('What grind size?', 'refine'),
    ];
    const sections = sectionFrames(frames);
    expect(sections).toHaveLength(2);
    expect(sections[0].map((f) => f.question)).toEqual([
      'What are eigenvalues?',
      'Why do they matter?',
    ]);
    expect(sections[1].map((f) => f.question)).toEqual([
      'How do I make espresso?',
      'What grind size?',
    ]);
  });

  it('the very first frame always opens the first section, whatever its own mode', () => {
    // A capped history whose oldest surviving frame happens to be an augment/refine still gets a
    // home instead of becoming an orphan section.
    const sections = sectionFrames([frame('Continuing from before', 'augment')]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveLength(1);
  });

  it('three real topic changes make three sections, in order', () => {
    const frames = [
      frame('Topic A', 'replace'),
      frame('Topic B', 'replace'),
      frame('More on B', 'augment'),
      frame('Topic C', 'replace'),
    ];
    const sections = sectionFrames(frames);
    expect(sections.map((s) => s.map((f) => f.question))).toEqual([
      ['Topic A'],
      ['Topic B', 'More on B'],
      ['Topic C'],
    ]);
  });

  it('handles an empty conversation', () => {
    expect(sectionFrames([])).toEqual([]);
  });
});

describe('deriveHeading', () => {
  it("prefers the conversation's own short title over the raw question", () => {
    const heading = deriveHeading([
      frame('What are eigenvalues and eigenvectors?', 'replace', 'Eigenvalues'),
    ]);
    expect(heading).toBe('Eigenvalues');
  });

  it('falls back to the first clause of the question, question-word stripped', () => {
    const heading = deriveHeading([frame('How does gradient descent converge?', 'replace')]);
    expect(heading.toLowerCase()).not.toMatch(/^how\b/);
    expect(heading).toMatch(/gradient descent/i);
  });

  it('takes only the first clause, not a run-on sentence', () => {
    const heading = deriveHeading([
      frame('What is inflation, and how does the Fed respond to it?', 'replace'),
    ]);
    expect(heading.length).toBeLessThanOrEqual(SLOT_BUDGET.heading);
    expect(heading.toLowerCase()).not.toContain('fed');
  });

  it('never exceeds the heading budget, even for a long title', () => {
    const longTitle = 'A Very Long Answer Title That Goes On For Quite A While Indeed';
    const heading = deriveHeading([frame('irrelevant', 'replace', longTitle)]);
    expect(heading.length).toBeLessThanOrEqual(SLOT_BUDGET.heading);
  });

  it('degrades to empty (never invents text) when there is nothing usable', () => {
    expect(deriveHeading([frame('', 'replace', '')])).toBe('');
    expect(deriveHeading([])).toBe('');
  });
});
