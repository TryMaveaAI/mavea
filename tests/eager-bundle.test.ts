// Guards the landing page's payload: the home route (the eager demo + flagship landing) must NOT
// statically pull the heavy machinery — the ~300 KB component catalog, the full block registry,
// or the provider adapters (each of which reaches the catalog). Those belong behind lazy
// boundaries (TopicCanvas, LiveApp, the export modal), fetched only when a surface that needs them
// renders. This invariant is easy to break by accident: a single `import { X } from '../barrel'`
// in an eagerly-loaded module re-pulls everything the barrel touches (that is exactly how the
// catalog once rode in through `flagship → live/providers` and through a static `ExportModal`).
//
// Rather than police every import by hand, this walks the STATIC import graph from the entry
// (main.tsx) — following `import …`/`export … from` but NOT `import type` or dynamic `import()` —
// and asserts the forbidden modules are unreachable. On failure it prints the offending chain so
// the regression is one read away from a fix.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const SRC = resolve(__dirname, '../src');
const ENTRY = resolve(SRC, 'main.tsx');

/** Resolve a relative import specifier to a source file on disk (or null for bare/npm imports). */
function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (c.endsWith('.ts') || c.endsWith('.tsx') || c.endsWith('.js')) {
      if (existsSync(c)) return c;
    }
  }
  return null;
}

/** Static (value) import/export specifiers of a module — excludes `import type`, `export type`,
 *  and dynamic `import(...)` (those do not pull the target into the importer's chunk). */
function staticSpecifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs: string[] = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;'"]*?\s+from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) specs.push(m[1]);
  while ((m = bareRe.exec(src))) specs.push(m[1]);
  return specs;
}

/** BFS the static import graph from an entry module, recording each file's discoverer for chain
 *  reporting. Rooted at main.tsx for the landing budget, or at a surface entry (LiveApp,
 *  DashboardsApp, TopicCanvas) to prove that surface's own mount chunk stays lean. */
function graphFrom(entry: string): Map<string, string | null> {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of staticSpecifiers(file)) {
      const next = resolveSpec(file, spec);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return parent;
}

const eagerGraph = (): Map<string, string | null> => graphFrom(ENTRY);

function chain(parent: Map<string, string | null>, target: string): string {
  const path: string[] = [];
  let cur: string | null = target;
  while (cur) {
    path.push(cur.replace(`${SRC}/`, ''));
    cur = parent.get(cur) ?? null;
  }
  return path.reverse().join('\n  → ');
}

describe('eager bundle — the landing must not statically pull the heavy machinery', () => {
  // Each of these reaches (or is) the ~300 KB component catalog and/or the full block library.
  // They must stay behind a lazy boundary so the home route never downloads them up front.
  const FORBIDDEN = [
    'canvas/blocks/catalog/lookup.ts',
    'canvas/blocks/catalog/catalog.data.ts',
    // The authoring families carry the catalog's DETAIL fields (~70% of its bytes). They must only
    // ever be reached through the lazy detail loader; a static edge to any one of them re-pins that
    // payload into the eager graph. `core` is the one every turn loads, so it's the canary.
    'canvas/blocks/catalog/families/core.ts',
    'canvas/blocks/catalog/families/learn.ts',
    'canvas/blocks/index.ts', // the merged block registry (EXTENDED_REGISTRY)
    'data/topics/index.ts', // the demo conversation fixtures (~300 KB gz) — behind topicsStore
    'engine/liveSchema.ts', // pulls the catalog
    'live/providers/anthropic.ts', // any provider adapter reaches the schema → catalog
    'live/select/catalog.ts', // the selector's catalog view
    'live/srs/FlashcardsApp.tsx', // the flashcards manage surface — lazy behind #/flashcards
    'live/srs/CardEditor.tsx', // the add/edit sheet — pulled only through the lazy Live/Flashcards chunks
    // The refresh loop is mounted from the root (see Root in main.tsx), which is exactly why its
    // gate has to stay behind a dynamic import — a static edge would put the dashboards store, and
    // through the engine the whole provider stack, in front of the landing's first paint.
    'live/dashboards/DashboardLoopGate.tsx',
    'live/dashboards/useDashboardLoop.ts',
    'live/dashboards/store.ts',
  ];

  const graph = eagerGraph();

  for (const rel of FORBIDDEN) {
    it(`does not eagerly reach ${rel}`, () => {
      const abs = resolve(SRC, rel);
      const reachable = graph.has(abs);
      // A readable failure: the exact static chain that reintroduced the module.
      const detail = reachable ? `\n\nEager import chain:\n  ${chain(graph, abs)}` : '';
      expect(reachable, `${rel} is eagerly reachable from main.tsx${detail}`).toBe(false);
    });
  }
});

