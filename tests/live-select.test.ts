import { select as selectComponents } from './helpers/select';
import { describe, it, expect } from 'vitest';
import {
  detectShapes,
  detectRequested,
  detectSpecialists,
  isMultiPart,
  BASE_FLOOR,
  COERCIBLE_TYPES,
  FAKE_DATA_TYPES,
  GENERATIVE_BLOCK_TYPES,
} from '../src/live/select';

import { metaFor } from '../src/live/select/catalog';
import { weightFor, NOFIT_DAMP_WHEN_FITS_EXIST, TEACHING_KIT } from '../src/live/select/rank';
import type { ShapeVector } from '../src/live/select';
import { exampleFor } from '../src/live/select/examples';
import {
  detectDomains,
  domainFitsOrNeutral,
  blockDomainsOf,
  isCrisis,
} from '../src/live/select/domains';

describe('detectShapes', () => {
  it('reads composition from a budget ask', () => {
    expect(detectShapes('where does my money go each month').composition).toBeGreaterThan(0);
  });
  it('reads a time series from a trend ask', () => {
    expect(
      detectShapes('how has my spending changed over the past 6 months').series,
    ).toBeGreaterThan(0);
  });
  it('reads a comparison from a decision ask', () => {
    expect(detectShapes('should I take the train or fly, compare them').comparison).toBeGreaterThan(
      0,
    );
  });
  it('reads a comparison from an implicit "best X" decision (not just a ranking)', () => {
    // A superlative product question is a decision among options — it wants a side-by-side
    // compare table, not just a one-winner leaderboard. Both shapes should fire.
    const s = detectShapes("what's the best Chromebook");
    expect(s.comparison).toBeGreaterThan(0);
    expect(s.ranking).toBeGreaterThan(0);
  });
  it('reads a comparison from a "should I buy" recommendation ask', () => {
    expect(detectShapes('should I buy a Steam Deck?').comparison).toBeGreaterThan(0);
    expect(detectShapes('is the iPad worth it').comparison).toBeGreaterThan(0);
  });
  it('returns nothing for an off-topic ask (so the caller uses the safe set)', () => {
    expect(Object.keys(detectShapes('hello there friend'))).toHaveLength(0);
  });
  it('reads code from a programming ask', () => {
    expect(detectShapes('how do linked lists work').code).toBeGreaterThan(0);
    expect(detectShapes('explain the quicksort algorithm').code).toBeGreaterThan(0);
  });
});

