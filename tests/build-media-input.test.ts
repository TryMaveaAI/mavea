// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { encodeNarration, extractPdf } from '../scripts/build-media-input';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawnSync: vi.fn() }));

const wav = Buffer.from('RIFF\0\0\0\0WAVEdata');
const pdf = Buffer.from('%PDF-1.7\nfixture');

beforeEach(() => vi.resetAllMocks());

describe('narration input', () => {
  it('feeds WAV through stdin and limits decoding to the pipe protocol', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
    encodeNarration(wav, '/reviewed/traveler-1.webm');
    expect(spawnSync).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        '-protocol_whitelist',
        'pipe',
        '-f',
        'wav',
        '-i',
        'pipe:0',
        '/reviewed/traveler-1.webm',
      ]),
      expect.objectContaining({ input: wav, timeout: 120_000 }),
    );
  });
  it.each([Buffer.alloc(0), Buffer.from('<html>bad</html>'), Buffer.alloc(32 * 1024 * 1024 + 1)])(
    'rejects invalid or oversized audio before decoding',
    (bytes) => {
      expect(() => encodeNarration(bytes, '/reviewed/dev-1.webm')).toThrow();
      expect(spawnSync).not.toHaveBeenCalled();
    },
  );
  it('propagates encoder failures', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'invalid audio' } as ReturnType<
      typeof spawnSync
    >);
    expect(() => encodeNarration(wav, '/reviewed/dev-1.webm')).toThrow('invalid audio');
  });
});

describe('PDF input', () => {
  it('feeds each page to poppler through stdin and respects both page limits', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('Pages: 2\n'))
      .mockReturnValueOnce(Buffer.from('page one'))
      .mockReturnValueOnce(Buffer.from('page two'));
    expect(extractPdf(pdf, 6)).toEqual(['page one', 'page two']);
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'pdfinfo',
      ['-'],
      expect.objectContaining({ input: pdf }),
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      3,
      'pdftotext',
      ['-layout', '-f', '2', '-l', '2', '-', '-'],
      expect.objectContaining({ input: pdf }),
    );
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('Pages: 100\n'))
      .mockReturnValueOnce(Buffer.from('first'));
    expect(extractPdf(pdf, 1)).toEqual(['first']);
  });
  it('rejects invalid PDFs and page limits before running poppler', () => {
    expect(() => extractPdf(Buffer.from('<html>'), 6)).toThrow('not a PDF');
    expect(() => extractPdf(pdf, NaN)).toThrow('positive integer');
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('fails closed on missing page metadata or extraction failure', () => {
    vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from('Pages: 0'));
    expect(() => extractPdf(pdf, 6)).toThrow('page count');
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('Pages: 1'))
      .mockImplementationOnce(() => {
        throw new Error('corrupt PDF');
      });
    expect(() => extractPdf(pdf, 6)).toThrow('corrupt PDF');
  });
});