describe('eager font loading', () => {
  it('does not let the large voice font compete with the first shell', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const preloads = [...html.matchAll(/<link[\s\S]*?rel="preload"[\s\S]*?>/g)].map(
      (match) => match[0],
    );
    expect(preloads.some((tag) => tag.includes('hanken-grotesk'))).toBe(true);
    expect(preloads.some((tag) => tag.includes('newsreader'))).toBe(false);
  });
});

describe('per-family split — the canvas chunk must not statically pull the block library', () => {
  // TopicCanvas resolves extended blocks through the per-family loader (dynamic import() per
  // family), so a canvas render downloads only the families its answer uses. One static import
  // of the merged registry — or of any single family registry — from anything TopicCanvas
  // reaches would pin the whole ~1.5 MB library back into the canvas chunk. Same walker as
  // above, rooted at TopicCanvas instead of main.tsx.
  const CANVAS_ENTRY = resolve(SRC, 'canvas/TopicCanvas.tsx');
  const graph = graphFrom(CANVAS_ENTRY);

  it('does not statically reach the merged registry (canvas/blocks/index.ts)', () => {
    const abs = resolve(SRC, 'canvas/blocks/index.ts');
    const detail = graph.has(abs) ? `\n\nStatic import chain:\n  ${chain(graph, abs)}` : '';
    expect(
      graph.has(abs),
      `blocks/index.ts is statically reachable from TopicCanvas${detail}`,
    ).toBe(false);
  });

  it('does not statically reach any family registry', () => {
    const offender = [...graph.keys()].find((f) => /canvas\/blocks\/[^/]+\/registry\.tsx$/.test(f));
    const detail = offender ? `\n\nStatic import chain:\n  ${chain(graph, offender)}` : '';
    expect(
      offender,
      `a family registry is statically reachable from TopicCanvas${detail}`,
    ).toBeUndefined();
  });
});

describe('eager bundle — heavy npm packages stay behind a lazy import()', () => {
  // These used to be loaded from a CDN via a runtime `import()`; they're now ordinary bundled
  // dependencies, code-split into their own chunk because every call site still uses a dynamic
  // `import('pkg')` rather than a static `import … from 'pkg'`. A static top-level import would
  // pull the whole package into whichever chunk contains it — for several of these (pdf.js,
  // jsPDF, mediabunny) that chunk could easily be one main.tsx eagerly reaches, silently
  // reinflating the landing bundle. This walks the same eager static-import graph as above and
  // fails if any eagerly-reached module statically imports one of these package names.
  const FORBIDDEN_PACKAGES = [
    'katex',
    'maplibre-gl',
    'openchemlib',
    'jspdf',
    'modern-screenshot',
    'mediabunny',
    'pdfjs-dist',
    'shiki',
  ];

  const graph = eagerGraph();
  const eagerFiles = [...graph.keys()];

  for (const pkg of FORBIDDEN_PACKAGES) {
    it(`does not statically import '${pkg}' from an eagerly-reached module`, () => {
      const offender = eagerFiles.find((file) =>
        staticSpecifiers(file).some((spec) => spec === pkg || spec.startsWith(`${pkg}/`)),
      );
      const detail = offender ? `\n\nEager import chain:\n  ${chain(graph, offender)}` : '';
      expect(
        offender,
        `'${pkg}' is statically imported from an eagerly-reached module${detail}`,
      ).toBeUndefined();
    });
  }
});