describe('selectComponents', () => {
  it('always offers the base floor', () => {
    const r = selectComponents({ userText: 'qwerty zxcv nonsense', tier: 'frontier' });
    for (const t of BASE_FLOOR) expect(r.types).toContain(t);
  });

  it('reaches beyond the base floor for a real ask (retrieval contributes)', () => {
    const r = selectComponents({
      userText: 'how should I split my monthly budget',
      tier: 'frontier',
    });
    expect(r.types.length).toBeGreaterThan(BASE_FLOOR.length);
    expect(r.promptSnippet).not.toBe('');
  });

  it('keeps the gate and the type list in sync', () => {
    const r = selectComponents({ userText: 'compare these vendors', tier: 'frontier' });
    expect([...r.allowed].sort()).toEqual([...r.types].sort());
  });

  it('guarantees the on-topic component for a coding ask, regardless of the random draw', () => {
    // The weighted draw alone could miss it; the fit-pin must surface a code block. Several
    // rotations to prove it's guaranteed, not luck.
    for (let rotation = 0; rotation < 5; rotation++) {
      const r = selectComponents({
        userText: 'show me how to implement a linked list in code',
        tier: 'frontier',
        rotation,
      });
      expect(r.types.some((t) => t === 'codeblock' || t === 'codemap' || t === 'diff')).toBe(true);
    }
  });

  it('guarantees an explicitly-requested medium across the random draw', () => {
    // "show me the paper/photos" must always offer the matching component — never lost to the
    // weighted draw — so an explicit format request is honored every time.
    for (let rotation = 0; rotation < 4; rotation++) {
      expect(
        selectComponents({ userText: 'show me the bitcoin whitepaper', tier: 'frontier', rotation })
          .types,
      ).toContain('pdfreader');
      expect(
        selectComponents({ userText: 'show me photos of desserts', tier: 'frontier', rotation })
          .types,
      ).toContain('gallery');
    }
  });

  it('routes a real-world location ask to the REAL map (geomap), never a fake one', () => {
    // A location request must surface geomap — the real MapLibre map with model-supplied lat/lng —
    // every rotation, and must NEVER surface the stylized fakes (map/markermap), which place pins on
    // an invented grid. Presenting made-up geography as real is the exact honesty failure we forbid.
    for (let rotation = 0; rotation < 4; rotation++) {
      const types = selectComponents({
        userText: 'show me the best ramen spots in tokyo on a map',
        tier: 'frontier',
        rotation,
      }).types;
      expect(types).toContain('geomap');
      expect(types).not.toContain('map');
      expect(types).not.toContain('markermap');
    }
  });

  it('never exposes a fabricated-geography block in Live, under any tier', () => {
    // FAKE_DATA_TYPES (map/markermap/choropleth) invent spatial data; they exist only for the
    // scripted demo and must be unreachable by the selector. Two guarantees: they're not coercible,
    // and a geo-heavy ask across tiers never pins one.
    for (const t of FAKE_DATA_TYPES) expect(COERCIBLE_TYPES.has(t)).toBe(false);
    for (const tier of ['frontier', 'mid', 'small'] as const) {
      const types = selectComponents({
        userText: 'map the regions and cities of japan with their populations',
        tier,
      }).types;
      for (const t of FAKE_DATA_TYPES) expect(types).not.toContain(t);
    }
  });

  it('a measured-slow model gets a smaller hero menu (emits less, finishes sooner)', () => {
    const ask = 'plan a detailed 5-day trip to tokyo with food and sights';
    const std = selectComponents({ userText: ask, tier: 'frontier' });
    const slow = selectComponents({ userText: ask, tier: 'frontier', speedTier: 'slow' });
    expect(slow.types.length).toBeLessThan(std.types.length);
    // The base floor is still fully present, so the answer is never starved of reliable blocks.
    for (const t of BASE_FLOOR) expect(slow.types).toContain(t);
  });

  it('respects the per-tier budget (small stays tight)', () => {
    const r = selectComponents({
      userText: 'show an org chart hierarchy tree of the team',
      tier: 'small',
    });
    expect(r.types.length).toBeLessThanOrEqual(BASE_FLOOR.length + 8);
  });

  it('is deterministic for the same input', () => {
    const a = selectComponents({ userText: 'plan three days in tokyo on a map', tier: 'frontier' });
    const b = selectComponents({ userText: 'plan three days in tokyo on a map', tier: 'frontier' });
    expect(a.types).toEqual(b.types);
  });

  it('only exposes types that actually render (never nudges the model toward a dropped block)', () => {
    const asks = [
      'plan three days in tokyo on a map',
      'show an org chart hierarchy tree',
      'rate these three vendors',
      'how is my monthly budget split',
      'give me a rich overview dashboard',
    ];
    for (const userText of asks) {
      const r = selectComponents({ userText, tier: 'frontier' });
      for (const t of r.types) expect(COERCIBLE_TYPES.has(t)).toBe(true);
    }
  });

  // The opt-in generative family (diagramflow now, composite/grid later) must be fully
  // removable so a paid model is never offered it when the user hasn't enabled creation.
  describe('generative exclusion gate', () => {
    // an ask that strongly evokes a process/state-machine diagram, run across rotations so
    // the random draw has many chances to surface diagramflow if it's NOT excluded
    const diagramAsk = 'explain the process and feedback loop as a state machine diagram';

    it('excludes the generative family from types, gate, and menu when excluded', () => {
      for (let rotation = 0; rotation < 30; rotation++) {
        const r = selectComponents({
          userText: diagramAsk,
          tier: 'frontier',
          rotation,
          exclude: GENERATIVE_BLOCK_TYPES,
        });
        for (const gen of GENERATIVE_BLOCK_TYPES) {
          expect(r.types).not.toContain(gen);
          expect(r.allowed.has(gen)).toBe(false);
          expect(r.promptSnippet).not.toContain(gen);
        }
      }
    });

    it('can surface the generative family when NOT excluded (the toggle is meaningful)', () => {
      // across enough rotations the weighted draw should pick diagramflow at least once. 40
      // was enough until controlblockdiagram/sysarchdiagram landed — both textually strong
      // matches for "process and feedback loop" — and pushed diagramflow's hit rate for this
      // ask down to ~5%. Verified it's still genuinely selectable (not excluded by anything),
      // just statistically rarer with more real competition; widened rather than swapping the
      // ask, same call as the earlier progressbar/content-visuals fix in this file.
      const surfaced = Array.from({ length: 150 }, (_, rotation) =>
        selectComponents({ userText: diagramAsk, tier: 'frontier', rotation }),
      ).some((r) => r.types.includes('diagramflow'));
      expect(surfaced).toBe(true);
    });

    it('still offers the full base floor when the generative family is excluded', () => {
      const r = selectComponents({
        userText: diagramAsk,
        tier: 'frontier',
        exclude: GENERATIVE_BLOCK_TYPES,
      });
      for (const t of BASE_FLOOR) expect(r.types).toContain(t);
      expect([...r.allowed].sort()).toEqual([...r.types].sort());
    });
  });
});

