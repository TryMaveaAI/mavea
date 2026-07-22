// course-generateCourse.test.ts — generateCourse.ts is the one file in the Courses feature that
// talks to the model and does the real JSON coercion + honest-failure logic (everything else is
// local persistence or pure UI). Pins: the MIN_LESSONS honest-failure path (a fabricated/padded
// syllabus is worse than an error, per the file's own header), the MAX_LESSONS cap against a
// runaway model, the leaner-syllabus guarantee (checkpoints are NOT part of this call — they're
// written lazily by generateCheckpoint, covered in course-generateCheckpoint.test.ts), and the
// fence-stripping/tolerant-JSON-extraction fallback ../deepzoom/generate.ts's identical pattern
// relies on but never got a dedicated test for either.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

const fake = {
  raw: '' as string | object,
  lastReq: null as LiveRequest | null,
  // When set, generate() never resolves on its own — it only rejects when its signal aborts (models
  // a slow-trickling / stalled provider stream, the case the total-time budget guards).
  hang: false,
  // When set, generate() throws it (models a provider transport error like "anthropic 429").
  throwError: null as Error | null,
};

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    id: 'openrouter',
    capabilities: {
      constrainedDecoding: false,
      streaming: true,
      vision: false,
      contextWindow: 8192,
      strengthTier: 'mid' as const,
      nativeWebSearch: false,
    },
    probe: async () => ({ ok: true, model: true }),
    generate: async (req: LiveRequest): Promise<{ raw: string | object }> => {
      fake.lastReq = req;
      if (fake.throwError) throw fake.throwError;
      if (fake.hang) {
        return new Promise((_resolve, reject) => {
          const s = req.signal;
          if (s?.aborted) return reject(new Error('aborted'));
          s?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return { raw: fake.raw };
    },
  }),
}));

import { generateCourse } from '../src/live/course/generateCourse';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

function lesson(i: number): Record<string, unknown> {
  return {
    title: `Lesson ${i}`,
    minutes: 20,
    goal: `Payoff ${i}`,
    objectives: ['do a concrete thing', 'do another concrete thing'],
    concepts: ['concept a', 'concept b'],
  };
}

function syllabus(lessonCount: number): object {
  return {
    title: 'A Real Course',
    subtitle: 'By the end you can do the thing',
    level: 'intermediate',
    lessons: Array.from({ length: lessonCount }, (_, i) => lesson(i + 1)),
  };
}

beforeEach(() => {
  fake.raw = '';
  fake.lastReq = null;
  fake.hang = false;
  fake.throwError = null;
});

describe('generateCourse — happy path', () => {
  it('turns a well-shaped JSON response into a full TopicCourse', async () => {
    fake.raw = JSON.stringify(syllabus(5));
    const course = await generateCourse('linear algebra', cfg);
    expect(course.topic).toBe('linear algebra');
    expect(course.title).toBe('A Real Course');
    expect(course.subtitle).toBe('By the end you can do the thing');
    expect(course.level).toBe('intermediate');
    expect(course.model).toBe(cfg.model);
    expect(course.lessons).toHaveLength(5);
    expect(course.lessons[0]).toMatchObject({
      id: 'l1',
      title: 'Lesson 1',
      goal: 'Payoff 1',
      minutes: 20,
    });
    expect(course.id.length).toBeGreaterThan(0);
    expect(typeof course.createdAt).toBe('number');
  });

  it('an explicit opts.level overrides whatever level the model returned', async () => {
    fake.raw = JSON.stringify(syllabus(4));
    const course = await generateCourse('topic', cfg, { level: 'beginner' });
    expect(course.level).toBe('beginner');
  });

  it('falls back to the topic as the title when the model omits one', async () => {
    const s = syllabus(4) as Record<string, unknown>;
    delete s.title;
    fake.raw = JSON.stringify(s);
    const course = await generateCourse('quantum tunnelling', cfg);
    expect(course.title).toBe('quantum tunnelling');
  });

  it('drops a lesson missing real objectives instead of padding around the gap', async () => {
    const s = syllabus(4) as { lessons: Record<string, unknown>[] };
    s.lessons[1].objectives = ['only one']; // needs >= 2
    fake.raw = JSON.stringify(s);
    const course = await generateCourse('topic', cfg);
    expect(course.lessons).toHaveLength(3);
    expect(course.lessons.map((l) => l.title)).toEqual(['Lesson 1', 'Lesson 3', 'Lesson 4']);
  });
});

