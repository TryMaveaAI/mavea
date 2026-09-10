// routes.ts — hash prefix → lazy surface, as data rather than a branching tree.
//
// Every surface but the landing (App) code-splits into its own chunk, so visiting one is the
// only thing that downloads it. The prefixes and loaders live in routeTable.ts (plain data a Node
// script can import); this module is where they become preloadable lazy components, and where the
// QA/fidelity harnesses (the *Lab surfaces, the reel gallery) are gathered behind
// `import.meta.env.DEV`: that condition is a compile-time constant, so a production build proves
// the branch unreachable and drops every chunk it references entirely — a stray lab link can never
// strand a real visitor on a screen with no way back.
import type { ComponentType } from 'react';
import { createPreloadableLazy } from './lib/preloadableLazy';
import { LAB_ROUTES, PUBLIC_ROUTES, type RouteSpec } from './routeTable';

export interface RouteEntry {
  prefix: string;
  Component: ComponentType;
  preload: () => Promise<void>;
}

function defineRoute({ prefix, load }: RouteSpec): RouteEntry {
  const surface = createPreloadableLazy(load);
  return { prefix, ...surface };
}

const ROUTES: RouteEntry[] = [
  ...PUBLIC_ROUTES.map(defineRoute),
  ...(import.meta.env.DEV ? LAB_ROUTES.map(defineRoute) : []),
];

/** The surface for a hash, or null when nothing matches (the caller falls back to the landing). */
export function routeFor(hash: string): ComponentType | null {
  return ROUTES.find((route) => hash.startsWith(route.prefix))?.Component ?? null;
}

/** Start a route's code-only import from pointer/focus/touch intent. */
export function preloadRoute(hash: string): Promise<void> | null {
  return ROUTES.find((route) => hash.startsWith(route.prefix))?.preload() ?? null;
}
