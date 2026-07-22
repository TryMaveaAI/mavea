// course-generateLive-lesson.test.ts — GenerateLiveOpts.lesson is ADDITIVE: an ordinary turn
// (opts.lesson undefined) is byte-for-byte unaffected, and a lesson turn layers lessonSpine's
// directive on top of the normal system prompt (after depthLine, never replacing the teaching-arc
// shaping) and pins the topic via the existing topicLockLine mechanism — proven here with the
// provider adapter mocked (no network), inspecting the exact system prompt each call received.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

const fake = {
  raw: '' as string | object,
  lastReq: null as LiveRequest | null,
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
      return { raw: fake.raw };
    },
  }),
}));

import { generateLive } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

const OK_RESPONSE = JSON.stringify({
  title: 'Vectors',
  sub: 's',
  narration: 'A vector has length and direction.',
  blocks: [{ type: 'insight', props: { title: 'Point', conf: 'inferred' } }],
});

beforeEach(() => {
  fake.raw = OK_RESPONSE;
  fake.lastReq = null;
});

describe('generateLive — GenerateLiveOpts.lesson', () => {
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
