// Bake the static showcase's answer narration with the pinned local Kokoro service.
//
// Run after `docker compose up -d kokoro`:
//   pnpm build:demo:narration
//   ONLY=traveler pnpm build:demo:narration
//
// The output is deliberately WebM/Opus: it is broadly playable and remains inside the project's
// reviewed open-media policy. This ships audio OUTPUT only, never the model or its container.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type Frame = { narration?: string };
type Corpus = { persona: string; frames: Frame[] };

const ROOT = resolve(import.meta.dirname, '..');
const CORPUS_DIR = join(ROOT, 'src/demo/corpus');
const OUT_DIR = join(ROOT, 'public/demo-assets/narration');
const KOKORO_URL = (process.env.KOKORO_URL ?? 'http://127.0.0.1:8880').replace(/\/$/u, '');
const ONLY = new Set(
  (process.env.ONLY ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

function requireCommand(command: string): void {
  if (spawnSync(command, ['-version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error(`${command} is required to bake WebM/Opus narration`);
  }
}

function sourceFiles(): string[] {
  const personas = ['dev', 'pm', 'student', 'traveler'];
  const selected = ONLY.size ? personas.filter((persona) => ONLY.has(persona)) : personas;
  if (!selected.length) throw new Error(`no demo personas match ONLY=${process.env.ONLY}`);
  return selected.map((persona) => join(CORPUS_DIR, `${persona}.generated.json`));
}

async function synthesize(text: string): Promise<Uint8Array> {
  const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: 'af_heart',
      response_format: 'wav',
      speed: 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Kokoro returned ${response.status}`);
  const wav = new Uint8Array(await response.arrayBuffer());
  if (!wav.byteLength) throw new Error('Kokoro returned an empty audio response');
  return wav;
}

async function bakeCorpus(file: string, temp: string): Promise<void> {
  const corpus = JSON.parse(readFileSync(file, 'utf8')) as Corpus;
  if (!corpus.persona || !Array.isArray(corpus.frames))
    throw new Error(`invalid demo corpus: ${file}`);
  for (const [index, frame] of corpus.frames.entries()) {
    const narration = frame.narration?.trim();
    if (!narration) throw new Error(`${corpus.persona} turn ${index + 1} has no narration`);
    const wavPath = join(temp, `${corpus.persona}-${index + 1}.wav`);
    const webmPath = join(OUT_DIR, `${corpus.persona}-${index + 1}.webm`);
    writeFileSync(wavPath, await synthesize(narration));
    const encoded = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wavPath,
        '-c:a',
        'libopus',
        '-b:a',
        '48k',
        webmPath,
      ],
      { encoding: 'utf8' },
    );
    if (encoded.status !== 0) throw new Error(encoded.stderr || `ffmpeg failed for ${webmPath}`);
    console.log(`wrote ${corpus.persona}-${index + 1}.webm`);
  }
}

async function main(): Promise<void> {
  requireCommand('ffmpeg');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT_DIR, { recursive: true });
  const temp = mkdtempSync(join(tmpdir(), 'mavea-demo-narration-'));
  try {
    for (const file of sourceFiles()) await bakeCorpus(file, temp);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