describe('selectComponents — variety brain', () => {
  const VAGUE = 'surprise me with something cool';

  it('rotates the menu across turns for the same ask (no fixed top-K)', () => {
    const menus = [0, 1, 2, 3, 4].map((rotation) =>
      selectComponents({ userText: VAGUE, tier: 'frontier', rotation }).types.join('|'),
    );
    // The whole point: the same vague ask must NOT collapse to one identical menu.
    expect(new Set(menus).size).toBeGreaterThan(1);
  });

  it('is reproducible for the same (ask, rotation, recent)', () => {
    const a = selectComponents({ userText: VAGUE, tier: 'frontier', rotation: 7 });
    const b = selectComponents({ userText: VAGUE, tier: 'frontier', rotation: 7 });
    expect(a.types).toEqual(b.types);
  });

  it('down-weights recently-shown types so the next answer differs', () => {
    const first = selectComponents({ userText: VAGUE, tier: 'frontier', rotation: 3 });
    const richPicks = first.types.filter((t) => !BASE_FLOOR.includes(t));
    const next = selectComponents({
      userText: VAGUE,
      tier: 'frontier',
      rotation: 3,
      recent: richPicks,
    });
    // Same seed, but the recent picks are penalized → a different draw. This is the NO-FIT path
    // (a vague ask fits nothing), so the collapse-guard penalty is fully active — exactly what the
    // fit-gated novelty rule preserves: recency still rotates the menu where there's no fit to honor.
    expect(next.types).not.toEqual(first.types);
  });

  it('weightFor: a FITTING type keeps full weight when recent; a NO-FIT type is damped (the fit-gate)', () => {
    // The core of G1, tested directly. Pick any real component and a shape that matches its first
    // dataShape (guaranteed fit), vs an empty shape (no fit). Recency must NOT penalize the fit.
    const meta = metaFor('chart')!;
    const fitShape = { [meta.dataShapes[0]]: 2 } as ShapeVector;
    const used = new Set([meta.type]);
    // Fitting + recently-used → SAME weight as fresh: the right tool is never buried by recency.
    expect(weightFor(meta, fitShape, used)).toBeCloseTo(weightFor(meta, fitShape, new Set()));
    // No-fit + recently-used → strictly damped (the collapse guard for lazy staple repetition).
    expect(weightFor(meta, {}, used)).toBeLessThan(weightFor(meta, {}, new Set()));
  });

  it('keeps the right tool offered even when it was used last turn (FIT beats recency)', () => {
    // A coding ask: codeblock genuinely fits, so it must STILL be offered after being used — the
    // user can reuse the best component, and recency never buries a fitting tool (Phase 1 / G1).
    const ASK = 'show me the python code for quicksort';
    const fresh = selectComponents({ userText: ASK, tier: 'frontier' });
    expect(fresh.types).toContain('codeblock');
    const reused = selectComponents({ userText: ASK, tier: 'frontier', recent: ['codeblock'] });
    expect(reused.types).toContain('codeblock');
  });

  it('shrinks the menu for a lean ask and fills it for a rich one', () => {
    const lean = selectComponents({ userText: VAGUE, tier: 'frontier', complexity: 'lean' });
    const rich = selectComponents({ userText: VAGUE, tier: 'frontier', complexity: 'rich' });
    // Lean adds only a few rich picks on top of the always-present base floor…
    expect(lean.types.length).toBeLessThanOrEqual(BASE_FLOOR.length + 3);
    // …while a rich ask offers a much broader menu.
    expect(rich.types.length).toBeGreaterThan(lean.types.length);
    // The base floor is always present regardless of complexity (the coercible fallback).
    for (const t of BASE_FLOOR) expect(lean.types).toContain(t);
  });
});

