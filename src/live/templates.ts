// Theme templates for the Live surface — complete visual identities (palette, type roles,
// radii, shadows, orb tint) the user can switch live. A template is a full rebind of the
// same token contract the light theme flips, applied as `data-template` on <html>; the
// all 269 block components only ever read those token names, so every template just works.
//
// Templates are a LIVE feature: the data-template attribute is applied when Live mounts (or
// pre-paint on a direct #/live load) and removed when Live unmounts, so the Demo and the
// gallery never carry it. (The global type roles in type-roles.css are a separate, deliberate
// app-wide change.) Every template ships a dark AND a light rebind, so the user's stored
// light/dark preference (`mavea-theme`) stays in charge of brightness — the theme toggle
// works identically inside every skin, and the choice carries back to the Demo.

import { readTheme, applyTheme } from '../lib/theme';

export type TemplateId = 'paper' | 'daylight' | 'ink' | 'console' | 'marquee' | 'default';
export type TemplatePersona =
  'Generalist' | 'Scholar' | 'Planner' | 'Editor' | 'Operator' | 'Storyteller';
export type TemplateGeometry = 'soft' | 'paper' | 'airy' | 'editorial' | 'technical' | 'poster';

export interface TemplatePreview {
  background: string;
  surface: string;
  ink: string;
  accent: string;
  fontRole: string;
  geometry: TemplateGeometry;
}

export interface TemplateDef {
  id: TemplateId;
  label: string;
  persona: TemplatePersona;
  tagline: string;
  bestFor: string;
  preview: TemplatePreview;
}

export const TEMPLATES: readonly TemplateDef[] = [
  {
    id: 'default',
    label: 'Original',
    persona: 'Generalist',
    tagline: 'Balanced, cinematic, and quietly capable.',
    bestFor: 'Mixed research, ideas, and everyday knowledge work',
    preview: {
      background: '#0B0F17',
      surface: '#141A26',
      ink: '#F2F5FA',
      accent: '#8395FF',
      fontRole: 'Hanken + Newsreader',
      geometry: 'soft',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    persona: 'Scholar',
    tagline: 'A composed reading room for deep thought.',
    bestFor: 'Study, research, teaching, and long-form synthesis',
    preview: {
      background: '#F1EBDD',
      surface: '#FBF8F0',
      ink: '#242018',
      accent: '#235C43',
      fontRole: 'Lora + Hanken',
      geometry: 'paper',
    },
  },
  {
    id: 'daylight',
    label: 'Daylight',
    persona: 'Planner',
    tagline: 'An optimistic studio that makes plans feel possible.',
    bestFor: 'Projects, coaching, travel, routines, and collaboration',
    preview: {
      background: '#F4F6F5',
      surface: '#FFFCF7',
      ink: '#22262D',
      accent: '#A6462B',
      fontRole: 'Space Grotesk + Hanken',
      geometry: 'airy',
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    persona: 'Editor',
    tagline: 'A disciplined editorial desk with a point of view.',
    bestFor: 'Writing, review, journalism, legal work, and strategy',
    preview: {
      background: '#F5EFE4',
      surface: '#FFF9EF',
      ink: '#1B1713',
      accent: '#7C291B',
      fontRole: 'Bodoni + Source Serif',
      geometry: 'editorial',
    },
  },
  {
    id: 'console',
    label: 'Console',
    persona: 'Operator',
    tagline: 'A precise control room built for signal over noise.',
    bestFor: 'Engineering, finance, analytics, monitoring, and operations',
    preview: {
      background: '#070A0E',
      surface: '#10151B',
      ink: '#E7EDF3',
      accent: '#F3B340',
      fontRole: 'IBM Plex Sans + Mono',
      geometry: 'technical',
    },
  },
  {
    id: 'marquee',
    label: 'Marquee',
    persona: 'Storyteller',
    tagline: 'A bold stage for ideas meant to be remembered.',
    bestFor: 'Presenting, persuading, creating, and launching',
    preview: {
      background: '#100D11',
      surface: '#1B161C',
      ink: '#F4EBDD',
      accent: '#FF659B',
      fontRole: 'Instrument Serif + Archivo',
      geometry: 'poster',
    },
  },
];

export const TEMPLATE_KEY = 'mavea-template';

/** What Live looks like out of the box. Paper — the composed reading room — rather than the bare
 *  surface: an answer is something to READ, and the first impression should look composed rather
 *  than unstyled. The other skins, and 'default', stay one click away in Settings. */
export const DEFAULT_LIVE_TEMPLATE: TemplateId = 'paper';

function isTemplateId(v: unknown): v is TemplateId {
  return TEMPLATES.some((t) => t.id === v);
}

/** The persisted choice, falling back to Live's default on garbage or absence. */
export function readTemplate(): TemplateId {
  try {
    const v = localStorage.getItem(TEMPLATE_KEY);
    return isTemplateId(v) ? v : DEFAULT_LIVE_TEMPLATE;
  } catch {
    return DEFAULT_LIVE_TEMPLATE;
  }
}

export function persistTemplate(id: TemplateId): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, id);
  } catch {
    /* private mode — the choice just doesn't survive a reload */
  }
}

