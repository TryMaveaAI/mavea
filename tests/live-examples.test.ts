// The example gauntlet — makes "every component has a real, working example" a hard,
// enforced requirement (not best-effort). Examples are harvested from the demo conversations
// (the same source the gallery renders, so they can't drift), then the menu shows them to the
// model so it fills advanced components correctly. This test guarantees:
//   1. ACCURACY  — every example actually coerces into a renderable block via the Live pipeline
//                  (a wrong/insufficient example fails here, instead of silently dropping at runtime).
//   2. COVERAGE  — every component the selector can offer HAS an example. A new UI kit with no
//                  example (i.e. not used in any demo) fails this — that's the requirement.
import { describe, it, expect } from 'vitest';
import { COERCIBLE_TYPES, BASE_FLOOR, GENERATIVE_BLOCK_TYPES } from '../src/live/select';
import { exampleFor } from '../src/live/select/examples';
import { AUTHORED_EXAMPLES } from '../src/live/select/authoredExamples';
import { validateLiveResponse } from '../src/engine/liveSchema';

// AUTHORED_EXAMPLES is re-assembled by spreading per-domain example modules (examples.*.ts).
// This snapshot locks the exact key SET, COUNT, and ORDER of the merged object, so the split
// stays a pure reorganization — a dropped, duplicated, or reordered entry trips here.
const AUTHORED_KEYS = [
  'docview',
  'pdfreader',
  'annotateddoc',
  'annotcallouts',
  'citationchain',
  'claimgrid',
  'docoutline',
  'redline',
  'agenttrace',
  'calibration',
  'formpanel',
  'waveform',
  'diagram',
  'beforeafter',
  'carousel',
  'lightbox',
  'videoembed',
  'moodboard',
  'imagecallouts',
  'dialogue',
  'variants',
  'verse',
  'slidedeck',
  'timezones',
  'transitroute',
  'amortization',
  'quadrant',
  'bodymap',
  'pronunciation',
  'dictionary',
  'translation',
  'syntaxbreakdown',
  'codewalk',
  'receipt',
  'settleup',
  'bracketbar',
  'gloss',
  'geomap',
  'embedmap',
  'matrix',
  'datatable',
  'pivot',
  'treetable',
  'matrixgrid',
  'kanban',
  'bubble',
  'sunburst',
  'treemap',
  'network',
  'sankey',
  'orgchart',
  'decisiontree',
  'codeblock',
  'treeview',
  'gantt',
  'goaltree',
  'journeymap',
  'milestones',
  'plandag',
  'processflow',
  'roadmap',
  'wizard',
  'recipecard',
  'workoutplan',
  'medicationschedule',
  'macrobreakdown',
  'chorddiagram',
  'developmentmilestone',
  'argumentmap',
  'sportspitch',
  'floorplan',
  'ingredientmatrix',
  'clinicaltimeline',
  'researchsummary',
  'conjugation',
  'gridmatrix',
  'fractionbar',
  'dotplot',
  'controlchart',
  'probabilitytree',
  'teachdiagram',
];

describe('AUTHORED_EXAMPLES (per-domain split)', () => {
  it('re-assembles to the same keys, count, and order', () => {
    expect(Object.keys(AUTHORED_EXAMPLES)).toEqual(AUTHORED_KEYS);
    expect(Object.keys(AUTHORED_EXAMPLES)).toHaveLength(AUTHORED_KEYS.length);
  });
});

// Generative meta-primitives (e.g. `composite`) are exempt: the model COMPOSES them from
// child blocks that each already have their own example, so they aren't demo'd standalone.
const OFFERABLE = [...COERCIBLE_TYPES].filter((t) => !GENERATIVE_BLOCK_TYPES.has(t));

describe('component examples (the gauntlet)', () => {
  it('COVERAGE — every offerable component has an example', () => {
    const missing = OFFERABLE.filter((type) => exampleFor(type) === null);
    // A new component with no example (not used in any demo) lands here. Add a demo block
    // that uses it (the same thing that makes it show in #/gallery) and this clears.
    expect(missing, `components missing an example: ${missing.join(', ')}`).toEqual([]);
  });

  it('ACCURACY — every example coerces into a renderable block', () => {
    const broken: string[] = [];
    for (const type of OFFERABLE) {
      const ex = exampleFor(type);
      if (!ex) continue; // covered by the coverage test
      let props: unknown;
      try {
        props = JSON.parse(ex);
      } catch {
        broken.push(`${type} (bad JSON)`);
        continue;
      }
      const v = validateLiveResponse(
        { title: 't', narration: 'n', blocks: [{ type, props }] },
        new Set([type, ...BASE_FLOOR]),
        12,
      );
      if (!v || !v.blocks.some((b) => b.type === type)) broken.push(type);
    }
    expect(broken, `examples that don't render: ${broken.join(', ')}`).toEqual([]);
  });
});