describe('selectComponents — fit beats flash (B1)', () => {
  // The audited failure: a flashy zero-fit block (high wowWeight) outranked a plain block that
  // genuinely fit the data, so a shaped ask got striking-but-wrong visuals. The selector damps a
  // zero-fit candidate (NOFIT_DAMP) whenever ANY component fits, so the head-to-head weight the
  // draw actually uses must now favour the fitting block. (The menu itself stays broad on purpose —
  // SHAPE_CAP/FAMILY_CAP force visual contrast — so this is tested at the WEIGHT, not the menu.)
  it('a fitting plain block outranks a flashy off-shape block at the draw weight', () => {
    const plain = metaFor('list')!; // low wow, fits the "list" shape
    const flashy = metaFor('sankey')!; // high wow, but contributes nothing to a list ask
    const fitShape = { list: 1 } as ShapeVector;
    const wPlainFit = weightFor(plain, fitShape, new Set());
    // The selector multiplies a zero-fit candidate by the damp whenever fits exist — replicate that.
    const wFlashyNoFit = weightFor(flashy, {}, new Set()) * NOFIT_DAMP_WHEN_FITS_EXIST;
    expect(wPlainFit).toBeGreaterThan(wFlashyNoFit);
  });

  it('raising fit raises a component’s weight more than its wow alone (fit leads)', () => {
    const m = metaFor('breakdown')!;
    const noFit = weightFor(m, {}, new Set());
    const someFit = weightFor(m, { [m.dataShapes[0]]: 2 } as ShapeVector, new Set());
    // A real shape match should multiply the weight up substantially (W_FIT-driven).
    expect(someFit).toBeGreaterThan(noFit * 2);
  });

  it('a vague ask (nothing fits) still rotates — variety is preserved where there is no fit', () => {
    const VAGUE = 'tell me something interesting';
    const menus = [0, 1, 2, 3, 4].map((rotation) =>
      selectComponents({ userText: VAGUE, tier: 'frontier', rotation }).types.join('|'),
    );
    expect(new Set(menus).size).toBeGreaterThan(1);
  });
});

describe('intent-anchored selection (crux: vague-but-purposeful asks)', () => {
  // The "slot machine" failure: a vague ask trips NO data shape, so shape fit is 0 and the draw
  // collapses to wow-random. But analyzeIntent reads the user's NEED — and 140 components advertise
  // the intents they serve — so the selector can anchor on that need with no shape, model, or latency.
  it('anchors a vague reflection ask via intent (bestFit > 0, no data shape needed)', () => {
    const r = selectComponents({ userText: 'is my friendship draining me', tier: 'frontier' });
    // No shape fires, but the reflection intent is clear → the selector finds real relevance.
    expect(r.bestFit).toBeGreaterThan(0);
  });

  it('anchors a vague decision ask via intent', () => {
    const r = selectComponents({
      userText: 'should I take the new job or stay where I am',
      tier: 'frontier',
    });
    expect(r.bestFit).toBeGreaterThan(0);
  });

  it('leaves a truly-open ask fully varied (no intent + no shape → bestFit 0, random draw)', () => {
    const r = selectComponents({ userText: 'surprise me with something cool', tier: 'frontier' });
    // Nothing to anchor on → the draw stays fully random, exactly where variety should be preserved.
    expect(r.bestFit).toBe(0);
  });

  it('folds a confident on-device semantic match into selection (additive, anchors the ask)', () => {
    // An anchorless ask (no shape, no intent) that the embedder confidently maps to a component:
    // the semantic boost must anchor it (bestFit > 0) and guarantee the matched component into the menu.
    const sem = new Map([['periodictable', 0.7]]);
    const r = selectComponents({
      userText: 'what would a city built by cats be like',
      tier: 'frontier',
      semanticFit: sem,
    });
    expect(r.bestFit).toBeGreaterThan(0);
    expect(r.types).toContain('periodictable');
  });

  it('ignores semantic fit when absent — a cold/weak device behaves exactly as before', () => {
    const r = selectComponents({
      userText: 'what would a city built by cats be like',
      tier: 'frontier',
    });
    expect(r.bestFit).toBe(0);
  });
});

describe('specialist disambiguation (B2)', () => {
  // Each: an ask whose CONTENT calls for a purpose-built specialist that shares a data shape with a
  // generic the model otherwise defaults to. The specialist must be pinned across the random draw.
  const CASES: [string, string][] = [
    ['explain the traffic light as a state machine with its transitions', 'statemachine'],
    ['show a risk matrix of probability and impact for the launch', 'riskmatrix'],
    ['plot the function y = x^2 - 3 over its domain', 'plot'],
    ['draw a sequence diagram of the login request-response flow', 'sequencediagram'],
    ['design the database schema as an entity-relationship diagram', 'erdiagram'],
    ['put these initiatives on a 2x2 priority matrix', 'quadrant'],
    ['show me the periodic table', 'periodictable'],
    ['give me a timeline of the major events of world war 2 in the 1940s', 'chronologicaltimeline'],
    ['show the confusion matrix with true positives and false positives', 'confusionmatrix'],
  ];

  it('pins the content-specialist into the menu across rotations', () => {
    for (const [ask, type] of CASES) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const r = selectComponents({ userText: ask, tier: 'frontier', rotation });
        expect(r.types, `${type} expected for "${ask}"`).toContain(type);
      }
    }
  });

  it('does NOT over-trigger on incidental wording', () => {
    // A plain step timeline stays on the base timeline (no date/era cue).
    expect(detectSpecialists('a timeline of my morning routine')).toHaveLength(0);
    // Topical mentions without the specialist's real signal don't pin.
    expect(detectSpecialists('the table was set for dinner')).toHaveLength(0);
    expect(detectSpecialists('I feel comfortable in this state of mind')).toHaveLength(0);
  });
});

