// routes.ts — hash prefix → lazy surface, as data rather than a branching tree.
//
// Every surface but the landing (App) code-splits into its own chunk, so visiting one is the
// only thing that downloads it. QA/fidelity harnesses (the *Lab surfaces, the reel gallery) are
// gathered behind `import.meta.env.DEV`: that condition is a compile-time constant, so a
// production build proves the branch unreachable and drops every chunk it references entirely —
// a stray lab link can never strand a real visitor on a screen with no way back.
import type { ComponentType, LazyExoticComponent } from 'react';
import { createPreloadableLazy } from './lib/preloadableLazy';

export interface RouteEntry {
  prefix: string;
  Component: LazyExoticComponent<ComponentType>;
  preload: () => Promise<void>;
}

function defineRoute(
  prefix: string,
  factory: () => Promise<{ default: ComponentType }>,
): RouteEntry {
  const surface = createPreloadableLazy(factory);
  return { prefix, ...surface };
}

const PUBLIC_ROUTES: RouteEntry[] = [
  defineRoute('#/terms', () => import('./legal/TermsApp').then((m) => ({ default: m.TermsApp }))),
  defineRoute('#/privacy', () =>
    import('./legal/PrivacyApp').then((m) => ({ default: m.PrivacyApp })),
  ),
  // Important information (#/legal): a small, standalone disclosure surface linked from the
  // public landing and provider connection UI. Route-owned so normal product bundles stay lean.
  defineRoute('#/legal', () => import('./legal/LegalApp').then((m) => ({ default: m.LegalApp }))),
  // Live waits for the session store's one disk read (bounded — see whenSessionSettled) before
  // mounting: the resume-or-wizard decision is synchronous, and without this the production
  // bundle mounts faster than the stored conversation decrypts, so every reload looked like a
  // fresh start. The boot splash already covers the wait, and both imports resolve from the same
  // lazy chunk graph — nothing new reaches the eager bundle.
  defineRoute('#/live', () =>
    Promise.all([import('./live/LiveApp'), import('./live/session/store')]).then(
      async ([m, store]) => {
        await store.whenSessionSettled();
        return { default: m.LiveApp };
      },
    ),
  ),
  // The Dashboards (#/dashboards): conversations turned into living dashboards that refresh while
  // Mavéa is open. Lazy like Live — it shares the canvas + provider chunk.
  defineRoute('#/dashboards', () =>
    import('./live/dashboards/DashboardsApp').then((m) => ({ default: m.DashboardsApp })),
  ),
  // The Flashcards (#/flashcards): see, organise (decks + tags), and study the cards captured from
  // answers. Lazy — none of the manage/study surface reaches the eager bundle.
  defineRoute('#/flashcards', () =>
    import('./live/srs/FlashcardsApp').then((m) => ({ default: m.FlashcardsApp })),
  ),
  // The visual library (#/gallery): every browsable production block type (internal full-frame
  // renderers are intentionally excluded), mounted through the real canvas path.
  defineRoute('#/gallery', () =>
    import('./gallery/GalleryApp').then((m) => ({ default: m.GalleryApp })),
  ),
  // Deep Zoom (#/deepzoom): Powers-of-Ten semantic zoom through any topic — five levels from the
  // broadest field to the finest mechanism. Pass ?q= to pre-seed.
  defineRoute('#/deepzoom', () =>
    import('./live/deepzoom/DeepZoomApp').then((m) => ({ default: m.DeepZoomApp })),
  ),
  // Topic Courses (#/courses): every generated syllabus, its "Lesson X of N" progress, and a
  // composer to start a new one. Opening a lesson hands off to the dedicated reader (#/course).
  defineRoute('#/courses', () =>
    import('./live/course/CoursesApp').then((m) => ({ default: m.CoursesApp })),
  ),
  // The course-lesson reader (#/course): one lesson as a clean, contained reading surface — the
  // CourseRail chrome above a static canvas, with none of Live's conversation chrome. MUST stay
  // AFTER #/courses: `'#/courses'.startsWith('#/course')` is true, so first-match ordering would
  // otherwise route the courses home here. `#/course?…` never matches `#/courses`, so this pair
  // is unambiguous once ordered this way.
  defineRoute('#/course', () =>
    import('./live/course/CourseLessonReader').then((m) => ({
      default: m.CourseLessonReader,
    })),
  ),
  // Prism (#/synthesis, #/prism): upload-first standalone entries for the document analysis
  // surface. Drop straight into PrismOverlay once a file is attached.
  defineRoute('#/synthesis', () =>
    import('./live/prism/SynthesisApp').then((m) => ({ default: m.SynthesisApp })),
  ),
  defineRoute('#/prism', () =>
    import('./live/prism/PrismApp').then((m) => ({ default: m.PrismApp })),
  ),
  // Ripple (#/ripple): standalone entry for the code blast-radius surface. Opens immediately with
  // the seed PR so the value is visible before the user pastes their own diff.
  defineRoute('#/ripple', () =>
    import('./live/ripple/RippleApp').then((m) => ({ default: m.RippleApp })),
  ),
];

