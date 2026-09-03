import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  fileToAttachment,
  fileToPrismAttachment,
  ensureAttachmentData,
  attachmentLabel,
  attachmentKind,
  attachmentFileError,
  attachmentSizeLimit,
  isExplodable,
  isImage,
  isPdf,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_DOCUMENT_BYTES,
  type Attachment,
} from '../src/live/attachments';
import { useAttachments } from '../src/live/hooks/useAttachments';
import {
  anthropicUserContent,
  openaiUserContent,
  geminiUserParts,
  textOnlyUser,
} from '../src/live/providers/parts';

// A tiny 1x1 PNG and a stub PDF, as Files, so the encoder runs the real FileReader path
// (jsdom provides File + FileReader).
function pngFile(name = 'shot.png'): File {
  // 1x1 transparent PNG bytes.
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
  );
  return new File([bytes], name, { type: 'image/png' });
}
function pdfFile(name = 'report.pdf'): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

const img: Attachment = { name: 'a.png', mime: 'image/png', data: 'AAAA', size: 4 };
const pdf: Attachment = { name: 'b.pdf', mime: 'application/pdf', data: 'BBBB', size: 4 };
const csv: Attachment = { name: 'c.csv', mime: 'text/csv', data: 'CCCC', size: 4 };

describe('fileToAttachment', () => {
  it('encodes an image to base64 without the data: prefix', async () => {
    const res = await fileToAttachment(pngFile());
    expect(res.ok).toBe(true);
    expect(res.attachment?.mime).toBe('image/png');
    expect(res.attachment?.data).not.toContain('data:');
    expect(res.attachment?.data.length).toBeGreaterThan(0);
  });

  it('accepts a PDF', async () => {
    const res = await fileToAttachment(pdfFile());
    expect(res.ok).toBe(true);
    expect(res.attachment?.mime).toBe('application/pdf');
  });

  it('rejects a genuinely unsupported type (e.g. a video)', async () => {
    const res = await fileToAttachment(new File(['x'], 'clip.mp4', { type: 'video/mp4' }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('unsupported');
  });

  it('accepts plain-text / data files (CSV, TXT, Markdown, JSON) for the explode map', async () => {
    for (const [name, type] of [
      ['data.csv', 'text/csv'],
      ['notes.txt', 'text/plain'],
      ['readme.md', ''], // browsers often report empty MIME → extension fallback
      ['config.json', 'application/json'],
      ['app.ts', ''],
    ] as const) {
      const res = await fileToAttachment(new File(['col,val\na,1'], name, { type }));
      expect(res.ok, `${name} should be accepted`).toBe(true);
    }
  });

  it('gives a text/data file the larger document cap', async () => {
    const csv = new File([new Uint8Array(2)], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(csv, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    const res = await fileToAttachment(csv);
    expect(res.ok).toBe(true); // over the 10 MB image cap, under the 40 MB document cap
  });

  it('rejects an oversized image', async () => {
    const big = new File([new Uint8Array(2)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    const res = await fileToAttachment(big);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('too-large');
  });

  it('accepts a document larger than the image cap (PDFs/Office are handled client-side)', async () => {
    // a 20 MB PDF is over the 10 MB image cap but under the 40 MB document cap → accepted
    const doc = new File([new Uint8Array(2)], 'paper.pdf', { type: 'application/pdf' });
    Object.defineProperty(doc, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    const res = await fileToAttachment(doc);
    expect(res.ok).toBe(true);
  });

  it('rejects a document over the document cap', async () => {
    const doc = new File([new Uint8Array(2)], 'huge.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    Object.defineProperty(doc, 'size', { value: MAX_DOCUMENT_BYTES + 1 });
    const res = await fileToAttachment(doc);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('too-large');
  });
});

describe('fileToPrismAttachment', () => {
  it('stages document metadata without reading or base64-duplicating the file', async () => {
    const file = pdfFile();
    const result = await fileToPrismAttachment(file);
    expect(result.ok).toBe(true);
    expect(result.attachment?.data).toBe('');
    expect(result.attachment?.file).toBe(file);
  });

  it('materializes provider data only at the request boundary', async () => {
    const result = await fileToPrismAttachment(pdfFile());
    const encoded = await ensureAttachmentData(result.attachment!);
    expect(encoded.data).toBe('JVBERg==');
    expect(encoded.file).toBeUndefined();
  });
});

describe('attachment helpers', () => {
  it('classifies image vs pdf', () => {
    expect(isImage(img)).toBe(true);
    expect(isPdf(img)).toBe(false);
    expect(isPdf(pdf)).toBe(true);
  });
  it('labels with a human size', () => {
    expect(attachmentLabel({ ...img, size: 2 * 1024 * 1024 })).toBe('a.png · 2.0 MB');
    expect(attachmentLabel({ ...img, size: 5 * 1024 })).toBe('a.png · 5 KB');
  });

  // Prism reads a picture as a one-page deck on the vision path, so every picker that offers
  // images has to agree it is explodable — the Go hub's Prism card staged the screenshot it had
  // just asked for and then opened nothing, because this said no.
  it('counts a picture among the things Prism can explode', () => {
    expect(isExplodable(img)).toBe(true);
    expect(isExplodable(pdf)).toBe(true);
  });
});

describe('the size cap a rejection quotes is the one the guard applied', () => {
  const file = (name: string, type: string, size: number): File => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  // Text and data files are documents: they get 40 MB. Quoting the 10 MB image cap at a 20 MB CSV
  // told its owner to give up on a file the guard would have taken.
  it('gives a text/data file the document cap, not the image one', () => {
    expect(attachmentSizeLimit(file('data.csv', 'text/csv', 1))).toBe(MAX_DOCUMENT_BYTES);
    expect(attachmentSizeLimit(file('a.png', 'image/png', 1))).toBe(MAX_ATTACHMENT_BYTES);
    expect(attachmentFileError(file('data.csv', 'text/csv', 20 * 1024 * 1024))).toBeNull();
  });

  // "Unsupported file type. Try a ... Word doc" was the answer a refused Word document got.
  it('names the real cause for a pre-OOXML Office file', () => {
    expect(attachmentFileError(file('memo.doc', 'application/msword', 10))).toBe('legacy-office');
    expect(attachmentFileError(file('deck.ppt', 'application/vnd.ms-powerpoint', 10))).toBe(
      'legacy-office',
    );
    expect(attachmentFileError(file('thing.exe', 'application/octet-stream', 10))).toBe(
      'unsupported',
    );
  });
});

describe('provider part builders', () => {
  it('text-only when there are no attachments', () => {
    expect(anthropicUserContent('hi')).toBe('hi');
    expect(openaiUserContent('hi')).toBe('hi');
    expect(geminiUserParts('hi')).toEqual([{ text: 'hi' }]);
    expect(textOnlyUser('hi')).toBe('hi');
  });

  it('Anthropic sends image AND pdf as native parts, text last', () => {
    const parts = anthropicUserContent('look', [img, pdf]);
    expect(Array.isArray(parts)).toBe(true);
    const arr = parts as Array<{ type: string }>;
    expect(arr.map((p) => p.type)).toEqual(['image', 'document', 'text']);
  });

  it('Anthropic notes a non-image/pdf attachment rather than silently dropping it', () => {
    const parts = anthropicUserContent('look', [csv]) as Array<{ type: string; text?: string }>;
    expect(parts.map((p) => p.type)).toEqual(['text']);
    expect(parts[0].text).toContain('c.csv');
    expect(parts[0].text).toContain("can't read");
  });

  it('OpenAI sends images as image_url but degrades a PDF to a text note', () => {
    const parts = openaiUserContent('look', [img, pdf]);
    const arr = parts as Array<{ type: string; text?: string }>;
    expect(arr.map((p) => p.type)).toEqual(['image_url', 'text']);
    const text = arr.find((p) => p.type === 'text')?.text ?? '';
    expect(text).toContain('b.pdf');
    expect(text).toContain("can't read");
  });

  it('OpenAI with only a PDF returns a string with the note (no parts)', () => {
    const out = openaiUserContent('look', [pdf]);
    expect(typeof out).toBe('string');
    expect(out as string).toContain('b.pdf');
  });

  it('Gemini sends both image and pdf inline, text last', () => {
    const parts = geminiUserParts('look', [img, pdf]);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveProperty('inlineData');
    expect(parts[2]).toEqual({ text: 'look' });
  });

  it('Gemini notes a non-image/pdf attachment rather than silently dropping it', () => {
    const parts = geminiUserParts('look', [csv]) as Array<{ text?: string }>;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain('c.csv');
    expect(parts[0].text).toContain("can't read");
  });

  it('text-only provider notes every attachment in the text', () => {
    const out = textOnlyUser('look', [img, pdf]);
    expect(out).toContain('a.png');
    expect(out).toContain('b.pdf');
  });
});

describe('useAttachments — staging multiple files at once', () => {
  it('accepts a full batch that fits within the cap', async () => {
    const { result } = renderHook(() => useAttachments());
    const files = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => pngFile(`shot-${i}.png`));

    await act(async () => {
      await result.current.onFiles(files);
    });

    expect(result.current.attached).toHaveLength(MAX_ATTACHMENTS);
    expect(result.current.attachError).toBeNull();
  });

  it('adds only the room that is left and names the overflow, rather than silently dropping it', async () => {
    const { result } = renderHook(() => useAttachments());

    await act(async () => {
      // Fill to one short of the cap first.
      await result.current.onFiles(
        Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => pngFile(`first-${i}.png`)),
      );
    });
    expect(result.current.attached).toHaveLength(MAX_ATTACHMENTS - 1);

    await act(async () => {
      // Picking 3 more only has room for 1.
      await result.current.onFiles([pngFile('a.png'), pngFile('b.png'), pngFile('c.png')]);
    });

    expect(result.current.attached).toHaveLength(MAX_ATTACHMENTS);
    expect(result.current.attachError).toMatch(/only the first 1 file/i);
  });

  it('picking any more once already at the cap adds nothing and explains the limit', async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.onFiles(
        Array.from({ length: MAX_ATTACHMENTS }, (_, i) => pngFile(`f-${i}.png`)),
      );
    });

    await act(async () => {
      await result.current.onFiles([pngFile('one-more.png')]);
    });

    expect(result.current.attached).toHaveLength(MAX_ATTACHMENTS);
    expect(result.current.attachError).toMatch(new RegExp(`up to ${MAX_ATTACHMENTS} files`, 'i'));
  });

  it('a batch mixing a good file and an unsupported one keeps the good one and surfaces the reason', async () => {
    const { result } = renderHook(() => useAttachments());
    const bad = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

    await act(async () => {
      await result.current.onFiles([pngFile('ok.png'), bad]);
    });

    expect(result.current.attached).toHaveLength(1);
    expect(result.current.attachError).toMatch(/clip\.mp4/);
    expect(result.current.attachError).toMatch(/isn't a supported type/i);
  });

  it('removeAttachment drops exactly the targeted staged file', async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.onFiles([pngFile('keep.png'), pngFile('drop.png')]);
    });
    expect(result.current.attached.map((a) => a.name)).toEqual(['keep.png', 'drop.png']);

    act(() => {
      result.current.removeAttachment(1);
    });
    await waitFor(() => expect(result.current.attached.map((a) => a.name)).toEqual(['keep.png']));
  });
});

describe('attachmentKind — the coarse kind the selector reasons over', () => {
  const att = (name: string, mime: string): Attachment => ({ name, mime, data: '', size: 1 });
  it('classifies spreadsheets/CSV as sheet (checked before text, since a .csv is also text)', () => {
    expect(attachmentKind(att('q3.csv', 'text/csv'))).toBe('sheet');
    expect(
      attachmentKind(
        att('book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ),
    ).toBe('sheet');
  });
  it('classifies images, pdfs, and plain text', () => {
    expect(attachmentKind(att('r.jpg', 'image/jpeg'))).toBe('image');
    expect(attachmentKind(att('p.pdf', 'application/pdf'))).toBe('pdf');
    expect(attachmentKind(att('notes.txt', 'text/plain'))).toBe('text');
  });
});
