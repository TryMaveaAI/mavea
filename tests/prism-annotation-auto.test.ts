import { describe, expect, it } from 'vitest';
import { claimReelCaption } from '../src/live/prism/annotation/pen';
import { autoAnnotationSteps } from '../src/live/prism/annotation/annotationAuto';
import type { Attachment } from '../src/live/attachments';
import type { Claim, PrismSpec } from '../src/live/prism/types';

// The share reel's auto tour builds its narration with no model call. These lock the two things the
// user called out: the caption is a guided-tour line (frames WHY it matters) — NOT a raw quote dump —
// and a non-PDF document still produces beats (a caption-only card), so the reel is never empty.

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: 'k',
    quote: 'Net revenue rose 12% to $4.2B in the fourth quarter of the fiscal year.',
    page: 3,
    kind: 'stat',
    title: 'Net revenue rose 12%',
    ask: 'how?',
    role: 'load-bearing',
    region: 'Results',
    source: 0,
    ...over,
  };
}

function spec(claims: Claim[], doc: Partial<PrismSpec['documents'][number]> = {}): PrismSpec {
  return {
    documents: [{ fileName: 'notes.txt', pageCount: 1, ...doc }],
    fileName: 'notes.txt',
    pageCount: 1,
    claims,
    regions: ['Results'],
    threads: [],
  };
}

const textDoc: Attachment = {
  name: 'notes.txt',
  mime: 'text/plain',
  data: '',
  size: 10,
};

describe('claimReelCaption', () => {
  it('frames the claim by role + kind + page, without dumping the raw quote', () => {
    const cap = claimReelCaption(claim());
    expect(cap).toBe('The figure the document leans on · page 3');
    // never the verbatim sentence
    expect(cap).not.toContain('$4.2B');
  });

  it('reads naturally for each role', () => {
    expect(claimReelCaption(claim({ role: 'supporting', kind: 'finding', page: 2 }))).toBe(
      'Supporting finding · page 2',
    );
    expect(claimReelCaption(claim({ role: 'context', kind: 'definition', page: 1 }))).toBe(
      'Context — definition · page 1',
    );
    expect(claimReelCaption(claim({ role: 'load-bearing', kind: 'forecast', page: 4 }))).toBe(
      'The forecast the document leans on · page 4',
    );
  });
});

describe('autoAnnotationSteps', () => {
  it('emits a framed caption beat for a non-PDF document (reel is never empty)', async () => {
    const steps = await autoAnnotationSteps(spec([claim()]), [textDoc]);
    expect(steps).toHaveLength(1);
    expect(steps[0].pageImage).toBe(''); // no raster — the finish shows a clean card
    expect(steps[0].rects).toEqual([]);
    expect(steps[0].explanation).toBe('The figure the document leans on · page 3');
    expect(steps[0].title).toBe('Net revenue rose 12%');
    // the explanation is a tour line, not the verbatim quote
    expect(steps[0].explanation).not.toContain('$4.2B');
  });
});
