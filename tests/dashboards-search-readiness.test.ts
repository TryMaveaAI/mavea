// A tracker is a standing web search. Two things have to be true before one can be created or
// checked: a model that can generate, and Web search set to Real-time — a key alone answers from
// memory, and a board built on that grounds nothing on every pass. searchReadiness is the ONE
// judgement every create and refresh entry reads, so a surface cannot drift into offering a
// tracker the loop would then refuse.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  searchBlockCta,
  searchBlockHref,
  searchBlockLine,
  searchReadiness,
} from '../src/live/dashboards/searchReadiness';
import { failureLine } from '../src/live/dashboards/trackerState';
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
    expect(searchBlockLine('search-off')).toMatch(/Web search is off/);
  });

  // A reader who has never opened the panel knows neither half: that Web search is a setting at
  // all, or that it only grounds anything on a model that can search. Saying one and not the other
  // sends them to a control that then does nothing for them.
  it('names both halves of the search requirement', () => {
    const line = searchBlockLine('search-off');
    expect(line).toMatch(/settings/i);
    expect(line).toMatch(/model that can search/i);
  });

  it('links to the control itself, not just the surface holding it', () => {
    expect(searchBlockHref('search-off')).toBe('#/live?settings=web-search');
    expect(searchBlockHref('no-model')).toBe('#/live?settings=model');
    // The link says the control it opens, so it still reads correctly beside either sentence.
    expect(searchBlockCta('search-off')).toMatch(/web search/i);
    expect(searchBlockCta('no-model')).toMatch(/model/i);
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
      'ExtractionPreview.tsx',
      'DashboardHome.tsx',
      'DashboardDetail.tsx',
    ];
    // Pinned as the HELPER, never as a literal URL: a gate that hardcodes '#/live' drops the
    // reader on Live's front door with no idea which control the sentence meant — which is the
    // report this link exists to answer. Routing through searchBlockHref is what keeps every
    // gate landing on the row itself.
    for (const file of gated) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).toMatch(/href=\{searchBlockHref\(/);
    }
  });
});

describe('the requirement is written in one place', () => {
  const dir = join(__dirname, '..', 'src', 'live', 'dashboards');

  // What this pins is the failure mode, not the wording: a surface that types its own version of
  // the sentence types half of it, and the half it drops is always the model — the half a reader
  // on a model that cannot search needs most, since the switch the other half names does nothing
  // for them. So the sentence is borrowed wherever it is said, never retyped.
  it('no other module writes its own blocked-search sentence', () => {
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
      (file) => /\.tsx?$/.test(file) && file !== 'searchBlock.ts',
    );
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/Web search is off/);
    }
  });

  // A tracker that failed its check says so on its tile and in the check log. It reads as a status
  // rather than a gate, which is exactly how it came to carry its own half-sentence — so it takes
  // the whole requirement and adds only its own promise to it.
  it("a failed tracker's line borrows the requirement whole", () => {
    const line = failureLine({ kind: 'search-off' });
    expect(line).toContain(searchBlockLine('search-off'));
    expect(line).toMatch(/model that can search/i);
    expect(line).toMatch(/starts checking/);
  });
});
