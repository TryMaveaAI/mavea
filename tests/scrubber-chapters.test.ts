import {
  deriveChapters,
  classifyIntent,
  currentMoment,
  countMoments,
  CHAPTER_PALETTE,
} from '../src/live/scrubber/chapters';
import type { TurnFrame } from '../src/live/history';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { Mode } from '../src/live/lifecycle';

function block(type: string, props: Record<string, unknown>, id?: string): Block {
  return { type, col: 12, ...(id ? { id } : {}), props } as unknown as Block;
}

function frame(question: string, mode: Mode, spec: Partial<ConversationSpec> = {}): TurnFrame {
  return {
    question,
    narration: '',
    mode,
    tour: [],
    spec: { id: 'live', title: '', sub: '', blocks: [], suggests: [], ...spec } as ConversationSpec,
    at: 0,
  };
}

describe('deriveChapters — grouping frames into chapters + moments', () => {
  it('returns nothing for an empty conversation', () => {
    expect(deriveChapters([])).toEqual([]);
  });

  it('starts a chapter on the first frame and on every replace', () => {
    const chapters = deriveChapters([
      frame('Plan three days in Tokyo', 'replace', { title: 'Tokyo Itinerary' }),
      frame('Add a food day', 'augment'),
      frame('Make day two cheaper', 'refine'),
      frame('How should I budget my money', 'replace', { title: 'Monthly Budget' }),
      frame('Prove those subscriptions are wasteful', 'augment'),
    ]);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].moments.map((m) => m.frameIndex)).toEqual([0, 1, 2]);
    expect(chapters[1].moments.map((m) => m.frameIndex)).toEqual([3, 4]);
    expect(chapters[0].title).toBe('Tokyo Itinerary');
    expect(chapters[1].title).toBe('Monthly Budget');
  });

  it('treats the first surviving frame as a chapter start even if it is an augment (cap drop)', () => {
    const chapters = deriveChapters([
      frame('continued thought', 'augment', { title: 'Sleep' }),
      frame('another', 'refine'),
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].moments).toHaveLength(2);
  });

  it('assigns stable, distinct colours per chapter and never uses --text-muted', () => {
    const chapters = deriveChapters([
      frame('a', 'replace'),
      frame('b', 'replace'),
      frame('c', 'replace'),
    ]);
    expect(chapters.map((c) => c.color)).toEqual([
      CHAPTER_PALETTE[0],
      CHAPTER_PALETTE[1],
      CHAPTER_PALETTE[2],
    ]);
    expect(chapters.map((c) => c.color)).not.toContain('var(--text-muted)');
  });

  it('appending a chapter does not recolour the existing ones', () => {
    const base = [frame('a', 'replace'), frame('b', 'replace')];
    const before = deriveChapters(base).map((c) => c.color);
    const after = deriveChapters([...base, frame('c', 'replace')]).map((c) => c.color);
    expect(after.slice(0, 2)).toEqual(before);
  });

  it("uses the answer's own tint as the chapter colour when present", () => {
    const [chapter] = deriveChapters([frame('a', 'replace', { tint: '#ff8800' })]);
    expect(chapter.color).toBe('#ff8800');
  });

  it('falls back from spec.title to a stripped question, then to "Moment"', () => {
    expect(deriveChapters([frame('How can I sleep better?', 'replace')])[0].title).toBe(
      'Can I sleep better?',
    );
    expect(deriveChapters([frame('', 'replace')])[0].title).toBe('Moment');
  });
});

