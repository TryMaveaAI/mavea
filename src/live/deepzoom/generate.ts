// generate.ts — deep-zoom tree generation.
// One API call produces all 10 trunk levels; one more per branch fork.
// This keeps cost minimal: a full 10-level trunk costs 1 call, not 10.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers';
import { parseLooseJson, parseLooseJsonObject } from '../ground/json';
import type { ZoomLevel } from './types';

export const BRANCH_DEPTH = 10;

const MULTIPLIERS = [
  '×1',
  '×10',
  '×100',
  '×1k',
  '×10k',
  '×100k',
  '×1M',
  '×10M',
  '×100M',
  '×1B',
  '×10B',
  '×100B',
  '×1T',
  '×10T',
  '×100T',
  '×1Q',
  '×10Q',
  '×100Q',
  '×1Qn',
  '×10Qn',
];

function coerceLevel(raw: unknown, scale: number): ZoomLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const subtopics = Array.isArray(r.subtopics)
    ? (r.subtopics as unknown[]).map(String).filter(Boolean).slice(0, 8)
    : [];
  if (subtopics.length === 0) return null;
  const selectedIndex = Math.max(0, Math.min(subtopics.length - 1, Number(r.selectedIndex ?? 0)));
  return {
    scale,
    multiplier: MULTIPLIERS[scale] ?? `×${10 ** scale}`,
    scaleLabel: String(r.scaleLabel ?? `SCALE ${scale}`).toUpperCase(),
    title: String(r.title ?? '').trim(),
    body: String(r.body ?? '').trim(),
    subtopics,
    selectedIndex,
  };
}

function extractLevels(raw: unknown, startScale: number, max: number): ZoomLevel[] {
  // A trunk arrives as a string; a fork's already-parsed payload arrives as an object. Both go
  // through the tolerant parser, which passes a non-string straight back.
  const parsed = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  const obj = (parsed !== null && typeof parsed === 'object' ? parsed : {}) as Record<
    string,
    unknown
  >;
  const arr = Array.isArray(obj.levels) ? obj.levels : Array.isArray(obj) ? obj : [];
  const levels: ZoomLevel[] = [];
  for (let i = 0; i < Math.min((arr as unknown[]).length, max); i++) {
    const level = coerceLevel((arr as unknown[])[i], startScale + i);
    if (level) levels.push(level);
  }
  return levels;
}

const TRUNK_SYSTEM = `You are a "Powers of Ten" semantic telescope builder.

Given a topic or question, produce EXACTLY 10 zoom levels — level 1 is the broadest possible view of the entire field, level 10 is the finest mechanism or detail.

Rules:
- Each level zooms into subtopics[selectedIndex] of the previous level
- Each level must be more specific and granular than the one before
- subtopics: 3–5 sub-areas visible at THIS scale (2–5 words each)
- selectedIndex: which subtopic the NEXT level zooms into (pick the most illuminating path)
- scaleLabel: 1–3 word ALL_CAPS poetic label (e.g. "THE FIELD", "THE PROCESS", "THE MOLECULE", "THE BOND")
- body: exactly 2 vivid, dense sentences grounding the reader at this exact scale — be concrete

Return ONLY valid JSON, no markdown fences, no prose:
{
  "rangeStart": "2–4 word phrase for the broadest scope (e.g. 'all of biology')",
  "levels": [
    { "scaleLabel": "...", "title": "...", "body": "...", "subtopics": [...], "selectedIndex": 0 },
    ...9 more objects...
  ]
}`;

const BRANCH_SYSTEM = `You are extending a "Powers of Ten" semantic telescope by branching into a chosen subtopic.

Produce EXACTLY 10 new zoom levels starting one scale deeper than the given parent level, each more specific than the last.

Rules:
- Level 1 focuses on the chosen subtopic at the next scale depth
- Each level zooms into subtopics[selectedIndex] of the previous level
- scaleLabel: 1–3 word ALL_CAPS label (e.g. "THE REACTION", "THE PROTEIN", "THE SITE")
- body: exactly 2 vivid, dense sentences at this exact scale
- subtopics: 3–5 sub-parts visible at this scale

Return ONLY valid JSON, no markdown fences, no prose:
{
  "levels": [
    { "scaleLabel": "...", "title": "...", "body": "...", "subtopics": [...], "selectedIndex": 0 },
    ...9 more objects...
  ]
}`;

/** One API call → 10 trunk zoom levels + rangeStart. */
export async function generateTrunk(
  query: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<{ rangeStart: string; levels: ZoomLevel[] }> {
  const adapter = getAdapter(cfg.provider);
  const result = await adapter.generate(
    {
      system: TRUNK_SYSTEM,
      history: [],
      user: query,
      maxTokens: 3200,
      temperature: 0.4,
      format: null,
      signal,
    },
    cfg,
  );
  const obj = parseLooseJsonObject(typeof result.raw === 'string' ? result.raw : '');
  const levels = extractLevels(obj, 0, BRANCH_DEPTH);
  if (levels.length === 0) throw new Error('No zoom levels in model response');
  return { rangeStart: String(obj.rangeStart ?? levels[0].title), levels };
}

/** One API call → 10 branch zoom levels forking from a chosen subtopic. */
export async function generateBranch(
  query: string,
  parentLevel: ZoomLevel,
  subtopic: string,
  parentDepth: number,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<ZoomLevel[]> {
  const adapter = getAdapter(cfg.provider);
  const user = `Topic: "${query}"\nCurrent level (${parentLevel.scaleLabel}): "${parentLevel.title}"\nForking into: "${subtopic}"`;
  const result = await adapter.generate(
    {
      system: BRANCH_SYSTEM,
      history: [],
      user,
      maxTokens: 3200,
      temperature: 0.4,
      format: null,
      signal,
    },
    cfg,
  );
  const levels = extractLevels(result.raw, parentDepth + 1, BRANCH_DEPTH);
  if (levels.length === 0) throw new Error('No branch levels in model response');
  return levels;
}