/** Re-assert the user's own light/dark preference (the app default is dark). */
function restoreStoredTheme(doc: Document): void {
  applyTheme(readTheme(), doc);
}

const TEMPLATE_FONT_FACES: Record<TemplateId, readonly string[]> = {
  default: ["600 14px 'Hanken Grotesk'", "400 24px 'Newsreader'", "500 12px 'IBM Plex Mono'"],
  paper: ["600 14px 'Hanken Grotesk'", "400 24px 'Lora'", "500 12px 'IBM Plex Mono'"],
  daylight: ["600 14px 'Space Grotesk'", "400 16px 'Hanken Grotesk'"],
  ink: [
    "600 28px 'Bodoni Moda'",
    "400 16px 'Source Serif 4'",
    "600 13px 'Libre Franklin'",
    "500 12px 'IBM Plex Mono'",
  ],
  console: ["500 14px 'IBM Plex Sans'", "500 12px 'IBM Plex Mono'"],
  marquee: ["400 28px 'Instrument Serif'", "600 14px 'Archivo'"],
};

/** Warm locally hosted faces before a selection is committed. The CSS Font Loading API is
 *  deliberately best-effort: older webviews simply render from the same local @font-face rules. */
export function prewarmTemplateFonts(doc: Document, id?: TemplateId): void {
  const fontSet = doc.fonts;
  if (!fontSet?.load) return;
  const ids = id ? [id] : TEMPLATES.map((template) => template.id);
  const faces = new Set(ids.flatMap((templateId) => TEMPLATE_FONT_FACES[templateId]));
  for (const face of faces) void fontSet.load(face);
}

/** Apply a template: set the attribute and re-assert the stored brightness (every template
 *  has both rebinds, so the toggle stays in charge). Even Original gets an explicit Live-only
 *  attribute; clearTemplate removes it again when the user leaves the surface.
 *  Never writes the `mavea-theme` storage. */
export function applyTemplate(doc: Document, id: TemplateId): void {
  const def = TEMPLATES.find((t) => t.id === id);
  if (!def) delete doc.documentElement.dataset.template;
  else doc.documentElement.dataset.template = id;
  restoreStoredTheme(doc);
}

/** Leaving Live: drop the template and hand the page back to the stored preference. */
export function clearTemplate(doc: Document): void {
  delete doc.documentElement.dataset.template;
  restoreStoredTheme(doc);
}

/** How many mounted surfaces are currently holding the skin. Ref-counted because they OVERLAP:
 *  the setup wizard renders its own picker inside Live, so leaving the wizard for a first answer
 *  unmounted the picker — and its teardown stripped `data-template` out from under the Live
 *  surface that was still standing. The chosen skin survived in storage but the new conversation
 *  rendered in the stock one, which read as "my theme didn't save". Only the LAST holder restores
 *  the page. */
let skinHolders = 0;

/** Hold the persisted skin for the lifetime of a mounted surface, restoring the page when the last
 *  holder lets go. Returns the cleanup so a React effect can `return mountTemplateSkin(document)`.
 *  Shared by the topbar picker, the Live surface, and the Dashboards Present view, which REPLACES
 *  that topbar — without the ref-count, whichever one unmounted first took the skin with it. */
export function mountTemplateSkin(doc: Document = document): () => void {
  const id = readTemplate();
  prewarmTemplateFonts(doc, id);
  applyTemplate(doc, id);
  skinHolders += 1;
  let released = false;
  return () => {
    // A React effect cleanup can run more than once in development's double-invoke; releasing
    // twice would drop the count below the real number of holders and clear an in-use skin.
    if (released) return;
    released = true;
    skinHolders = Math.max(0, skinHolders - 1);
    if (skinHolders === 0) clearTemplate(doc);
  };
}

/** Route prefixes whose surfaces wear the chosen workspace skin. Keep in step with the surfaces
 *  that mount it (each calls mountTemplateSkin, or renders a TemplatePicker that does) — a surface
 *  missing from this list still gets the skin, just one frame late and with a visible flash. */
const SKINNED_ROUTES = ['#/live', '#/dashboards', '#/flashcards'] as const;

/** Pre-paint apply for a direct load of a skinned surface, so it never flashes the default skin
 *  (the CSP forbids an inline boot script; this runs from main.tsx before the first render). */
export function applyStartupTemplate(doc: Document, hash: string): void {
  if (!SKINNED_ROUTES.some((r) => hash.startsWith(r))) return;
  const id = readTemplate();
  prewarmTemplateFonts(doc, id);
  applyTemplate(doc, id);
}
