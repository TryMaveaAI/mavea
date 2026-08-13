// A lazily-imported export chunk can fail to LOAD outright — an offline reload against a
// redeployed build, a blocked or evicted asset — which is a different failure from the import
// merely being slow. Both used to come back as `null`, so a dead chunk was reported to the user as
// "Export timed out — check your connection", and the "renderer unavailable — use Print instead"
// path was unreachable dead code. The loaders now answer `undefined` for an unusable chunk and
// leave `null` to mean "never settled".
import { describe, expect, it, vi } from 'vitest';

vi.mock('modern-screenshot', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
// jsPDF is loaded before the screenshot chunk is checked, so it needs a stand-in of its own — the
// real library expects a browser canvas jsdom does not have.
vi.mock('jspdf', () => ({ jsPDF: class {} }));

import {
  ExportTimeoutError,
  ExportUnavailableError,
  rasterizePages,
  rasterToPdf,
} from '../src/export/pipeline/raster';

function pageContainer(): HTMLElement {
  const container = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'ex-page';
  container.appendChild(page);
  return container;
}

describe('a failed chunk import is reported as unavailable, never as a timeout', () => {
  it('rasterToPdf throws ExportUnavailableError', async () => {
    const failed = rasterToPdf(pageContainer(), { background: '#ffffff' });
    await expect(failed).rejects.toBeInstanceOf(ExportUnavailableError);
    await expect(failed).rejects.not.toBeInstanceOf(ExportTimeoutError);
  });

  it('rasterizePages throws ExportUnavailableError', async () => {
    const failed = rasterizePages(pageContainer(), { background: '#ffffff' });
    await expect(failed).rejects.toBeInstanceOf(ExportUnavailableError);
    await expect(failed).rejects.not.toBeInstanceOf(ExportTimeoutError);
  });
});
