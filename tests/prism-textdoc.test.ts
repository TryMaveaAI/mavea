// prism-textdoc.test.ts — Prism explodes plain-text / data files directly (the bytes ARE the
// text), smart-paged per format so each grounding "page" is a sensible citable chunk: CSV repeats its
// header atop each row block, Markdown splits on headings, JSON/code chunk by size, plain text by
// paragraph. These pin that paging so a claim always grounds against a coherent slice.
import { describe, expect, it } from 'vitest';
import { extractTextPages } from '../src/live/prism/textDoc';
import type { Attachment } from '../src/live/attachments';

function att(name: string, content: string, mime = ''): Attachment {
  return { name, mime, data: btoa(unescape(encodeURIComponent(content))), size: content.length };
}

describe('extractTextPages', () => {
  it('CSV → header repeated atop each ~40-row page, so every page is self-describing', () => {
    const rows = Array.from({ length: 90 }, (_, i) => `Region${i},${i * 100},$${i}.1M`).join('\n');
    const pages = extractTextPages(att('data.csv', `Region,Deals,ARR\n${rows}`));
    expect(pages).not.toBeNull();
    expect(pages!.length).toBe(3); // 90 / 40 → 3 pages
    expect(pages!.every((p) => p.startsWith('Region,Deals,ARR'))).toBe(true);
    expect(pages![2]).toContain('Region89');
  });

  it('TSV → tab-delimited, header repeated', () => {
    const pages = extractTextPages(att('m.tsv', 'a\tb\tc\n1\t2\t3\n4\t5\t6'));
    expect(pages![0]).toContain('a\tb\tc');
  });

  it('Markdown → one page per section (heading split)', () => {
    const md = '# Title\nintro\n\n## Revenue\ngrew 38% YoY\n\n## Risk\nconcentration';
    const pages = extractTextPages(att('notes.md', md));
    expect(pages!.length).toBe(3);
    expect(pages![1]).toContain('Revenue');
    expect(pages![1]).toContain('grew 38% YoY');
  });

  it('Markdown with no headings → paragraph paging (not one giant page)', () => {
    const md = 'Para one is here.\n\nPara two is here.\n\nPara three is here.';
    const pages = extractTextPages(att('flat.md', md));
    expect(pages).not.toBeNull();
    expect(pages![0]).toContain('Para one');
  });

  it('JSON → whole file when small', () => {
    const pages = extractTextPages(att('cfg.json', '{"arr":"$14.2M","nrr":1.19}'));
    expect(pages!.length).toBe(1);
    expect(pages![0]).toContain('14.2M');
  });

  it('large code/JSON → fixed chunks split on line boundaries', () => {
    const big = Array.from({ length: 400 }, (_, i) => `line ${i} of source code here;`).join('\n');
    const pages = extractTextPages(att('app.ts', big));
    expect(pages!.length).toBeGreaterThan(1);
    // no page splits a line mid-way
    expect(pages!.every((p) => !p.startsWith(' '))).toBe(true);
  });

  it('plain text → paragraph blocks', () => {
    const pages = extractTextPages(att('readme.txt', 'First para.\n\nSecond para.'));
    expect(pages![0]).toContain('First para');
  });

  it('empty / whitespace-only → null (honest failure)', () => {
    expect(extractTextPages(att('x.txt', '   \n  '))).toBeNull();
  });

  it('decodes UTF-8 multibyte content', () => {
    const pages = extractTextPages(att('u.txt', 'café — naïve — €50'));
    expect(pages![0]).toContain('café');
    expect(pages![0]).toContain('€50');
  });
});
