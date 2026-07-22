import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TOUR } from '../src/tour/tourPlan';

describe('core walkthrough feature scenes', () => {
  it('uses the canvas Pen on the answer instead of the user Highlight tool', () => {
    const pen = TOUR.find((chapter) => chapter.id === 'mark');
    expect(pen?.spotlight).toBe('.pen-toggle-pill');
    expect(pen?.action.kind).toBe('penDemo');
    expect(pen?.coach).toContain('Pen');
    expect(pen?.coach).toContain('circle');
    expect(pen?.coach).toContain('underline');
    expect(pen?.coach).not.toContain('Highlight');
  });

  it('draws and holds two real Pen strokes during the explanation scene', () => {
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(driver).toMatch(/drawPenTourStep\('result'\)/);
    expect(driver).toMatch(/drawPenTourStep\('reason'\)/);
    expect(driver).toMatch(/after\(7200, \(\) => o\.setSpot\(null\)\)/);
    expect(live).toMatch(/kind: 'circle', at: '\$76,123'/);
    expect(live).toMatch(/kind: 'underline', at: '7\.6x'/);
  });

  it('uses the presentation and document studio instead of the share reel', () => {
    const publish = TOUR.find((chapter) => chapter.id === 'share');
    expect(publish?.action.kind).toBe('export');
    expect(publish?.coach).toContain('presentation');
    expect(publish?.coach).toContain('document');
  });

  it('opens the real five-provider BYOK settings without changing configuration', () => {
    const connect = TOUR.find((chapter) => chapter.id === 'connect');
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const settings = readFileSync(join(__dirname, '../src/live/LiveSettings.tsx'), 'utf8');

    expect(connect?.action.kind).toBe('connect');
    expect(driver).toMatch(/a\.kind === 'connect'[\s\S]*?o\.openModelSettings\(\)/);
    expect(live).toMatch(/openModelSettings:[\s\S]*?setSettingsTab\('model'\)/);
    expect(settings).toContain('settings-provider-picker');
    expect(settings).toContain('settings-api-key-field');
    expect(driver).not.toMatch(/a\.kind === 'connect'[\s\S]{0,300}setProviderField/);
  });

  it('paces the spatial canvas and warms Prism early enough to visit several source pages', () => {
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    const prism = TOUR.find((chapter) => chapter.id === 'prism');

    expect(driver).toMatch(/2700 \+ i \* 1900/);
    expect(prism?.durationMs).toBeGreaterThanOrEqual(30_000);
    expect(live).toMatch(/Promise\.all\(\[tourPrismLoad\.preload\(\), loadTourPrism\(\)\]\)/);
  });

  it('starts the guided format sequence only after the lazy export modal mounts', () => {
    const modal = readFileSync(join(__dirname, '../src/export/ExportModal.tsx'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(modal).toMatch(/if \(!guided\) return/);
    expect(modal).toMatch(/setFormat\('document'\)/);
    expect(live).toMatch(
      /guided=\{tourMode\.current && tourDrive\.chapter\?\.action\.kind === 'export'\}/,
    );
  });
});