// QA/fidelity harnesses — internal tooling, never a real visitor's destination. Excluded from
// production builds entirely; see the module doc comment above.
const LAB_ROUTES: RouteEntry[] = import.meta.env.DEV
  ? [
      // The Reel gallery (#/reel): every share "finish" rendered statically for fit/overflow QA,
      // plus a looping full reel.
      defineRoute('#/reel', () =>
        import('./clip/reel/ReelGallery').then((m) => ({ default: m.ReelGallery })),
      ),
      // The Slide lab (#/slidelab): one representative deck rendered in every presentation skin,
      // for fit/overflow + fidelity QA.
      defineRoute('#/slidelab', () =>
        import('./slides/lab/SlidesLab').then((m) => ({ default: m.SlidesLab })),
      ),
      // The Export lab (#/exportlab): one representative document rendered in every print skin,
      // for fit/overflow + fidelity QA — the document counterpart to #/slidelab.
      defineRoute('#/exportlab', () =>
        import('./export/lab/ExportLab').then((m) => ({ default: m.ExportLab })),
      ),
      defineRoute('#/synlab', () =>
        import('./live/prism/SynthesisLab').then((m) => ({ default: m.SynthesisLab })),
      ),
      // Repro harness (#/pageviewlab): the PDF page viewer in isolation, for the shaking/blur bug.
      defineRoute('#/pageviewlab', () =>
        import('./live/prism/PageViewLab').then((m) => ({ default: m.PageViewLab })),
      ),
      // The Mind lab (#/mindlab): the settled Watch-Me-Think map on a fixed spec, so its hub,
      // keep-out and label placement can be judged without a model key or six typed thoughts.
      defineRoute('#/mindlab', () =>
        import('./live/mindshape/MindShapeLab').then((m) => ({ default: m.MindShapeLab })),
      ),
      // The Why lab (#/whylab): the Why Machine overlay on its illustrative seed web, for layout +
      // counterfactual + light/dark QA.
      defineRoute('#/whylab', () =>
        import('./live/why/WhyLab').then((m) => ({ default: m.WhyLab })),
      ),
    ]
  : [];

const ROUTES: RouteEntry[] = [...PUBLIC_ROUTES, ...LAB_ROUTES];

/** The surface for a hash, or null when nothing matches (the caller falls back to the landing). */
export function routeFor(hash: string): LazyExoticComponent<ComponentType> | null {
  return ROUTES.find((route) => hash.startsWith(route.prefix))?.Component ?? null;
}

/** Start a route's code-only import from pointer/focus/touch intent. */
export function preloadRoute(hash: string): Promise<void> | null {
  return ROUTES.find((route) => hash.startsWith(route.prefix))?.preload() ?? null;
}
