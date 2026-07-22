// course-generateCheckpoint.test.ts — generateCheckpoint.ts's lazy, on-demand self-check writer.
// This is the cost-optimisation split: the syllabus no longer carries checkpoints (that moved OUT
// of course-generateCourse.test.ts), so a checkpoint is written by exactly ONE lean call, only when
// a learner takes it. Pins the properties that make it cheap AND honest: exactly 2 questions out,
// a runaway array capped to 2, an honest failure (not a fabricated check) when < 2 real Q&A survive,
// a MINIMAL prompt (this lesson's objectives only — never the whole syllabus, never a fat system
// prompt), and the same bounded-time / friendly-error / caller-cancel discipline generateCourse has.
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

import { generateCheckpoint } from '../src/live/course/generateCourse';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

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
    await expect(generateCheckpoint(course, 0, cfg)).rejects.toThrow(/Couldn't write a checkpoint/);
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