describe('multi-part ask detection (cover every facet)', () => {
  it('fires on a clearly compound ask (additive connector or two questions)', () => {
    expect(isMultiPart('tell me about Inception and also who is in the cast')).toBe(true);
    expect(isMultiPart('what is the capital of France? what is its population?')).toBe(true);
    expect(isMultiPart('explain photosynthesis as well as cellular respiration')).toBe(true);
    expect(isMultiPart('summarize the plot and what about the themes')).toBe(true);
  });

  it('stays quiet on a single ask or a fixed "X and Y" phrase (high precision)', () => {
    expect(isMultiPart('pros and cons of remote work')).toBe(false);
    expect(isMultiPart('compare salt and pepper grinders')).toBe(false);
    expect(isMultiPart('what is machine learning')).toBe(false);
    expect(isMultiPart('the history of rome')).toBe(false);
  });
});

describe('detectRequested — explicit format pins (G2)', () => {
  it('pins the requested form when the user explicitly asks for one', () => {
    expect(detectRequested('make me a table of the planets')).toContain('datatable');
    expect(detectRequested('show me the python code for quicksort')).toContain('codeblock');
    expect(detectRequested('give me a timeline of world war 2')).toContain('timeline');
    expect(detectRequested('compare python and javascript')).toContain('compare');
    expect(detectRequested('quiz me on fractions')).toContain('quiz');
    expect(detectRequested('make flashcards for spanish verbs')).toContain('flashcard');
    expect(detectRequested('give me a checklist for moving house')).toContain('checklist');
    expect(detectRequested('walk me through it step by step')).toContain('howtosteps');
    expect(detectRequested('show me a map of italy')).toContain('geomap');
  });

  it('pins geomap for proximity-to-a-real-place asks, not just literal "map" wording', () => {
    // These describe real geography without saying "map"/"where is" — they used to fall through
    // to imagecallouts, whose photo needs a real allowlisted image URL the model almost never has.
    expect(detectRequested('what near the riverwalk looks like in practice')).toContain('geomap');
    expect(detectRequested('is it walking distance to downtown')).toContain('geomap');
    expect(detectRequested('what restaurants are nearby')).toContain('geomap');
    expect(detectRequested('what is the neighborhood like')).toContain('geomap');
  });

  it('does NOT pin a table for an incidental word (verb/article-anchored)', () => {
    expect(detectRequested('I am comfortable with risk')).not.toContain('datatable');
    expect(detectRequested('is a tomato a vegetable')).not.toContain('datatable');
    expect(detectRequested('explain the periodic table')).not.toContain('datatable');
    expect(detectRequested('show me the periodic table of elements')).not.toContain('datatable');
  });

  it('does NOT pin a diagram for an incidental mention with no draw verb', () => {
    expect(detectRequested('what was in the diagram in chapter 3')).not.toContain('diagramflow');
  });
});

describe('selectComponents — menu teaches components AND fields (demo-grade)', () => {
  it('teaches the optional enrichment fields, not just the required props', () => {
    // chart's optional `footer` is what makes a demo chart read like a hand-built one;
    // the model only fills it if the menu tells it the field exists.
    const r = selectComponents({
      userText: 'how has my spending changed over the past 6 months',
      tier: 'frontier',
    });
    expect(r.promptSnippet).toContain('richer with:');
    // The base floor is always taught, so a stable field like chart's footer is present.
    expect(r.promptSnippet).toContain('footer');
  });

  it('always teaches the common staples, even for a vague ask (use both, not just cool)', () => {
    const r = selectComponents({ userText: 'surprise me', tier: 'frontier' });
    expect(r.promptSnippet).toContain('ALWAYS AVAILABLE');
    // Every base-floor type appears by name in the taught menu.
    for (const t of BASE_FLOOR) expect(r.promptSnippet).toContain(`- ${t} —`);
  });

  it('orders the hero picks fit-first, then most-impressive (relevant-cool-led)', () => {
    const userText = 'give me a rich overview dashboard of everything';
    const r = selectComponents({ userText, tier: 'frontier', rotation: 2 });
    const heroBlock = r.promptSnippet.split('ALWAYS AVAILABLE')[0];
    const heroes = [...heroBlock.matchAll(/^- (\w+) —/gm)].map((m) => m[1]);
    expect(heroes.length).toBeGreaterThan(1);
    // Replicate the selector's fit measure so we can assert the contract: components that
    // genuinely fit the ask lead, and within each fit-group the most-impressive comes first.
    // (A flashy block that fits nothing must never jump ahead of a relevant one.)
    const shapes = detectShapes(userText);
    const fitOf = (type: string) =>
      (metaFor(type)?.dataShapes ?? []).reduce((s, sh) => s + (shapes[sh] ?? 0), 0);
    for (let i = 1; i < heroes.length; i++) {
      const prev = heroes[i - 1]!;
      const cur = heroes[i]!;
      const fPrev = fitOf(prev) > 0 ? 1 : 0;
      const fCur = fitOf(cur) > 0 ? 1 : 0;
      if (fPrev !== fCur) {
        expect(fPrev).toBeGreaterThanOrEqual(fCur); // fitting components lead
      } else {
        expect(metaFor(cur)?.wowWeight ?? 0).toBeLessThanOrEqual(metaFor(prev)?.wowWeight ?? 0);
      }
    }
  });
});

