// export-print-notes.test.ts — the "Print with notes" vector path (printDeckWithNotes). Exercises
// the real portal DOM (no rasterizer involved — this is the selectable-text print path, same as
// printDeck), asserting each slide's speaker-notes text actually lands in the printed structure and
// that a slide with no composed `notes` falls back to the same content-derived label the pptx/PDF
// paths use. window.print is stubbed since jsdom doesn't implement it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printDeckWithNotes } from '../src/export/pipeline/exportDeck';
import type { Slide } from '../src/slides/model/Slide';
import { SLIDE_SKINS } from '../src/slides/skins/registry';

const skin = SLIDE_SKINS.folio;

const slides: Slide[] = [
  {
    kind: 'cover',
    id: 'cover',
    source: -1,
    data: { title: 'The State of Urban Mobility', subtitle: 'A field study across twelve cities' },
    // no notes — exercises the content-derived fallback
  },
  {
    kind: 'quote',
    id: 'q1',
    source: 0,
    data: { body: 'Density drives ridership.', attribution: 'City Atlas' },
    notes: 'Emphasize the density stat before moving to frequency.',
  },
];

/** Finish the print portal's lifecycle the same way a real `afterprint` event would, so the host
 *  and its 120s safety timer never leak into the next test. */
function finishPrint() {
  window.dispatchEvent(new Event('afterprint'));
}

afterEach(() => {
  finishPrint();
  document.body.classList.remove('mavea-printing');
  document.querySelectorAll('.mavea-export-slides-notes').forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe('printDeckWithNotes — the speaker-notes print handout', () => {
  it('prints one notes block per slide, each carrying that slide’s real notes text', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);

    const pages = document.querySelectorAll('.mavea-export-slides-notes .slide-page-notes');
    expect(pages.length).toBe(slides.length);

    const notesText = Array.from(
      document.querySelectorAll('.mavea-export-slides-notes .slide-notes-text'),
    ).map((el) => el.textContent);
    // Cover has no composed `notes` → falls back to its own title (slideText's cover case), the
    // same fallback the pptx export and Present's presenter overlay use. The quote's real composed
    // notes line passes through unchanged.
    expect(notesText).toEqual([
      'The State of Urban Mobility',
      'Emphasize the density stat before moving to frequency.',
    ]);
  });

  it('triggers a real window.print() and marks the body for the print-only CSS scope', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    const done = printDeckWithNotes(slides, skin);
    await done;

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('mavea-printing')).toBe(true);
  });

  it('uses its own host class so its page rules can never leak onto the plain (no-notes) print', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);

    const host = document.querySelector('.mavea-export-doc.mavea-export-slides-notes');
    expect(host).not.toBeNull();
    expect(host?.classList.contains('mavea-export-slides')).toBe(false);
  });

  it('tears the portal down once printing finishes (afterprint), leaving no leaked DOM', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);
    expect(document.querySelector('.mavea-export-slides-notes')).not.toBeNull();

    finishPrint();

    expect(document.querySelector('.mavea-export-slides-notes')).toBeNull();
    expect(document.body.classList.contains('mavea-printing')).toBe(false);
  });
});