describe('feature-scoped dynamic imports remain tree-shakeable', () => {
  it('reel capture selects Mediabunny exports instead of returning its entire namespace', () => {
    const capture = readFileSync(resolve(SRC, 'clip/capture.ts'), 'utf8');
    expect(capture).toContain("} = await import('mediabunny')");
    expect(capture).not.toMatch(/return\s+await\s+import\(['"]mediabunny['"]\)/);
  });
});

describe('mount chunks — a surface must not parse the ~600-entry catalog just to OPEN', () => {
  // Opening Live (or Dashboards) should mount its chrome instantly; the component catalog + the
  // turn engine load with the FIRST actual turn, not on mount. Five separate static chains used to
  // pin the catalog into the Live-mount chunk (pendingCard, ConnectStep→generateLive,
  // providers/schema, present/personas→slides barrel, and the dashboards turn/refresh). This walks
  // each surface's own static graph and fails — printing the offending chain — if any of them
  // reappears. The catalog/engine are reached only via dynamic import() (turnEngine, ensure-details)
  // which this walker deliberately does not follow.
  const HEAVY = [
    'canvas/blocks/catalog/lookup.ts',
    'canvas/blocks/catalog/catalog.data.ts',
    'live/select/catalog.ts',
    'engine/liveSchema.ts',
    'live/generateLive.ts',
  ];

  for (const [surface, entryRel] of [
    ['LiveApp', 'live/LiveApp.tsx'],
    ['DashboardsApp', 'live/dashboards/DashboardsApp.tsx'],
  ] as const) {
    describe(surface, () => {
      const graph = graphFrom(resolve(SRC, entryRel));
      for (const rel of HEAVY) {
        it(`does not statically reach ${rel}`, () => {
          const abs = resolve(SRC, rel);
          const detail = graph.has(abs) ? `\n\nStatic import chain:\n  ${chain(graph, abs)}` : '';
          expect(graph.has(abs), `${rel} is statically reachable from ${surface}${detail}`).toBe(
            false,
          );
        });
      }
    });
  }
});

describe('validation chunk — runtime schema must not import the authored demo corpus', () => {
  const entry = resolve(SRC, 'engine/liveSchema.ts');
  const graph = graphFrom(entry);

  for (const rel of ['data/topics/index.ts', 'live/select/examples.ts']) {
    it(`does not statically reach ${rel}`, () => {
      const abs = resolve(SRC, rel);
      const detail = graph.has(abs) ? `\n\nStatic import chain:\n  ${chain(graph, abs)}` : '';
      expect(graph.has(abs), `${rel} is statically reachable from liveSchema${detail}`).toBe(false);
    });
  }
});

describe('demo shards — baked sessions stay behind the lazy glob loader', () => {
  // Each persona's recorded session (src/demo/corpus/<id>.generated.json, ~40 KB raw apiece)
  // is reached ONLY through corpus/index.ts's import.meta.glob, which Vite code-splits into a
  // per-shard chunk fetched when that demo boots. One static `import shard from './x.json'`
  // anywhere the landing or the Live mount reaches would pin every byte of it into that
  // chunk. (The TOUR corpus has its own loader + guard below — this check is scoped to the
  // demo corpus only.)
  const isDemoShardImport = (file: string, spec: string): boolean =>
    /\.generated\.json$/.test(spec) &&
    (spec.includes('demo/corpus') || (file.includes(`${SRC}/demo/`) && spec.startsWith('.')));

  for (const [name, entryRel] of [
    ['the landing (main.tsx)', 'main.tsx'],
    ['the Live mount (LiveApp.tsx)', 'live/LiveApp.tsx'],
  ] as const) {
    it(`no module reached from ${name} statically imports a demo shard`, () => {
      const graph = graphFrom(resolve(SRC, entryRel));
      const offender = [...graph.keys()].find((file) =>
        staticSpecifiers(file).some((spec) => isDemoShardImport(file, spec)),
      );
      const detail = offender ? `\n\nEager import chain:\n  ${chain(graph, offender)}` : '';
      expect(
        offender,
        `a demo shard is statically imported from a module ${name} reaches${detail}`,
      ).toBeUndefined();
    });
  }
});

describe('tour fixtures — the baked corpus stays behind loadTourCorpus()', () => {
  // The ~163 KB tour corpus (and the even heavier Prism fixture, which carries whole documents)
  // is fetched through a dynamic import in src/tour/corpus/ — the driver's corpusReady gate waits
  // for it. corpus/index.ts used to `import corpusJson from './corpus.generated.json'` statically,
  // which rode the whole payload into the Live mount chunk through FOUR chains (LiveApp → corpus,
  // → dashboardSeed, → courseSeed, and useTourDriver → tourPlan → corpus) and lengthened every
  // Live visitor's first load. One reintroduced static import of a tour .generated.json anywhere
  // the landing or the Live mount reaches pins it right back — same walker as the demo shards.
  const isTourFixtureImport = (file: string, spec: string): boolean =>
    /\.generated\.json$/.test(spec) && file.startsWith(`${SRC}/tour/`) && spec.startsWith('.');

  for (const [name, entryRel] of [
    ['the landing (main.tsx)', 'main.tsx'],
    ['the Live mount (LiveApp.tsx)', 'live/LiveApp.tsx'],
  ] as const) {
    it(`no module reached from ${name} statically imports a tour fixture`, () => {
      const graph = graphFrom(resolve(SRC, entryRel));
      const offender = [...graph.keys()].find((file) =>
        staticSpecifiers(file).some((spec) => isTourFixtureImport(file, spec)),
      );
      const detail = offender ? `\n\nEager import chain:\n  ${chain(graph, offender)}` : '';
      expect(
        offender,
        `a tour fixture is statically imported from a module ${name} reaches${detail}`,
      ).toBeUndefined();
    });
  }
});

describe('priority surface import boundaries', () => {
  const cases: Array<{ entry: string; forbidden: string[] }> = [
    {
      entry: 'flagship/FlagshipHost.tsx',
      forbidden: ['live/features/CommandPalette.tsx', 'live/features/registry.ts'],
    },
    {
      entry: 'live/prism/PrismApp.tsx',
      forbidden: ['live/prism/PrismOverlay.tsx', 'clip/ShareModal.tsx'],
    },
    {
      entry: 'live/prism/PrismOverlay.tsx',
      forbidden: [
        'live/prism/ask/useAsk.ts',
        'live/prism/crossexam/run.ts',
        'live/prism/autopsy/run.ts',
        'live/prism/levers/model.ts',
        'live/why/explode.ts',
      ],
    },
    {
      entry: 'live/course/CoursesApp.tsx',
      forbidden: ['live/course/generateCourse.ts', 'live/providers/index.ts'],
    },
    {
      entry: 'live/course/CourseLessonReader.tsx',
      forbidden: ['live/generateLive.ts', 'clip/ShareModal.tsx'],
    },
    {
      entry: 'live/ripple/RippleApp.tsx',
      forbidden: ['live/ripple/RippleOverlay.tsx', 'live/ripple/ingest/generate.ts'],
    },
    {
      entry: 'live/dashboards/DashboardsApp.tsx',
      forbidden: [
        'live/dashboards/useDashboardLoop.ts',
        'live/dashboards/DashboardDetail.tsx',
        'live/dashboards/DashboardSettings.tsx',
        'live/dashboards/DashboardOverview.tsx',
      ],
    },
    // The refresh loop is mounted app-wide (main.tsx → DashboardLoopGate), so both hops of that
    // path have to stay dynamic: the root must not pull the gate, and the gate must not pull the
    // engine. Either one going static would land the provider stack in the landing's bundle.
    {
      entry: 'live/dashboards/DashboardLoopGate.tsx',
      forbidden: ['live/dashboards/useDashboardLoop.ts', 'live/generateLive.ts'],
    },
    {
      entry: 'live/ripple/RippleOverlay.tsx',
      forbidden: [
        'live/ripple/ingest/generate.ts',
        'live/ripple/ingest/githubBrowser.ts',
        'live/ripple/ask/RippleAskController.tsx',
      ],
    },
    {
      entry: 'clip/ClipButton.tsx',
      forbidden: ['clip/ShareModal.tsx'],
    },
    {
      entry: 'gallery/GalleryApp.tsx',
      forbidden: ['canvas/blocks/index.ts', 'data/topics/index.ts'],
    },
  ];

  for (const boundary of cases) {
    const graph = graphFrom(resolve(SRC, boundary.entry));
    for (const forbidden of boundary.forbidden) {
      it(`${boundary.entry} does not statically reach ${forbidden}`, () => {
        const abs = resolve(SRC, forbidden);
        const detail = graph.has(abs) ? `\n\nStatic import chain:\n  ${chain(graph, abs)}` : '';
        expect(
          graph.has(abs),
          `${forbidden} is statically reachable from ${boundary.entry}${detail}`,
        ).toBe(false);
      });
    }
  }
});
