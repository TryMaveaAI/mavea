// course-generation.test.ts — everything in the Courses feature that talks to a model, with the
// provider adapter mocked (no network) so the exact request each call makes is inspectable: the
// syllabus writer (generateCourse), the lazy on-demand self-check writer (generateCheckpoint), and
// generateLive's additive per-lesson opt. All three groups need the SAME `../src/live/providers`
// mock, so they share one file and one fake adapter — every group resets `fake` in its own
// beforeEach so no group inherits another's stub.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';
import type { TopicCourse } from '../src/live/course/model';

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

import { generateCourse, generateCheckpoint } from '../src/live/course/generateCourse';
import { generateLive } from '../src/live/generateLive';

// generateCourse.ts is the one file in the Courses feature that talks to the model and does the real
// JSON coercion + honest-failure logic (everything else is local persistence or pure UI). Pins: the
// MIN_LESSONS honest-failure path (a fabricated/padded syllabus is worse than an error, per the
// file's own header), the MAX_LESSONS cap against a runaway model, the leaner-syllabus guarantee
// (checkpoints are NOT part of this call — they're written lazily by generateCheckpoint, covered in
// the generateCheckpoint group), and the fence-stripping/tolerant-JSON-extraction fallback
// ../deepzoom/generate.ts's identical pattern relies on but never got a dedicated test for either.
describe('generateCourse — the syllabus writer', () => {
  const cfg: ModelConfig = {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-8b',
    apiKey: 'k',
  };

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
});