// Phase 2c: the LEAD heroes (top-3 wow) get a DENSER example so the model fills the block at
// demo-grade depth (the demos run ~4-5 items/block; the old 2-item cap taught thin canvases).
// These lock that the dense tier truly adds items, never breaks an example, and never regresses
// the default (thin) tier the gauntlet above relies on.
describe('dense lead-hero examples (Phase 2c)', () => {
  it('the default tier is byte-for-byte the old thin example (no caller regresses)', () => {
    for (const type of OFFERABLE) {
      expect(exampleFor(type, false)).toBe(exampleFor(type));
    }
  });

  it('the dense tier never SHRINKS an example and meaningfully grows the rich ones', () => {
    let grew = 0;
    for (const type of OFFERABLE) {
      const thin = exampleFor(type, false);
      const dense = exampleFor(type, true);
      if (thin === null || dense === null) continue;
      expect(dense.length).toBeGreaterThanOrEqual(thin.length); // more items/chars only ever grows
      if (dense.length > thin.length) grew += 1;
    }
    // Plenty of demo blocks carry >2 items or >48-char strings, so the dense tier must lift many.
    expect(grew).toBeGreaterThan(20);
  });

  it('every dense example still coerces into a renderable block (dense slices stay valid)', () => {
    const broken: string[] = [];
    for (const type of OFFERABLE) {
      const ex = exampleFor(type, true);
      if (!ex) continue;
      let props: unknown;
      try {
        props = JSON.parse(ex);
      } catch {
        broken.push(`${type} (bad JSON)`);
        continue;
      }
      const v = validateLiveResponse(
        { title: 't', narration: 'n', blocks: [{ type, props }] },
        new Set([type, ...BASE_FLOOR]),
        12,
      );
      if (!v || !v.blocks.some((b) => b.type === type)) broken.push(type);
    }
    expect(broken, `dense examples that don't render: ${broken.join(', ')}`).toEqual([]);
  });

  it('a dense example stays bounded (a future flagship demo can not blow up the menu)', () => {
    let max = 0;
    let maxType = '';
    for (const type of OFFERABLE) {
      const ex = exampleFor(type, true);
      if (ex && ex.length > max) {
        max = ex.length;
        maxType = type;
      }
    }
    // Today's largest dense example is ~1,040 chars (datatable); a 2,000-char ceiling catches a
    // pathological future demo before it bloats every turn's prompt.
    expect(max, `largest dense example is ${maxType} at ${max} chars`).toBeLessThan(2000);
  });

  it('keeps count-coupled sibling arrays aligned (compact() slices each array independently)', () => {
    // The real risk: compact() trims EVERY array to maxArray on its own, so a chart whose labels
    // and series[].data straddle the cap could desync (labels=4, data=5) and render wrong. Assert
    // the demo-sourced examples whose siblings must match 1:1 stay aligned at the DENSE cap.
    const desynced: string[] = [];
    for (const type of OFFERABLE) {
      const ex = exampleFor(type, true);
      if (!ex) continue;
      const p = JSON.parse(ex) as Record<string, unknown>;
      // chart / scatter / dual-axis shape: labels length === each series' data length
      if (Array.isArray(p.labels) && Array.isArray(p.series)) {
        for (const s of p.series as { name?: string; data?: unknown }[])
          if (Array.isArray(s.data) && s.data.length !== (p.labels as unknown[]).length)
            desynced.push(
              `${type}: labels ${(p.labels as unknown[]).length} vs data ${s.data.length}`,
            );
      }
      // radar shape: axes length === each series' values length
      if (Array.isArray(p.axes) && Array.isArray(p.series)) {
        for (const s of p.series as { values?: unknown }[])
          if (Array.isArray(s.values) && s.values.length !== (p.axes as unknown[]).length)
            desynced.push(
              `${type}: axes ${(p.axes as unknown[]).length} vs values ${s.values.length}`,
            );
      }
      // compare shape: options length === each criterion's cells length
      if (Array.isArray(p.options) && Array.isArray(p.criteria)) {
        for (const c of p.criteria as { label?: string; cells?: unknown }[])
          if (Array.isArray(c.cells) && c.cells.length !== (p.options as unknown[]).length)
            desynced.push(
              `${type}: options ${(p.options as unknown[]).length} vs cells ${c.cells.length}`,
            );
      }
    }
    expect(desynced, `dense examples with desynced sibling arrays: ${desynced.join('; ')}`).toEqual(
      [],
    );
  });
});