describe('selectComponents — excludes UI chrome from Live answers', () => {
  // Measured failure: pushed to add variety, the model jammed UI furniture (sidenav, kbd,
  // sliderinput, a loan amortization table) into a recipe. Live answers are informational, so the
  // hero menu must never offer app-construction widgets. This locks that they cannot be drawn,
  // while content components — including interactive ones like datatable/geomap — still can.
  const ASKS = [
    'give me a detailed recipe for chicken biryani',
    'explain how a neural network learns',
    'plan a 5-day trip to Lisbon',
    'how does a four-stroke car engine work',
    'teach me the basics of the periodic table',
    'compare electric vs gas cars',
    'how should I budget a $5,000 monthly income',
    'what are the main causes of climate change',
  ];

  // Union over several rotations per ask (selection is seeded → deterministic) so the offered set
  // is dense enough to assert both exclusions and inclusions without flakiness. ROTATIONS_PER_ASK
  // was 5 until the catalog crossed ~460 entries, at which point ordinary menu competition made a
  // real but comparatively marginal content visual (progressbar, ~5% hit rate for these asks) fall
  // outside that narrow a sample — verified selectable, just statistically rarer, not excluded by
  // any heuristic. Widened rather than swapping the exemplar, since the point is "a real content
  // visual stays reachable," which a wider, still-fast union continues to prove either way.
  const ROTATIONS_PER_ASK = 20;
  const offeredAcrossBattery = (): Set<string> => {
    const offered = new Set<string>();
    ASKS.forEach((ask, i) => {
      for (let r = 0; r < ROTATIONS_PER_ASK; r++)
        for (const t of selectComponents({
          userText: ask,
          tier: 'mid',
          rotation: i * ROTATIONS_PER_ASK + r,
        }).types)
          offered.add(t);
    });
    return offered;
  };

  it('never offers nav / form / picker / overlay families or the named UI-widget types', () => {
    const offered = offeredAcrossBattery();
    const CHROME = [
      'sidenav',
      'breadcrumb',
      'menu',
      'select',
      'textarea',
      'datepicker',
      'kbd',
      'spinner',
      'skeleton',
      'sliderinput',
      'rangefilter',
      'ratinginput',
      'segmented',
      'toaststack',
    ];
    for (const c of CHROME) expect(offered.has(c)).toBe(false);
  });

  it('KEEPS content visuals that live in the display/status families (not over-excluded)', () => {
    // Regression guard: a family+interactive heuristic once wrongly swept these up. They carry real
    // data shapes (status/sequence/composition), ship in demos, and must stay Live-selectable.
    const offered = offeredAcrossBattery();
    for (const c of ['progressbar', 'stepindicator', 'statustimeline', 'healthgrid'])
      expect(offered.has(c), `content visual '${c}' must stay offerable`).toBe(true);
  });

  it('still offers a broad menu of CONTENT components', () => {
    // ~160 specialized content components remain after the chrome cut — the menu must stay rich.
    expect(offeredAcrossBattery().size).toBeGreaterThan(30);
  });
});

