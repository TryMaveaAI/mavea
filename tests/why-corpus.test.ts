// why-corpus.test.ts — the live grounding corpus is built only from HONEST sources: attached files
// (verbatim cells/text) and web snippets. No assistant output. Search is mocked for determinism.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchMock = vi.fn();
vi.mock('../src/live/search/index', async (orig) => {
  const actual = await orig<typeof import('../src/live/search/index')>();
  return {
    ...actual,
    getSearchProvider: () => ({ id: 'wikipedia', needsKey: false, search: searchMock }),
  };
});

import { attachmentsToText, webSnippets, assembleWhyCorpus } from '../src/live/why/corpus';
import type { Attachment } from '../src/live/attachments';

const att = (name: string, mime: string, text: string): Attachment => ({
  name,
  mime,
  data: btoa(text),
  size: text.length,
});

beforeEach(() => searchMock.mockReset());

describe('attachmentsToText', () => {
  it('reads a text file verbatim', async () => {
    const t = await attachmentsToText([att('notes.txt', 'text/plain', 'retention fell in week 3')]);
    expect(t).toContain('retention fell in week 3');
  });
  it('reads a CSV as groundable rows (verbatim tokens preserved)', async () => {
    const csv = 'month,revenue\nJan,"1,200"\nFeb,1500';
    const t = await attachmentsToText([att('sales.csv', 'text/csv', csv)]);
    expect(t).toContain('revenue');
    expect(t).toContain('1,200'); // verbatim token available to ground against
  });
  it('skips an unreadable attachment without throwing', async () => {
    const t = await attachmentsToText([
      { name: 'x.pdf', mime: 'application/pdf', data: 'not-base64!!', size: 3 },
    ]);
    expect(typeof t).toBe('string');
  });
});

describe('webSnippets', () => {
  it('joins snippets when enabled', async () => {
    searchMock.mockResolvedValue([
      { title: 'Churn report', url: 'https://x.com', snippet: 'churn rose in March' },
    ]);
    expect(await webSnippets('why churn', { enabled: true })).toContain('churn rose in March');
  });
  it('returns empty when disabled or on failure', async () => {
    expect(await webSnippets('q', { enabled: false })).toBe('');
    searchMock.mockRejectedValueOnce(new Error('net'));
    expect(await webSnippets('q', { enabled: true })).toBe('');
  });
});

describe('assembleWhyCorpus', () => {
  it('combines file + web sources', async () => {
    searchMock.mockResolvedValue([{ title: 'T', url: 'https://x.com', snippet: 'a web fact' }]);
    const corpus = await assembleWhyCorpus('why', [att('n.txt', 'text/plain', 'a file fact')], {
      enabled: true,
    });
    expect(corpus).toContain('a file fact');
    expect(corpus).toContain('a web fact');
  });
  it('is empty (→ honest all-T0) with no sources', async () => {
    expect(await assembleWhyCorpus('why', [], { enabled: false })).toBe('');
  });
});
