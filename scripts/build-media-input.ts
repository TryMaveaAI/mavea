import { execFileSync, spawnSync } from 'node:child_process';

const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const PROCESS_TIMEOUT = 120_000;

function validateSize(bytes: Uint8Array): void {
  if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error('media response must contain between 1 byte and 32 MiB');
  }
}

/** Decode the service response directly; only ffmpeg's encoded output reaches disk. */
export function encodeNarration(wav: Uint8Array, destination: string): void {
  validateSize(wav);
  const header = Buffer.from(wav.subarray(0, 12));
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Kokoro returned invalid WAV audio');
  }
  const encoded = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-protocol_whitelist',
      'pipe',
      '-f',
      'wav',
      '-i',
      'pipe:0',
      '-map',
      '0:a:0',
      '-c:a',
      'libopus',
      '-b:a',
      '48k',
      destination,
    ],
    { input: wav, encoding: 'utf8', timeout: PROCESS_TIMEOUT },
  );
  if (encoded.error) throw encoded.error;
  if (encoded.status !== 0) throw new Error(encoded.stderr || `ffmpeg failed for ${destination}`);
}

/** Poppler accepts stdin, so downloaded documents never become scratch files. */
export function extractPdf(bytes: Uint8Array, maxPages: number): string[] {
  validateSize(bytes);
  if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    throw new Error('not a PDF');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages must be a positive integer');
  }
  const options = { input: bytes, timeout: PROCESS_TIMEOUT, maxBuffer: 8 * 1024 * 1024 };
  const info = execFileSync('pdfinfo', ['-'], options).toString();
  const pageCount = Number(info.match(/Pages:\s+(\d+)/u)?.[1]);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('invalid PDF page count');
  const pages: string[] = [];
  for (let page = 1; page <= Math.min(maxPages, pageCount); page++) {
    pages.push(
      execFileSync(
        'pdftotext',
        ['-layout', '-f', String(page), '-l', String(page), '-', '-'],
        options,
      ).toString(),
    );
  }
  return pages;
}