describe('lead heroes carry a DENSE example in the menu (Phase 2c)', () => {
  // The top-3 wow-sorted heroes should teach a FULLER example than the thin default, so the model
  // fills them at demo depth. Parse the per-turn menu and confirm at least one lead-hero example
  // exceeds its compact form across a varied battery (some lead types are atomic and won't grow).
  const ASKS = [
    'give me a detailed recipe for chicken biryani',
    'explain how a neural network learns',
    'plan a 5-day trip to Lisbon',
    'compare electric vs gas cars',
    'teach me the basics of the periodic table',
    'how does a four-stroke car engine work',
  ];
  const HERO_LINE = /^- (\w+) — .*· example: (.+)$/;

  it('shows a denser-than-compact example on at least one lead hero', () => {
    let densened = 0;
    ASKS.forEach((ask, i) => {
      const snippet = selectComponents({ userText: ask, tier: 'mid', rotation: i }).promptSnippet;
      const heroPart = snippet.split('ALWAYS AVAILABLE')[0]; // heroes precede the staples block
      const leadLines = heroPart
        .split('\n')
        .filter((l) => HERO_LINE.test(l))
        .slice(0, 3); // LEAD_DENSE = 3
      for (const line of leadLines) {
        const m = HERO_LINE.exec(line);
        if (!m) continue;
        const compact = exampleFor(m[1], false);
        if (compact && m[2].length > compact.length) densened += 1;
      }
    });
    expect(densened).toBeGreaterThan(0);
  });
});

describe('domain credibility / sanity gate', () => {
  it('classifies a question domain from its wording', () => {
    expect(detectDomains('explain eigenvectors and the matrix transformation').has('math')).toBe(
      true,
    );
    expect(detectDomains('what could this shoulder injury be').has('health')).toBe(true);
    expect(detectDomains('plan a 5-day trip to Lisbon').has('travel')).toBe(true);
    expect(detectDomains('hello there friend').size).toBe(0);
  });

  it('classifies the domains that previously had no detection rule (could never match a block)', () => {
    // These were declared on BlockDomain but had no DOMAIN_RULES entry, so a block tagged with one
    // could only ever be gated OUT. Each must now classify from natural wording.
    expect(detectDomains('build a churn dashboard from this dataset').has('data')).toBe(true);
    expect(detectDomains('critique my design system and wireframe').has('design')).toBe(true);
    expect(detectDomains('what aperture and shutter speed for this photo').has('photo')).toBe(true);
    expect(detectDomains('storyboard the opening shot of my film').has('media')).toBe(true);
    expect(detectDomains('help me prioritize my to-do backlog').has('productivity')).toBe(true);
    expect(detectDomains('my girlfriend and I keep fighting').has('relationship')).toBe(true);
    expect(detectDomains('summarize the latest news headlines').has('news')).toBe(true);
    // New domains added for demo subjects that mapped to nothing.
    expect(detectDomains('my toddler keeps having tantrums at bedtime').has('parenting')).toBe(
      true,
    );
    expect(detectDomains('help me write a cover letter').has('writing')).toBe(true);
    expect(detectDomains('should I buy the Steam Deck or wait').has('decision')).toBe(true);
    expect(detectDomains('best headphones deals to buy right now').has('shopping')).toBe(true);
    expect(detectDomains('look up the definition of perfunctory').has('reference')).toBe(true);
    // 'lifestyle' was declared on BlockDomain (collectiontracker's only tag) with no detection
    // rule, so that block could only ever be gated OUT — never matched.
    expect(detectDomains('how much is my baseball card collection worth').has('lifestyle')).toBe(
      true,
    );
  });

  it('keeps a block tagged with a once-dead domain eligible for its question', () => {
    // A data-viz block tagged ['data'] must survive a data-science ask even though the ask also
    // trips other domains — the previously-missing 'data' rule is what makes the overlap exist.
    const q = detectDomains('analyze this dataset and model the churn pipeline');
    expect(domainFitsOrNeutral(['data'], q)).toBe(true);
  });

  it('passes neutral blocks and unclassifiable asks, gates a clear mismatch', () => {
    expect(domainFitsOrNeutral(undefined, new Set(['math']))).toBe(true); // neutral block
    expect(domainFitsOrNeutral([], new Set(['math']))).toBe(true);
    expect(domainFitsOrNeutral(['photo'], new Set())).toBe(true); // unclassifiable → fail open
    expect(domainFitsOrNeutral(['math', 'science'], new Set(['math']))).toBe(true);
    expect(domainFitsOrNeutral(['photo', 'home'], new Set(['math']))).toBe(false);
  });

  it('resolves fallback domains for untagged specialised blocks; meta wins', () => {
    expect(blockDomainsOf({ type: 'periodictable' })).toEqual(['science']);
    expect(blockDomainsOf({ type: 'sportspitch' })).toEqual(['sports']);
    expect(blockDomainsOf({ type: 'periodictable', domains: ['math'] })).toEqual(['math']);
    expect(blockDomainsOf({ type: 'insight' })).toBeUndefined();
  });

  it('never offers a domain-absurd block for a linear-algebra ask', () => {
    const r = selectComponents({
      userText: 'explain eigenvectors and how a matrix transforms a vector',
      tier: 'frontier',
    });
    expect(r.types).not.toContain('beforeafter'); // image slider — photo/home/design/media
    expect(r.types).not.toContain('sportspitch');
    expect(r.types).not.toContain('periodictable'); // science ≠ math
    for (const t of BASE_FLOOR) expect(r.types).toContain(t); // neutral staples still present
  });

  it('never offers a sports pitch or image slider for a medical ask', () => {
    const r = selectComponents({
      userText: 'what are the symptoms and treatment for a sprained ankle',
      tier: 'frontier',
    });
    expect(r.types).not.toContain('sportspitch');
    expect(r.types).not.toContain('beforeafter');
  });

  it('keeps a matching specialised block eligible (vectorspace for a math ask)', () => {
    const q = detectDomains('show the eigenvectors of this matrix transformation');
    expect(domainFitsOrNeutral(['math', 'science', 'education', 'data'], q)).toBe(true);
  });
});

