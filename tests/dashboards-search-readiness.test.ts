// A tracker is a standing web search. Two things have to be true before one can be created or
// checked: a model that can generate, and Web search set to Real-time — a key alone answers from
// memory, and a board built on that grounds nothing on every pass. searchReadiness is the ONE
// judgement every create and refresh entry reads, so a surface cannot drift into offering a
// tracker the loop would then refuse.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchBlockLine, searchReadiness } from '../src/live/dashboards/searchReadiness';
import type { LiveConfigV2 } from '../src/live/useLiveConfig';

const cfg = (over: Partial<LiveConfigV2>): LiveConfigV2 =>
  ({
    provider: 'openai',
    models: { openai: 'gpt-5.4-mini' },
    keys: { openai: 'k' },
    searchMode: 'realtime',
    ...over,
  }) as LiveConfigV2;

describe('searchReadiness', () => {
  it('is ready only with a model that can generate AND Real-time web search', () => {
    expect(searchReadiness(cfg({}))).toEqual({ ok: true });
  });

  it('names the missing model first — nothing can run without one', () => {
    expect(searchReadiness(cfg({ keys: {} }))).toEqual({ ok: false, reason: 'no-model' });
    expect(searchReadiness(cfg({ models: {} }))).toEqual({ ok: false, reason: 'no-model' });
    // Both missing: the model is the first thing to fix.
    expect(searchReadiness(cfg({ keys: {}, searchMode: 'off' }))).toEqual({
      ok: false,
      reason: 'no-model',
    });
  });

  it('refuses a connected model whose Web search is off', () => {
    expect(searchReadiness(cfg({ searchMode: 'off' }))).toEqual({
      ok: false,
      reason: 'search-off',
    });
  });

  it('says what to change, in the words the Live settings use', () => {
    expect(searchBlockLine('no-model')).toMatch(/Connect a model in Live/);
    expect(searchBlockLine('search-off')).toMatch(/Web search to Real-time/);
  });
});

describe('every create and check entry reads the one judgement', () => {
  const dir = join(__dirname, '..', 'src', 'live', 'dashboards');
  const surfaces = [
    'TrackComposer.tsx',
    'NewFromTemplate.tsx',
    'AddWidgetPalette.tsx',
    'PinToDashboard.tsx',
    'ExtractionPreview.tsx',
    'TalkToDashboard.tsx',
    'DashboardHome.tsx',
    'DashboardDetail.tsx',
    'useDashboardLoop.ts',
  ];

  it.each(surfaces)('%s imports searchReadiness', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src).toMatch(/import \{[^}]*searchReadiness[^}]*\} from '\.\/searchReadiness'/);
  });

  it('points every gate at Live, and never calls anything free', () => {
    // The loop's own comments use "free" for "costs no call"; the reader-facing copy lives in
    // the surfaces and these three modules, and a provider claim has no place in any of it.
    const copy = surfaces.filter((f) => f !== 'useDashboardLoop.ts');
    for (const file of [...copy, 'searchReadiness.ts', 'confirmAdd.ts', 'trackerState.ts']) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).not.toMatch(/\bfree\b/i);
    }
    const gated = [
      'TrackComposer.tsx',
      'NewFromTemplate.tsx',
      'AddWidgetPalette.tsx',
      'PinToDashboard.tsx',
      'TalkToDashboard.tsx',
    ];
    for (const file of gated) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).toContain('href="#/live"');
    }
  });
});
