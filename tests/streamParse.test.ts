import {
  extractNarration,
  extractStringField,
  completedBlocks,
  extractNarrationProgress,
  nextSpeakableChunk,
  ArrayStreamScanner,
} from '../src/live/streamParse';

// Locks the narration-first parser — the mechanism that lets the face speak the
// spoken line the instant it streams in, before the blocks finish. If this
// regresses, the "feels real-time" property quietly breaks.
describe('extractNarration', () => {
  it('returns the complete narration once its closing quote arrives', () => {
    expect(extractNarration('{"narration":"Here is a simple split.","title":"X"')).toBe(
      'Here is a simple split.',
    );
  });

  it('returns null while the value is still streaming (no closing quote yet)', () => {
    expect(extractNarration('{"narration":"Here is a simple spl')).toBeNull();
  });

  it('returns null before the value even starts', () => {
    expect(extractNarration('{"narration":')).toBeNull();
    expect(extractNarration('{"narrat')).toBeNull();
  });
});

describe('sentence-first narration streaming', () => {
  it('exposes the in-progress narration prefix before the closing quote', () => {
    expect(extractNarrationProgress('{"narration":"Here is the')).toEqual({
      text: 'Here is the',
      done: false,
    });
    expect(extractNarrationProgress('{"narration":"All done.","title":"X"')).toEqual({
      text: 'All done.',
      done: true,
    });
    expect(extractNarrationProgress('{"title":"X"')).toBeNull();
  });

  it('speaks one sentence at a time as the line streams, then the tail on close', () => {
    // Simulate the spoken line arriving in chunks; collect what we would speak each step.
    const spokenChunks: string[] = [];
    let spokenLen = 0;
    const feed = (buf: string) => {
      const prog = extractNarrationProgress(buf)!;
      const { chunk, consumed } = nextSpeakableChunk(prog.text, spokenLen, prog.done);
      if (chunk) {
        spokenChunks.push(chunk);
        spokenLen = consumed;
      }
    };
    feed('{"narration":"First point here. Second'); // first sentence complete
    feed('{"narration":"First point here. Second point too. And'); // second complete
    feed('{"narration":"First point here. Second point too. And the rest.","title":"X"'); // done → tail
    expect(spokenChunks).toEqual(['First point here.', 'Second point too.', 'And the rest.']);
  });

  it('waits — speaks nothing — until a full sentence has formed', () => {
    const prog = extractNarrationProgress('{"narration":"a half written thought with no end yet')!;
    expect(nextSpeakableChunk(prog.text, 0, prog.done).chunk).toBe('');
  });

  it('returns null when there is no narration key', () => {
    expect(extractNarration('{"title":"X","blocks":[]}')).toBeNull();
  });

  it('unescapes common sequences', () => {
    expect(extractNarration('{"narration":"line one\\nline two"}')).toBe('line one\nline two');
    expect(extractNarration('{"narration":"she said \\"hi\\""}')).toBe('she said "hi"');
  });

  it('waits when an escape is split across the boundary', () => {
    // buffer ends mid-escape — must not throw, must return null until more arrives
    expect(extractNarration('{"narration":"ends with \\')).toBeNull();
  });

  it('tolerates leading prose / code fences and whitespace before the value', () => {
    expect(extractNarration('Sure!\n```json\n{ "narration" : "Hello there" }')).toBe('Hello there');
  });
});

// Locks the generic field extractor — used for the streaming title alongside narration.
describe('extractStringField', () => {
  it('reads any top-level string field once its closing quote arrives', () => {
    expect(extractStringField('{"narration":"hi","title":"Budget"', 'title')).toBe('Budget');
  });
  it('returns null while the field is mid-stream or absent', () => {
    expect(extractStringField('{"title":"Bud', 'title')).toBeNull();
    expect(extractStringField('{"narration":"hi"}', 'title')).toBeNull();
  });
});