describe('crisis safety routing', () => {
  it('detects acute-crisis wording, not ordinary sadness', () => {
    expect(isCrisis('I want to die, I cannot do this anymore')).toBe(true);
    expect(isCrisis('how do I stop wanting to hurt myself')).toBe(true);
    expect(isCrisis('I had a sad day and feel down')).toBe(false);
    expect(isCrisis('compare two laptops for me')).toBe(false);
  });

  it('leads with lifeline and suppresses reflective surfaces on a crisis turn', () => {
    const r = selectComponents({
      userText: "honestly I don't want to be here anymore",
      tier: 'frontier',
    });
    expect(r.types).toContain('lifeline');
    for (const t of ['companionnote', 'reframecard', 'breathpacer', 'copingmenu']) {
      expect(r.types).not.toContain(t);
    }
  });

  it('never offers lifeline on a non-crisis turn (it is crisis-only)', () => {
    const r = selectComponents({
      userText: 'I am a bit stressed about my exam, any tips',
      tier: 'frontier',
    });
    expect(r.types).not.toContain('lifeline');
  });
});

describe('teaching kit pin (the shaped-lesson arc)', () => {
  // generateLive passes `teaching: isTeaching` — pinning teachdiagram/workedexample/quiz/
  // flashcard the same way an explicit format request or content specialist is pinned, and
  // withheld for a 'small' tier model, which can't reliably fill teachdiagram's structured
  // step schema.
  const ASK = 'teach me linear algebra';

  it('pins the whole teaching kit when teaching=true on a frontier/mid tier', () => {
    for (const tier of ['frontier', 'mid'] as const) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const r = selectComponents({ userText: ASK, tier, teaching: true, rotation });
        for (const t of TEACHING_KIT) expect(r.types, `${t} on ${tier}`).toContain(t);
        expect([...r.allowed].sort()).toEqual([...r.types].sort());
      }
    }
  });

  it('does NOT pin the teaching kit when teaching is absent', () => {
    const r = selectComponents({ userText: ASK, tier: 'frontier' });
    // At least one kit member must be absent — a vague draw could coincidentally include one,
    // but not all four every time, unlike the guaranteed-pin case above.
    expect(TEACHING_KIT.every((t) => r.types.includes(t))).toBe(false);
  });

  it('does NOT pin the teaching kit on a small tier even when teaching=true', () => {
    for (let rotation = 0; rotation < 4; rotation++) {
      const r = selectComponents({ userText: ASK, tier: 'small', teaching: true, rotation });
      expect(TEACHING_KIT.every((t) => r.types.includes(t))).toBe(false);
    }
  });

  it('weightFor: teaching=true boosts a learn-family component but leaves others untouched', () => {
    const learnMeta = metaFor('teachdiagram')!;
    expect(learnMeta.family).toBe('learn');
    const nonLearnMeta = metaFor('chart')!;
    expect(nonLearnMeta.family).not.toBe('learn');
    const shapes = {} as ShapeVector;
    const noBoost = weightFor(learnMeta, shapes, new Set());
    const boosted = weightFor(learnMeta, shapes, new Set(), undefined, undefined, true);
    expect(boosted).toBeGreaterThan(noBoost);
    // A component outside the learn family is unaffected by the teaching flag.
    const otherNoBoost = weightFor(nonLearnMeta, shapes, new Set());
    const otherBoosted = weightFor(nonLearnMeta, shapes, new Set(), undefined, undefined, true);
    expect(otherBoosted).toBeCloseTo(otherNoBoost);
  });
});