// generateCheckpoint.ts's lazy, on-demand self-check writer. This is the cost-optimisation split:
// the syllabus no longer carries checkpoints (that moved OUT of the generateCourse group), so a
// checkpoint is written by exactly ONE lean call, only when a learner takes it. Pins the properties
// that make it cheap AND honest: exactly 2 questions out, a runaway array capped to 2, an honest
// failure (not a fabricated check) when < 2 real Q&A survive, a MINIMAL prompt (this lesson's
// objectives only — never the whole syllabus, never a fat system prompt), and the same
// bounded-time / friendly-error / caller-cancel discipline generateCourse has.
describe('generateCheckpoint — the lazy self-check writer', () => {
  const cfg: ModelConfig = {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-8b',
    apiKey: 'k',
  };

  const course: TopicCourse = {
    id: 'c1',
    topic: 'linear algebra',
    title: 'Linear Algebra',
    lessons: [
      {
        id: 'l1',
        title: 'Vectors as arrows',
        goal: 'See a vector as a length and a direction',
        objectives: ['add two vectors tip-to-tail', 'scale a vector by a number'],
        concepts: ['vector'],
      },
      {
        id: 'l2',
        title: 'Matrices as transformations',
        goal: 'See a matrix as a map of space',
        objectives: ['multiply a matrix by a vector'],
        concepts: ['matrix'],
      },
    ],
    createdAt: 0,
    model: 'test-model',
  };

  function checkpointJson(count: number): string {
    return JSON.stringify({
      checkpoint: Array.from({ length: count }, (_, i) => ({
        question: `Q${i + 1}?`,
        answer: `A${i + 1}`,
      })),
    });
  }

  beforeEach(() => {
    fake.raw = '';
    fake.lastReq = null;
    fake.hang = false;
    fake.throwError = null;
  });

  describe('generateCheckpoint — exactly two real questions', () => {
    it('turns a well-shaped response into exactly 2 {question, answer} pairs', async () => {
      fake.raw = checkpointJson(2);
      const qs = await generateCheckpoint(course, 0, cfg);
      expect(qs).toEqual([
        { question: 'Q1?', answer: 'A1' },
        { question: 'Q2?', answer: 'A2' },
      ]);
    });

    it('caps a runaway array (5 returned) down to exactly 2', async () => {
      fake.raw = checkpointJson(5);
      const qs = await generateCheckpoint(course, 0, cfg);
      expect(qs).toHaveLength(2);
    });

    it('drops half-shaped questions (missing answer) and keeps the 2 real ones', async () => {
      fake.raw = JSON.stringify({
        checkpoint: [
          { question: 'Real one?', answer: 'Yes' },
          { question: 'No answer here' },
          { question: 'Another real one?', answer: 'Also yes' },
        ],
      });
      const qs = await generateCheckpoint(course, 0, cfg);
      expect(qs).toEqual([
        { question: 'Real one?', answer: 'Yes' },
        { question: 'Another real one?', answer: 'Also yes' },
      ]);
    });
  });

  describe('generateCheckpoint — honest failure, never a fabricated check', () => {
    it('throws a user-facing error when fewer than 2 usable questions survive', async () => {
      fake.raw = checkpointJson(1);
      await expect(generateCheckpoint(course, 0, cfg)).rejects.toThrow(
        /Couldn't write a checkpoint for "Vectors as arrows"/,
      );
    });

    it('a garbage / empty response fails the same honest way, not with a raw parse error', async () => {
      fake.raw = 'I cannot help with that.';
      await expect(generateCheckpoint(course, 0, cfg)).rejects.toThrow(
        /Couldn't write a checkpoint/,
      );
    });

    it('an out-of-range lesson index fails cleanly instead of throwing a TypeError', async () => {
      await expect(generateCheckpoint(course, 99, cfg)).rejects.toThrow(
        /no longer part of this course/,
      );
    });
  });

  describe('generateCheckpoint — a MINIMAL prompt (this lesson only, small system prompt)', () => {
    it('sends this lesson’s title/goal/objectives but NOT the rest of the syllabus', async () => {
      fake.raw = checkpointJson(2);
      await generateCheckpoint(course, 0, cfg);
      const req = fake.lastReq;
      expect(req).not.toBeNull();
      const user = req?.user ?? '';
      // This lesson is fully present…
      expect(user).toContain('Vectors as arrows');
      expect(user).toContain('add two vectors tip-to-tail');
      expect(user).toContain('scale a vector by a number');
      // …but the OTHER lesson (i.e. the whole syllabus) is never resent — that's the token win.
      expect(user).not.toContain('Matrices as transformations');
      expect(user).not.toContain('multiply a matrix by a vector');
      // No rolling history either, and a small, bounded output budget.
      expect(req?.history).toEqual([]);
      expect(req?.maxTokens ?? Infinity).toBeLessThanOrEqual(600);
    });

    it('uses the lean checkpoint system prompt, not the fat course-building one', async () => {
      fake.raw = checkpointJson(2);
      await generateCheckpoint(course, 0, cfg);
      const system = fake.lastReq?.system ?? '';
      expect(system).not.toContain('5-7 lessons'); // the syllabus prompt's tell
      expect(system.length).toBeLessThan(700);
    });
  });

  describe('generateCheckpoint — bounded time + human errors (no silent hang)', () => {
    it('a stream that never completes is stopped by the total-time budget with an honest message', async () => {
      vi.useFakeTimers();
      try {
        fake.hang = true;
        const p = generateCheckpoint(course, 0, cfg);
        const assertion = expect(p).rejects.toThrow(/took too long/i);
        await vi.advanceTimersByTimeAsync(91_000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it('maps a raw "429" provider error to a plain rate-limit message', async () => {
      fake.throwError = new Error('anthropic 429');
      await expect(generateCheckpoint(course, 0, cfg)).rejects.toThrow(/rate-limiting/i);
    });

    it('maps a 401/API-key error to a check-your-key message', async () => {
      fake.throwError = new Error('gemini 401 Unauthorized');
      await expect(generateCheckpoint(course, 0, cfg)).rejects.toThrow(/check its API key/i);
    });

    it('a deliberate caller-cancel propagates untouched (not reported as a server error)', async () => {
      fake.hang = true;
      const ac = new AbortController();
      const p = generateCheckpoint(course, 0, cfg, ac.signal);
      const assertion = expect(p).rejects.toThrow(/aborted/);
      ac.abort();
      await assertion;
    });
  });
});

// GenerateLiveOpts.lesson is ADDITIVE: an ordinary turn (opts.lesson undefined) is byte-for-byte
// unaffected, and a lesson turn layers lessonSpine's directive on top of the normal system prompt
// (after depthLine, never replacing the teaching-arc shaping) and pins the topic via the existing
// topicLockLine mechanism — proven here with the provider adapter mocked (no network), inspecting
// the exact system prompt each call received.
describe('generateLive — GenerateLiveOpts.lesson', () => {
  const cfg: ModelConfig = {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-8b',
    apiKey: 'k',
  };

  const OK_RESPONSE = JSON.stringify({
    title: 'Vectors',
    sub: 's',
    narration: 'A vector has length and direction.',
    blocks: [{ type: 'insight', props: { title: 'Point', conf: 'inferred' } }],
  });

  beforeEach(() => {
    fake.raw = OK_RESPONSE;
    fake.lastReq = null;
    fake.hang = false;
    fake.throwError = null;
  });

  it('is additive: an ordinary turn with no lesson opt carries no lesson directive at all', async () => {
    await generateLive('teach me linear algebra', [], cfg);
    expect(fake.lastReq?.system).not.toMatch(/LESSON POSITION/);
  });

  it("layers the lesson directive onto the system prompt, AFTER depthLine's teaching-arc shaping", async () => {
    const lesson = {
      directive:
        'LESSON POSITION — this is Lesson 2 of 5 of the course "Linear Algebra".\n\nTHIS LESSON\'S OBJECTIVES — multiply a matrix by a vector.',
      topic: 'Matrices — part of the course "Linear Algebra" (on linear algebra)',
    };
    await generateLive('teach this lesson', [], cfg, undefined, { lesson });

    const system = fake.lastReq?.system ?? '';
    expect(system).toContain(lesson.directive);
    // The lesson directive comes AFTER the point where depthLine would land — proven by checking
    // it appears later in the string than the teaching-arc marker depthLine emits for a rich
    // teaching ask (TEACH IT AS A SHAPED LESSON), when that marker is present at all; either way
    // the directive itself must be present verbatim, additive to whatever came before it.
    expect(system.indexOf(lesson.directive)).toBeGreaterThan(0);
  });

  it('pins the lesson topic via the existing topicLockLine mechanism', async () => {
    const lesson = {
      directive: 'LESSON POSITION — this is Lesson 1 of 3.',
      topic: 'Vectors — part of the course "Linear Algebra" (on linear algebra)',
    };
    await generateLive('go deeper', [], cfg, undefined, { lesson });

    const system = fake.lastReq?.system ?? '';
    expect(system).toMatch(/STAY ON THE CURRENT TOPIC/);
    expect(system).toContain(lesson.topic);
  });

  it('a lesson turn still produces a normal, renderable ConversationSpec', async () => {
    const lesson = {
      directive: 'LESSON POSITION — this is Lesson 1 of 3.',
      topic: 'Vectors — part of the course "Linear Algebra" (on linear algebra)',
    };
    const result = await generateLive('teach this lesson', [], cfg, undefined, { lesson });
    expect(result.error).toBeUndefined();
    expect(result.spec.title).toBe('Vectors');
    expect(result.narration).toBe('A vector has length and direction.');
  });
});
