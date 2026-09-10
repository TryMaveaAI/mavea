// routeTable.ts — every hash prefix the app answers to, as plain data.
//
// This is the list `routes.ts` turns into lazy surfaces, kept apart from it so a Node script can read
// the same list without touching React or `import.meta.env`: the geometry suite
// (scripts/surface-audit.mts) derives its sweep from these prefixes, and a test fails when a prefix
// has no sweep entry — a gate cannot see a surface it does not visit, and a list copied into the
// script would have drifted the first time a route was added. Nothing here runs: the loaders are
// only ever called by the router.
import type { ComponentType } from 'react';

export interface RouteSpec {
  prefix: string;
  load: () => Promise<{ default: ComponentType }>;
}

export const PUBLIC_ROUTES: RouteSpec[] = [
  {
    prefix: '#/terms',
    load: () => import('./legal/TermsApp').then((m) => ({ default: m.TermsApp })),
  },
  {
    prefix: '#/privacy',
    load: () => import('./legal/PrivacyApp').then((m) => ({ default: m.PrivacyApp })),
  },
  // Important information (#/legal): a small, standalone disclosure surface linked from the
  // public landing and provider connection UI. Route-owned so normal product bundles stay lean.
  {
    prefix: '#/legal',
    load: () => import('./legal/LegalApp').then((m) => ({ default: m.LegalApp })),
  },
  // Live waits for the session store's one disk read (bounded — see whenSessionSettled) before
  // mounting: the resume-or-wizard decision is synchronous, and without this the production
  // bundle mounts faster than the stored conversation decrypts, so every reload looked like a
  // fresh start. The boot splash already covers the wait, and both imports resolve from the same
  // lazy chunk graph — nothing new reaches the eager bundle.
  {
    prefix: '#/live',
    load: () =>
      Promise.all([import('./live/LiveApp'), import('./live/session/store')]).then(
        async ([m, store]) => {
          await store.whenSessionSettled();
          return { default: m.LiveApp };
        },
      ),
  },
  // The Dashboards (#/dashboards): conversations turned into living dashboards that refresh while
  // Mavéa is open. Lazy like Live — it shares the canvas + provider chunk.
  //
  // And like Live, it waits for what decrypts asynchronously before mounting. Both the dashboards
  // themselves and the API keys are encrypted at rest, and mounting ahead of them made the surface
  // lie twice: it flashed "these trackers can't fetch anything yet" over a perfectly good key, and
  // — the real damage — a tracker created inside that window failed its add-time reality probe with
  // "no model", which rolls the new dashboard back and DELETES it. Bounded, so a hung decrypt
  // degrades to the old behaviour rather than a route that never resolves; the boot splash covers
  // the wait.
  {
    prefix: '#/dashboards',
    load: () =>
      Promise.all([
        import('./live/dashboards/DashboardsApp'),
        import('./live/dashboards/store'),
        import('./live/useLiveConfig'),
      ]).then(async ([m, store, liveConfig]) => {
        await Promise.race([
          Promise.all([store.whenDashboardsHydrated(), liveConfig.whenSecretPersistenceSettled()]),
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
        return { default: m.DashboardsApp };
      }),
  },
  // The Flashcards (#/flashcards): see, organise (decks + tags), and study the cards captured from
  // answers. Lazy — none of the manage/study surface reaches the eager bundle.
  {
    prefix: '#/flashcards',
    load: () => import('./live/srs/FlashcardsApp').then((m) => ({ default: m.FlashcardsApp })),
  },
  // The visual library (#/gallery): every browsable production block type (internal full-frame
  // renderers are intentionally excluded), mounted through the real canvas path.
  {
    prefix: '#/gallery',
    load: () => import('./gallery/GalleryApp').then((m) => ({ default: m.GalleryApp })),
  },
  // Deep Zoom (#/deepzoom): Powers-of-Ten semantic zoom through any topic — ten levels from the
  // broadest field to the finest mechanism, and ten more per fork. Pass ?q= to pre-seed.
  {
    prefix: '#/deepzoom',
    load: () => import('./live/deepzoom/DeepZoomApp').then((m) => ({ default: m.DeepZoomApp })),
  },
  // Topic Courses (#/courses): every generated syllabus, its "Lesson X of N" progress, and a
  // composer to start a new one. Opening a lesson hands off to the dedicated reader (#/course).
  {
    prefix: '#/courses',
    load: () => import('./live/course/CoursesApp').then((m) => ({ default: m.CoursesApp })),
  },
  // The course-lesson reader (#/course): one lesson as a clean, contained reading surface — the
  // CourseRail chrome above a static canvas, with none of Live's conversation chrome. MUST stay
  // AFTER #/courses: `'#/courses'.startsWith('#/course')` is true, so first-match ordering would
  // otherwise route the courses home here. `#/course?…` never matches `#/courses`, so this pair
  // is unambiguous once ordered this way.
  {
    prefix: '#/course',
    load: () =>
      import('./live/course/CourseLessonReader').then((m) => ({ default: m.CourseLessonReader })),
  },
  // Prism (#/synthesis, #/prism): upload-first standalone entries for the document analysis
  // surface. Drop straight into PrismOverlay once a file is attached.
  {
    prefix: '#/synthesis',
    load: () => import('./live/prism/SynthesisApp').then((m) => ({ default: m.SynthesisApp })),
  },
  {
    prefix: '#/prism',
    load: () => import('./live/prism/PrismApp').then((m) => ({ default: m.PrismApp })),
  },
  // Ripple (#/ripple): standalone entry for the code blast-radius surface. Opens immediately with
  // the seed PR so the value is visible before the user pastes their own diff.
  {
    prefix: '#/ripple',
    load: () => import('./live/ripple/RippleApp').then((m) => ({ default: m.RippleApp })),
  },
];

// QA/fidelity harnesses — internal tooling, never a real visitor's destination. routes.ts mounts
// these only under `import.meta.env.DEV`; a production build proves that branch unreachable and
// drops every chunk they reference.
export const LAB_ROUTES: RouteSpec[] = [
  // The Reel gallery (#/reel): every share "finish" rendered statically for fit/overflow QA,
  // plus a looping full reel.
  {
    prefix: '#/reel',
    load: () => import('./clip/reel/ReelGallery').then((m) => ({ default: m.ReelGallery })),
  },
  // The Slide lab (#/slidelab): one representative deck rendered in every presentation skin,
  // for fit/overflow + fidelity QA.
  {
    prefix: '#/slidelab',
    load: () => import('./slides/lab/SlidesLab').then((m) => ({ default: m.SlidesLab })),
  },
  // The Export lab (#/exportlab): one representative document rendered in every print skin,
  // for fit/overflow + fidelity QA — the document counterpart to #/slidelab.
  {
    prefix: '#/exportlab',
    load: () => import('./export/lab/ExportLab').then((m) => ({ default: m.ExportLab })),
  },
  {
    prefix: '#/synlab',
    load: () => import('./live/prism/SynthesisLab').then((m) => ({ default: m.SynthesisLab })),
  },
  // Repro harness (#/pageviewlab): the PDF page viewer in isolation, for the shaking/blur bug.
  {
    prefix: '#/pageviewlab',
    load: () => import('./live/prism/PageViewLab').then((m) => ({ default: m.PageViewLab })),
  },
  // The Mind lab (#/mindlab): the settled Watch-Me-Think map on a fixed spec, so its hub,
  // keep-out and label placement can be judged without a model key or six typed thoughts.
  {
    prefix: '#/mindlab',
    load: () => import('./live/mindshape/MindShapeLab').then((m) => ({ default: m.MindShapeLab })),
  },
  // The Why lab (#/whylab): the Why Machine overlay on its illustrative seed web, for layout +
  // counterfactual + light/dark QA.
  {
    prefix: '#/whylab',
    load: () => import('./live/why/WhyLab').then((m) => ({ default: m.WhyLab })),
  },
  // The World lab (#/worldlab): the living-answer surface on its seed world, for the morph
  // between representations, provenance cards, edge receipts and what-if lanes.
  {
    prefix: '#/worldlab',
    load: () => import('./live/world/WorldLab').then((m) => ({ default: m.WorldLab })),
  },
];
