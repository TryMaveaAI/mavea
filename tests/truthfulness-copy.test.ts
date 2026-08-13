import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CAST } from '../src/demo/cast';
import { MODEL_CATALOG_AUDIT, providerInfo } from '../src/live/providers/info';

const root = resolve(import.meta.dirname, '..');

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

const publicCopyFiles = [
  'README.md',
  'docs/FEATURES.md',
  'docs/LIVE-SETUP.md',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'src/demo/DemoOverlay.tsx',
  'src/demo/cast.ts',
  'src/flagship/sections/DemoGallery.tsx',
  'src/flagship/sections/FlagshipShowcase.tsx',
  'src/flagship/sections/HonestByDesign.tsx',
  'src/flagship/sections/SignatureLoop.tsx',
  'src/flagship/sections/TwoSurfaces.tsx',
  'src/live/features/registry.ts',
] as const;

describe('public claims stay bounded by shipped behavior', () => {
  it.each([
    'Watch a real session',
    'Play a real session',
    "person's session",
    'there is no backend',
    'Mavéa keeps everything in the browser',
    'keys stay on your device',
    'never leave your browser',
    'every number traced to its line',
    'whole blast radius',
    "Everything you've ever discussed",
    "Four things you've never",
    'Real map · 3 locations · drag to explore',
    'Whatever you ask, you get the right picture',
    'Everything you discuss becomes a place',
    'See it live',
    'on this device only — to personalize future chats',
    'Nothing was staged',
    'replayed exactly',
    'See it for real',
    'Watch a frozen session',
    'Play the session',
    'CFO · 48',
    'Student · 20',
    'Engineer · 33',
    'Traveler · 34',
  ])('does not publish the unbounded claim %j', (claim) => {
    const offenders = publicCopyFiles.filter((file) => read(file).includes(claim));
    expect(offenders, `${claim} appears in ${offenders.join(', ')}`).toEqual([]);
  });

  it('labels curated prerecorded demos and the static landing illustration honestly', () => {
    const gallery = read('src/flagship/sections/DemoGallery.tsx');
    const overlay = read('src/demo/DemoOverlay.tsx');
    expect(gallery).toContain('fictional scenario');
    expect(gallery).toContain('prerecorded, model-generated answer sequence');
    expect(gallery).toContain('curated feature choreography');
    expect(gallery).toContain('No live provider call runs during playback');
    expect(overlay).toContain('fictional scenario');
    expect(overlay).toContain('not a live result or customer testimonial');
    expect(DEMO_CAST.every((member) => member.role.startsWith('Fictional '))).toBe(true);
    expect(read('src/flagship/sections/SignatureLoop.tsx')).toContain('Illustrated example');
  });

  it('keeps the fast, low-cost model defaults aligned with the setup guide', () => {
    const setup = read('docs/LIVE-SETUP.md');
    for (const id of ['gemini', 'anthropic', 'openai', 'grok'] as const) {
      const model = providerInfo(id).defaultModel;
      expect(model).not.toBe('');
      expect(setup).toContain(`\`${model}\``);
      expect(providerInfo(id).suggestedModels).toContain(model);
    }
  });

  it('does not recommend volatile stealth or rotating free aliases', () => {
    const openrouter = providerInfo('openrouter');
    expect(openrouter.suggestedModels.some((model) => /alpha|:free\b/i.test(model))).toBe(false);
  });

  it('forces a fresh official model-catalog review before release', () => {
    const verified = Date.parse(`${MODEL_CATALOG_AUDIT.verifiedOn}T00:00:00Z`);
    const ageDays = (Date.now() - verified) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(0);
    expect(ageDays).toBeLessThanOrEqual(MODEL_CATALOG_AUDIT.maxAgeDays);
    expect(Object.keys(MODEL_CATALOG_AUDIT.sources)).toEqual([
      'gemini',
      'anthropic',
      'openai',
      'grok',
      'openrouter',
    ]);
  });
});
