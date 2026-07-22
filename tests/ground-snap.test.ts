// The quote-snapping recovery path: noisy sources (OCR scans) ground real claims by aligning the
// model's quote to the page and adopting the page's OWN text — while fabrications still die. The
// strict verbatim gate is unchanged; every snapped quote must re-pass it.
import { describe, it, expect } from 'vitest';
import { snapQuoteToPage, isVerbatimOnPage } from '../src/live/ground/verbatim';
import { groundClaims } from '../src/live/prism/mapping';

// Verbatim OCR output from the 1906 Wright brothers patent scan (pdftotext) — the document that
// exposed the gap: clean model quotes matched none of this.
const OCR_PAGE = `No. 821,393.

PATENT-ED MAY 22, 1906.v
' 0. & w.. WRIGHT.

FLYING MACHINE.
APPLICATION 21mm MAR; 23, 1903.
3 SHEETS-SHEET 1.

Be it known that we, ORVILLE WRIGHT and WILBUR WRIGHT, citizens of the United States,
residing in the city of Dayton, county of Montgomery, and State of Ohio, have invented
certain new and useful Improvements in Flying-Machines, of which the following is a
speciﬁcation. Our invention relates to that class of ﬂying-machines in which the weight
is sustained by the reactions resulting when one or more aeroplanes are moved through
the air edgewise at a small angle of incidence, either by the application of mechanical
power or by the utilization of the force of gravity.`;

describe('snapQuoteToPage', () => {
  it('snaps a clean quote onto garbled OCR and the result passes the strict gate', () => {
    // The model quotes the sentence cleanly; the page has ligatures + OCR artifacts.
    const quote =
      'Our invention relates to that class of flying-machines in which the weight is sustained by the reactions';
    const snapped = snapQuoteToPage(quote, OCR_PAGE);
    expect(snapped).toBeTruthy();
    expect(isVerbatimOnPage(snapped!, OCR_PAGE)).toBe(true);
    expect(snapped).toContain('invention relates');
  });

  it('recovers OCR-mangled words (PATENTED vs PATENT-ED)', () => {
    const snapped = snapQuoteToPage(
      'PATENTED MAY 22, 1906. O. & W. WRIGHT. FLYING MACHINE.',
      OCR_PAGE,
    );
    expect(snapped).toBeTruthy();
    expect(isVerbatimOnPage(snapped!, OCR_PAGE)).toBe(true);
  });

  it('returns the exact source span for an already-verbatim quote', () => {
    const snapped = snapQuoteToPage(
      'residing in the city of Dayton, county of Montgomery',
      OCR_PAGE,
    );
    expect(snapped).toBeTruthy();
    expect(OCR_PAGE.normalize('NFKC')).toContain(snapped!);
  });

  it('rejects a fabricated quote that merely shares topic words', () => {
    expect(
      snapQuoteToPage(
        'The Wright brothers sold their flying machine patent to the government for a large sum of money',
        OCR_PAGE,
      ),
    ).toBeNull();
  });

  it('rejects short fragments and empty quotes', () => {
    expect(snapQuoteToPage('WRIGHT', OCR_PAGE)).toBeNull();
    expect(snapQuoteToPage('', OCR_PAGE)).toBeNull();
  });
});

describe('snapQuoteToPage · two-column interleave', () => {
  // Real normalized extraction from the patent's page 4: the OCR layer interleaves the two print
  // columns line-by-line, so the quote's words are interrupted by runs from the other column and
  // no contiguous window ever matches. The subsequence stage must bridge those runs.
  const INTERLEAVED = `portions of the machine. Each aeroplane means for maintaining or restoring the equi- is of considerablygreater width from side'to librium, or lateral balance of the apparatus, side than from front to rear other means for guiding the machine both vertically and horizontally provide a structure combining lightness, strength, convenience of construction`;

  it('bridges interleaved column runs and returns real page text', () => {
    const snapped = snapQuoteToPage(
      'means for maintaining or restoring the equilibrium, or lateral balance of the apparatus',
      INTERLEAVED,
    );
    expect(snapped).toBeTruthy();
    expect(isVerbatimOnPage(snapped!, INTERLEAVED)).toBe(true);
  });

  it('still rejects a fabrication against the interleaved page', () => {
    expect(
      snapQuoteToPage(
        'a gasoline engine of twelve horsepower drives the twin propellers through chains',
        INTERLEAVED,
      ),
    ).toBeNull();
  });
});

describe('groundClaims with snapping', () => {
  const pages = [
    'first page about something else entirely, no aviation content here at all',
    OCR_PAGE,
  ];

  it('grounds a noisy-source claim by rewriting its quote to the page text', () => {
    const claims = groundClaims(
      [
        {
          quote:
            'Our invention relates to that class of flying-machines in which the weight is sustained',
          page: 2,
        },
      ],
      pages,
    );
    expect(claims).toHaveLength(1);
    expect(isVerbatimOnPage(claims[0].quote, OCR_PAGE)).toBe(true);
  });

  it('finds the right page when the model miscounts', () => {
    const claims = groundClaims(
      [
        {
          quote:
            'citizens of the United States, residing in the city of Dayton, county of Montgomery',
          page: 1,
        },
      ],
      pages,
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].page).toBe(2);
  });

  it('still drops fabrications', () => {
    const claims = groundClaims(
      [{ quote: 'The patent was immediately licensed to European manufacturers in 1907', page: 2 }],
      pages,
    );
    expect(claims).toHaveLength(0);
  });
});
