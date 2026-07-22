// ripple-lesson.test.ts — the deep, on-demand lesson body. Guards that parseLessonDetail is defensive
// (tolerates fences/prose, drops junk, keeps the real code excerpt verbatim) so the spotlight only ever
// shows grounded, complete content.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseLessonDetail } from '../src/live/ripple/ingest/onboardSchema';
import { gatherLessonCode } from '../src/live/ripple/ingest/generate';
import type { CourseLesson } from '../src/live/ripple/model';

describe('parseLessonDetail', () => {
  it('parses a full in-depth lesson (overview, walkthrough, concepts, pitfalls, exercise)', () => {
    const raw = `Here you go:\n\`\`\`json\n${JSON.stringify({
      overview: 'A real explanation.\n\nWith a second paragraph that goes deeper.',
      walkthrough: [
        {
          file: 'src/auth/token.ts',
          focus: 'validateToken()',
          code: 'export function validateToken(t: string) {\n  return verify(t)\n}',
          explain: 'This is the one place a token is checked.',
        },
        { file: 'src/api/guard.ts', explain: 'The guard calls it before every route.' },
      ],
      concepts: [
        { term: 'Access token', explain: 'A short-lived signed credential.' },
        { term: 'no explain', explain: '' }, // dropped — needs both
      ],
      pitfalls: ['Forgetting to update a caller breaks the route at runtime.'],
      exercise: { task: 'Add a test for the guard.', hint: 'Start in guard.test.ts.' },
    })}\n\`\`\``;
    const d = parseLessonDetail(raw)!;
    expect(d.overview).toContain('second paragraph');
    expect(d.walkthrough).toHaveLength(2);
    expect(d.walkthrough[0]!.code).toContain('validateToken'); // real excerpt kept verbatim
    expect(d.walkthrough[0]!.focus).toBe('validateToken()');
    expect(d.concepts).toHaveLength(1); // the explain-less concept is dropped
    expect(d.pitfalls).toEqual(['Forgetting to update a caller breaks the route at runtime.']);
    expect(d.exercise).toEqual({
      task: 'Add a test for the guard.',
      hint: 'Start in guard.test.ts.',
    });
  });

  it('drops a walkthrough step with neither file nor explanation', () => {
    const d = parseLessonDetail(
      JSON.stringify({
        overview: 'x',
        walkthrough: [{ code: 'noise' }, { file: 'a.ts', explain: 'real' }],
      }),
    )!;
    expect(d.walkthrough).toHaveLength(1);
    expect(d.walkthrough[0]!.file).toBe('a.ts');
  });

  it('returns null when there is no usable teaching content', () => {
    expect(parseLessonDetail('not json')).toBeNull();
    expect(parseLessonDetail(JSON.stringify({ pitfalls: ['only a pitfall'] }))).toBeNull();
  });
});

describe('gatherLessonCode — content-addressed lesson code', () => {
  afterEach(() => vi.unstubAllGlobals());

  const lesson: CourseLesson = {
    title: 'Reading the auth guard',
    goal: 'Understand how a request gets checked.',
    read: ['src/auth/guard.ts', 'src/auth/token.ts'],
    concepts: [],
  };

  /** Stub GitHub's browser-direct file-contents endpoint (GET .../contents/<path>?ref=…), answering
   *  each call by the path in its URL and returning the base64 blob the real API sends. */
  function stubFiles(contents: Record<string, string>): typeof fetch {
    return vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const match = /\/contents\/([^?]+)/.exec(href);
      const path = match ? decodeURIComponent(match[1]!) : '';
      const content = contents[path];
      if (content === undefined) {
        return {
          ok: false,
          status: 404,
          headers: { get: () => null },
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          type: 'file',
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('changes the contentHash when the fetched file content changes', async () => {
    vi.stubGlobal(
      'fetch',
      stubFiles({
        'src/auth/guard.ts': 'export function guard() { return true; }',
        'src/auth/token.ts': 'export function validateToken() {}',
      }),
    );
    const first = await gatherLessonCode(lesson, 'main', 'acme/widget');

    vi.stubGlobal(
      'fetch',
      stubFiles({
        'src/auth/guard.ts': 'export function guard() { return false; }', // the guard's logic changed
        'src/auth/token.ts': 'export function validateToken() {}',
      }),
    );
    const second = await gatherLessonCode(lesson, 'main', 'acme/widget');

    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.codeContext).not.toBe(first.codeContext);
  });

  it('keeps the same contentHash across two fetches of unchanged file content', async () => {
    const contents = {
      'src/auth/guard.ts': 'export function guard() { return true; }',
      'src/auth/token.ts': 'export function validateToken() {}',
    };
    vi.stubGlobal('fetch', stubFiles(contents));
    const first = await gatherLessonCode(lesson, 'main', 'acme/widget');

    vi.stubGlobal('fetch', stubFiles({ ...contents })); // a fresh read of the identical bytes
    const second = await gatherLessonCode(lesson, 'main', 'acme/widget');

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.codeContext).toBe(first.codeContext);
  });
});