describe('generateCourse — MIN_LESSONS honest-failure path', () => {
  it('throws an honest, user-facing error when fewer than 3 usable lessons survive coercion', async () => {
    fake.raw = JSON.stringify(syllabus(2));
    await expect(generateCourse('astrophysics', cfg)).rejects.toThrow(
      /astrophysics.*2 usable lessons/s,
    );
  });

  it('singularizes "1 usable lesson" rather than the grammatically wrong "1 usable lessons"', async () => {
    fake.raw = JSON.stringify(syllabus(1));
    await expect(generateCourse('topic', cfg)).rejects.toThrow(/1 usable lesson came back/);
  });

  it('a completely empty/garbage response (0 lessons) fails the same honest way, never throws a raw parse error', async () => {
    fake.raw = 'not json at all, no braces either';
    await expect(generateCourse('topic', cfg)).rejects.toThrow(/0 usable lessons/);
  });

  it('exactly MIN_LESSONS (3) usable lessons is accepted, not rejected', async () => {
    fake.raw = JSON.stringify(syllabus(3));
    await expect(generateCourse('topic', cfg)).resolves.toBeTruthy();
  });
});

describe('generateCourse — MAX_LESSONS cap', () => {
  it('caps a runaway syllabus of 15 lessons at MAX_LESSONS (9)', async () => {
    fake.raw = JSON.stringify(syllabus(15));
    const course = await generateCourse('topic', cfg);
    expect(course.lessons).toHaveLength(9);
    expect(course.lessons[8].id).toBe('l9');
  });
});

describe('generateCourse — leaner syllabus (checkpoints are lazy, not part of this call)', () => {
  it('ignores any checkpoint the model volunteers — lessons come back without one, so the call stays cheap', async () => {
    const s = syllabus(4) as { lessons: Record<string, unknown>[] };
    // Even if the model pads a checkpoint in unprompted, it's dropped: the syllabus never carries
    // one, and the tokens for it are spent lazily (generateCheckpoint) only when a check is taken.
    s.lessons[0].checkpoint = [
      { question: 'Q?', answer: 'A' },
      { question: 'Q2?', answer: 'A2' },
    ];
    fake.raw = JSON.stringify(s);
    const course = await generateCourse('topic', cfg);
    expect(course.lessons.every((l) => l.checkpoint === undefined)).toBe(true);
  });

  it("the syllabus system prompt no longer even asks for checkpoints (they're written later)", async () => {
    fake.raw = JSON.stringify(syllabus(4));
    await generateCourse('topic', cfg);
    expect(fake.lastReq?.system ?? '').not.toMatch(/checkpoint/i);
  });
});

describe('generateCourse — bounded time + human errors (no silent hang)', () => {
  it('a stream that never completes is stopped by the total-time budget with an honest message', async () => {
    vi.useFakeTimers();
    try {
      fake.hang = true;
      const p = generateCourse('topic', cfg);
      const assertion = expect(p).rejects.toThrow(/took too long/i);
      // Advance past the 90s budget; the internal setTimeout aborts the adapter, which rejects.
      await vi.advanceTimersByTimeAsync(91_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps a raw "429" provider error to a plain rate-limit message (never shown verbatim)', async () => {
    fake.throwError = new Error('anthropic 429');
    await expect(generateCourse('topic', cfg)).rejects.toThrow(/rate-limiting/i);
  });

  it('maps a 401/API-key error to a check-your-key message', async () => {
    fake.throwError = new Error('gemini 401 Unauthorized');
    await expect(generateCourse('topic', cfg)).rejects.toThrow(/check its API key/i);
  });

  it('a deliberate caller-cancel propagates untouched (not reported as a server error)', async () => {
    fake.hang = true;
    const ac = new AbortController();
    const p = generateCourse('topic', cfg, { signal: ac.signal });
    const assertion = expect(p).rejects.toThrow(/aborted/);
    ac.abort();
    await assertion;
  });
});

describe('generateCourse — fence-stripping and tolerant JSON extraction', () => {
  it('strips a ```json fenced response before parsing', async () => {
    fake.raw = '```json\n' + JSON.stringify(syllabus(4)) + '\n```';
    const course = await generateCourse('topic', cfg);
    expect(course.lessons).toHaveLength(4);
  });

  it('strips a bare ``` fence with no language tag', async () => {
    fake.raw = '```\n' + JSON.stringify(syllabus(4)) + '\n```';
    const course = await generateCourse('topic', cfg);
    expect(course.lessons).toHaveLength(4);
  });

  it("recovers a JSON object surrounded by stray prose the model wasn't asked for", async () => {
    fake.raw = `Sure, here is the syllabus:\n${JSON.stringify(syllabus(4))}\nHope that helps!`;
    const course = await generateCourse('topic', cfg);
    expect(course.lessons).toHaveLength(4);
  });

  it('a response that is neither valid JSON nor recoverable via the brace regex fails the honest way, not with a raw SyntaxError', async () => {
    fake.raw = 'I cannot help with that.';
    await expect(generateCourse('topic', cfg)).rejects.toThrow(/0 usable lessons/);
  });
});