describe('deriveChapters — a moment breaks down into its answer elements', () => {
  it('exposes each navigable block as an element with its id, label, and a kind glyph', () => {
    const [chapter] = deriveChapters([
      frame('Compare the plans', 'replace', {
        blocks: [
          block('compare', { title: 'Plan comparison' }, 'blk-cmp'),
          block('chart', { title: 'Cost over time' }, 'blk-cost'),
        ],
      }),
    ]);
    expect(chapter.moments[0].elements).toEqual([
      { id: 'blk-cmp', label: 'Plan comparison', icon: 'table' },
      { id: 'blk-cost', label: 'Cost over time', icon: 'chart' },
    ]);
  });

  it('lists only blocks that can actually be jumped to (skips id-less + divider furniture)', () => {
    const [chapter] = deriveChapters([
      frame('Show me', 'replace', {
        blocks: [
          block('insight', { title: 'Key finding' }, 'blk-1'),
          block('chart', { title: 'No id, not a card' }), // id-less → not spotlightable
          block('divider', { heading: 'Section two' }, 'blk-div'), // section header, not content
          block('map', { title: 'Where' }, 'blk-map'),
        ],
      }),
    ]);
    expect(chapter.moments[0].elements.map((e) => e.id)).toEqual(['blk-1', 'blk-map']);
  });

  it('dedupes by id and caps a sprawling answer at 8 elements', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      block('insight', { title: 'Point ' + i }, 'blk-' + i),
    );
    const [chapter] = deriveChapters([
      frame('Explain everything', 'replace', {
        blocks: [...many, block('chart', { title: 'dup' }, 'blk-0')],
      }),
    ]);
    expect(chapter.moments[0].elements).toHaveLength(8);
    // the duplicate id never appears twice
    const ids = chapter.moments[0].elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a moment with no navigable blocks an empty element list', () => {
    const [chapter] = deriveChapters([frame('Just talk', 'replace', { blocks: [] })]);
    expect(chapter.moments[0].elements).toEqual([]);
  });
});

describe('classifyIntent — the leading glyph for an ask', () => {
  it('maps wording to the right icon, most-specific first', () => {
    expect(classifyIntent('Build me a CRM from my studio site')).toBe('layers');
    expect(classifyIntent('Show me the data model')).toBe('layers'); // "data model" wins over "show"
    expect(classifyIntent('Prove those subscriptions are wasteful')).toBe('check');
    expect(classifyIntent('Make me a study card I can keep')).toBe('screen');
    expect(classifyIntent('Show me how $200 a month grows')).toBe('sparkle');
    expect(classifyIntent('How have I been sleeping?')).toBe('mic');
  });

  it('respects word boundaries (no "test" inside "latest")', () => {
    expect(classifyIntent("What's the latest news?")).toBe('mic');
  });
});

describe('deriveChapters — the semantic (vectors) boundary', () => {
  /** A unit vector whose cosine with e1 is `cos`, for hand-driving the thread grouping. */
  function unit(cos: number, dim = 8): Float32Array {
    const v = new Float32Array(dim);
    v[0] = cos;
    v[1] = Math.sqrt(Math.max(0, 1 - cos * cos));
    return v;
  }

  it('groups by meaning, overriding the mode hint: a related follow-up stays in one chapter', () => {
    // Both frames are mode 'replace' (what Jaccard emits for two low-overlap asks), but their vectors
    // are close — so with vectors they are ONE chapter, where mode alone would make two.
    const frames = [
      frame('Plan a trip to Portugal', 'replace', { title: 'Portugal Trip' }),
      frame('What about renting a car there', 'replace', { title: 'Renting a Car' }),
    ];
    const vectors = [unit(1), unit(0.9)];
    const chapters = deriveChapters(frames, vectors);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].moments.map((m) => m.frameIndex)).toEqual([0, 1]);
  });

  it('opens a new chapter on a genuine pivot even when the mode hint says augment', () => {
    const frames = [
      frame('Plan a trip to Portugal', 'replace', { title: 'Portugal Trip' }),
      frame('How does diabetes drug discovery work', 'augment', { title: 'Diabetes' }),
    ];
    const vectors = [unit(1), unit(0.05)]; // unrelated → split despite the keep-hint
    expect(deriveChapters(frames, vectors)).toHaveLength(2);
  });

  it('is byte-identical to the mode boundary when no vectors are supplied', () => {
    const frames = [
      frame('a', 'replace', { title: 'A' }),
      frame('b', 'augment'),
      frame('c', 'replace', { title: 'C' }),
      frame('d', 'refine'),
    ];
    expect(deriveChapters(frames, null)).toEqual(deriveChapters(frames));
  });
});

describe('currentMoment + countMoments', () => {
  const chapters = deriveChapters([
    frame('a', 'replace'),
    frame('b', 'augment'),
    frame('c', 'replace'),
  ]);

  it('finds the moment showing on screen and totals them', () => {
    expect(currentMoment(chapters, 1)?.frameIndex).toBe(1);
    expect(currentMoment(chapters, 99)).toBeNull();
    expect(countMoments(chapters)).toBe(3);
  });
});
