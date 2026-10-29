// Bake the static showcase's answer narration with the pinned local Kokoro service.
//
// Run after `docker compose up -d kokoro`:
//   pnpm build:demo:narration
//   ONLY=traveler pnpm build:demo:narration
//
// The output is deliberately WebM/Opus: it is broadly playable and remains inside the project's
// reviewed open-media policy. This ships audio OUTPUT only, never the model or its container.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeNarration } from './build-media-input';

type Frame = { narration?: string };
type Corpus = { persona: string; frames: Frame[] };

const ROOT = resolve(import.meta.dirname, '..');
const CORPUS_DIR = join(ROOT, 'src/demo/corpus');
const OUT_DIR = join(ROOT, 'public/demo-assets/narration');
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

export async function synthesize(text: string): Promise<Uint8Array> {
  // Corpus text is sent only to the local voice service; redirects must never forward it elsewhere.
  const response = await fetch('http://127.0.0.1:8880/v1/audio/speech', {
    redirect: 'error',
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

async function bakeCorpus(file: string): Promise<void> {
  const corpus = JSON.parse(readFileSync(file, 'utf8')) as Corpus;
  if (
    !['dev', 'pm', 'student', 'traveler'].includes(corpus.persona) ||
    !Array.isArray(corpus.frames)
  )
    throw new Error(`invalid demo corpus: ${file}`);
  for (const [index, frame] of corpus.frames.entries()) {
    const narration = frame.narration?.trim();
    if (!narration) throw new Error(`${corpus.persona} turn ${index + 1} has no narration`);
    const webmPath = join(OUT_DIR, `${corpus.persona}-${index + 1}.webm`);
    encodeNarration(await synthesize(narration), webmPath);
    console.log(`wrote ${corpus.persona}-${index + 1}.webm`);
  }
}

async function main(): Promise<void> {
  requireCommand('ffmpeg');
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of sourceFiles()) await bakeCorpus(file);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
