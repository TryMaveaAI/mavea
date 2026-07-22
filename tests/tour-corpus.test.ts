// tour-corpus.test.ts — the first-run walkthrough replays COMMITTED fixtures of real Live output,
// so their integrity is load-bearing: if a baked frame lost its block ids, its narration, or its
// tour indices drifted out of range, the tour would render blank cards or crash the spotlight
// walk on the real surface. These guard that every baked conversation is fully offline-replayable,
// that every chapter's action resolves against the corpus, and that the Prism documents carry the
// bytes their page renders need. Pure data checks — no model, no network.
import { beforeAll, describe, it, expect } from 'vitest';
import { loadTourCorpus, tourConversations } from '../src/tour/corpus';
import { loadTourPrism } from '../src/tour/corpus/prism';
import { ALL_CHAPTERS, TOUR, tourFrame } from '../src/tour/tourPlan';

// The corpus JSON loads through a lazy chunk (corpus/index.ts) and the sync reads are empty until
// then — resolve it up front, exactly the way the driver's corpusReady gate does on the surface.
beforeAll(() => loadTourCorpus());

describe('tour corpus', () => {
  it('has baked conversations', () => {
    expect(tourConversations().length).toBeGreaterThan(0);
  });

  it('every conversation is offline-replayable (frame + narration + id-bearing blocks)', () => {
    for (const c of tourConversations()) {
      expect(c.frames.length, c.id).toBeGreaterThan(0);
      const f = c.frames[0];
      expect(f.narration.trim().length, `${c.id} narration`).toBeGreaterThan(0);
      expect(f.spec.blocks.length, `${c.id} blocks`).toBeGreaterThan(0);
      // Every block must carry an id — the spotlight/replay anchors on data-spot-id.
      for (const b of f.spec.blocks) expect(b.id, `${c.id} block ${b.type} id`).toBeTruthy();
      // Every stored tour stop must point at a real block (else the walk drops or misfires).
      for (const t of f.tour) {
        expect(f.spec.blocks[t.index], `${c.id} tour index ${t.index}`).toBeTruthy();
      }
    }
  });
});

describe('walkthrough chapters (tourPlan)', () => {
  it('every chapter that names a baked answer resolves it against the corpus', () => {
    for (const ch of ALL_CHAPTERS) {
      const a = ch.action;
      const ids =
        a.kind === 'answer' || a.kind === 'chip' || a.kind === 'canvas' || a.kind === 'focusWalk'
          ? [a.convoId]
          : a.kind === 'montage'
            ? a.convoIds
            : a.kind === 'bend' && a.convoId
              ? [a.convoId]
              : [];
      for (const id of ids) {
        const f = tourFrame(id);
        expect(f, `${ch.id} → ${id}`).toBeTruthy();
        expect(f!.frame.spec.blocks.length, `${ch.id} → ${id} blocks`).toBeGreaterThan(0);
      }
    }
  });

  it('the needs-a-canvas seed exists (chapters entered out of order rely on it)', () => {
    expect(tourFrame('money')).toBeTruthy();
  });

  it('shows the punchy ask on the answer chapter, and stamps it onto the frame', () => {
    const draws = TOUR.find((ch) => ch.action.kind === 'answer');
    expect(draws).toBeTruthy();
    const a = draws!.action;
    if (a.kind !== 'answer') throw new Error('unreachable');
    const f = tourFrame(a.convoId, a.ask);
    expect(f).toBeTruthy();
    // The curated question is stamped onto the frame too, so the transcript rail and the
    // AnswerHero both read the natural ask (not the verbose baked generation prompt).
    expect(f!.question).toBe(a.ask);
    expect(f!.frame.question).toBe(a.ask);
  });
});

describe('tour prism fixture', () => {
  it('every baked document ships its bytes and a grounded map', async () => {
    const docs = await loadTourPrism();
    // The chapter flips two documents; the fixture must cover at least that.
    expect(docs.length).toBeGreaterThanOrEqual(2);
    for (const d of docs) {
      // Real bytes — the drill-in renders the actual page (pdf.js / text pages) from these.
      expect(d.doc.data.length, `${d.id} bytes`).toBeGreaterThan(1000);
      expect(d.doc.mime, `${d.id} mime`).toBeTruthy();
      // A grounded map worth flying: several claims, each with a verbatim quote + a real page.
      expect(d.spec.claims.length, `${d.id} claims`).toBeGreaterThanOrEqual(3);
      const pages = d.spec.documents[0]?.pageCount ?? 0;
      expect(pages, `${d.id} pageCount`).toBeGreaterThan(0);
      for (const c of d.spec.claims) {
        expect(c.quote.trim().length, `${d.id} claim quote`).toBeGreaterThan(0);
        expect(c.page, `${d.id} claim page`).toBeGreaterThanOrEqual(1);
        expect(c.page, `${d.id} claim page ≤ pages`).toBeLessThanOrEqual(pages);
      }
    }
  });

  it('leads with the PDF (the chapter is "drop in a PDF")', async () => {
    const docs = await loadTourPrism();
    expect(docs[0].type).toBe('pdf');
  });
});