// Locks the progressive block extractor — the mechanism that lets the canvas reveal
// each block the instant it closes, so blocks fill in WITH the voice (not after).
describe('completedBlocks', () => {
  it('returns [] before the blocks array opens', () => {
    expect(completedBlocks('{"narration":"hi","title":"T"')).toEqual([]);
    expect(completedBlocks('{"blocks":')).toEqual([]);
  });

  it('returns only the blocks whose closing brace has arrived', () => {
    const buf =
      '{"narration":"hi","blocks":[{"type":"insight","props":{"title":"A"}},{"type":"kpi","prop';
    const blocks = completedBlocks(buf) as { type: string }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('insight');
  });

  it('grows as more blocks complete', () => {
    const buf =
      '{"blocks":[{"type":"insight","props":{"title":"A"}},{"type":"kpi","props":{"title":"B"}}]}';
    const blocks = completedBlocks(buf) as { type: string }[];
    expect(blocks.map((b) => b.type)).toEqual(['insight', 'kpi']);
  });

  it('is not fooled by braces or brackets inside string values', () => {
    const buf = '{"blocks":[{"type":"insight","props":{"title":"a } ] { weird"}}]}';
    const blocks = completedBlocks(buf) as { type: string; props: { title: string } }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].props.title).toBe('a } ] { weird');
  });

  it('stops at the end of the blocks array (ignores trailing fields)', () => {
    const buf = '{"blocks":[{"type":"insight","props":{}}],"chips":["x"]}';
    expect(completedBlocks(buf)).toHaveLength(1);
  });
});

// Locks the incremental scanner the live turn actually streams through — one pass over the
// stream however many deltas it arrives in, with each block parsed exactly once. Every case
// is fed one character at a time, the adversarial version of real delta boundaries: any
// state the scanner fails to carry across a push shows up here as a wrong answer.
describe('ArrayStreamScanner', () => {
  const charByChar = (buf: string): ArrayStreamScanner => {
    const scanner = new ArrayStreamScanner('blocks');
    for (let i = 1; i <= buf.length; i++) scanner.scan(buf.slice(0, i));
    return scanner;
  };

  it('matches the pure parser on every prefix of a streaming reply', () => {
    const full =
      'Sure!\n{"narration":"hi","blocks":[{"type":"insight","props":{"title":"a } ] { weird"}},' +
      '{"type":"kpi","props":{"note":"esc \\" quote"}}],"chips":["x"]}';
    const scanner = new ArrayStreamScanner('blocks');
    for (let i = 1; i <= full.length; i++) {
      scanner.scan(full.slice(0, i));
      expect(scanner.items).toEqual(completedBlocks(full.slice(0, i)));
    }
  });

  it('parses each block once, the moment its closing brace arrives', () => {
    const scanner = new ArrayStreamScanner('blocks');
    let buf = '{"blocks":[{"type":"insight","props":{"title":"A"}';
    scanner.scan(buf);
    expect(scanner.items).toHaveLength(0);
    scanner.scan((buf += '}'));
    expect(scanner.items).toHaveLength(1);
    const first = scanner.items[0];
    scanner.scan(buf + ',{"type":"kpi","props":{}}');
    expect(scanner.items).toHaveLength(2);
    expect(scanner.items[0]).toBe(first); // not re-parsed on later scans
  });

  it('skips a malformed element and keeps the rest', () => {
    const scanner = charByChar('{"blocks":[{"type":"kpi",,,},{"type":"insight","props":{}}]');
    expect((scanner.items as { type: string }[]).map((b) => b.type)).toEqual(['insight']);
  });

  const prefix = '{"narration":"Up 2.4% today.","title":"NVDA","blocks":[';

  it('reads the trailing unclosed block’s type the moment it parses', () => {
    expect(
      charByChar(prefix + '{"type":"insight","props":{"title":"x"}},{"type":"bars"').pendingType(),
    ).toBe('bars');
  });

  it('has no pending type between blocks or after the array closes', () => {
    expect(charByChar(prefix + '{"type":"insight","props":{}},').pendingType()).toBeNull();
    expect(charByChar(prefix + '{"type":"insight","props":{}}]').pendingType()).toBeNull();
  });

  it('has no pending type while the type key itself is still arriving', () => {
    expect(charByChar(prefix + '{"ty').pendingType()).toBeNull();
  });

  it('pending type ignores braces inside strings', () => {
    expect(
      charByChar(
        prefix + '{"type":"quote","props":{"text":"a {brace} inside"}},{"type":"kpi"',
      ).pendingType(),
    ).toBe('kpi');
  });

  it('has no pending type without a blocks array', () => {
    expect(charByChar('{"narration":"hi"').pendingType()).toBeNull();
  });
});
