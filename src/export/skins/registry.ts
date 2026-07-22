// The 10 template skins. Each is mostly data — a palette + font set + brand — wired to the
// shared chrome and shared section renderers. A skin's `sections` overrides only the
// archetypes it draws differently; its `chrome` overrides the masthead where its reference
// has a structurally distinct header. Colours/fonts are transcribed from the reference
// templates in "Professional template design/Template N".
import { StandardFooter, StandardMasthead, StandardRunningHeader } from './chrome/standard';
import {
  EditorialMasthead,
  ExecutiveMasthead,
  FinancialMasthead,
  LegalMasthead,
  LuxuryMasthead,
  MedicalMasthead,
  ResearchMasthead,
  SchoolMasthead,
  SwissMasthead,
} from './chrome/mastheads';
import {
  FinancialSpecTable,
  LegalNumberedMilestones,
  LuxuryRankedList,
  MedicalSpecTable,
  ResearchProse,
  SchoolSpecTable,
  SwissSpecTable,
  TerminalSpecTable,
} from './sections/variants';
import type { FaceSpec } from '../render/fonts';
import type { MastheadComponent, SkinChrome, SkinId, TemplateSkin } from './types';

// Every document skin's fonts are self-hosted (see public/fonts/LICENSE.txt): each entry below
// lists the local family stylesheet(s) a skin needs — its own faces under
// public/fonts/export/families/, plus /fonts/fonts.css (the app-wide sheet, already loaded by
// every page via index.html) for whichever of Hanken Grotesk/Newsreader/IBM Plex Mono it shares
// with the landing page. No Google Fonts CDN round trip at export time, so export works offline
// and isn't subject to the app's CSP (font-src/style-src are both 'self'). A shared family's
// stylesheet is always the *same* URL across every skin that references it — `ensureFacesLoaded`
// dedupes by href, so a family's `@font-face` rules are registered at most once per session no
// matter how many skins use it (two separate stylesheets declaring the same family/weight/style
// registers duplicate bindings, and Chromium's `document.fonts.load`/`check` don't reliably
// resolve against whichever duplicate is actually loaded — verified against a real build).
const FAMILY = (name: string) => `/fonts/export/families/${name}.css`;
const APP_FONTS = '/fonts/fonts.css';

const FONT_HREFS: Record<SkinId, string[]> = {
  editorial: [APP_FONTS, FAMILY('instrument-serif'), FAMILY('jetbrains-mono')],
  swiss: [FAMILY('archivo')],
  terminal: [FAMILY('jetbrains-mono'), FAMILY('space-grotesk')],
  executive: [APP_FONTS],
  luxury: [APP_FONTS, FAMILY('bodoni-moda')],
  medical: [APP_FONTS, FAMILY('ibm-plex-sans')],
  school: [APP_FONTS, FAMILY('lora')],
  financial: [FAMILY('libre-franklin'), FAMILY('source-serif-4')],
  research: [FAMILY('spectral'), FAMILY('ibm-plex-sans')],
  legal: [APP_FONTS, FAMILY('eb-garamond')],
};

const normal = (family: string, ...weights: number[]): FaceSpec[] =>
  weights.map((weight) => ({ family, weight }));
const italic = (family: string, ...weights: number[]): FaceSpec[] =>
  weights.map((weight) => ({ family, weight, style: 'italic' as const }));

// The exact weight/style set each skin's `FONT_HREFS` stylesheets declare — `ensureFacesLoaded`
// warms precisely these before a document capture, never more (an unused weight) or fewer (a
// silently-missed one).
const DOC_SKIN_FACES: Record<SkinId, FaceSpec[]> = {
  editorial: [
    ...normal('Instrument Serif', 400),
    ...italic('Instrument Serif', 400),
    ...normal('Hanken Grotesk', 400, 500, 600, 700),
    ...normal('JetBrains Mono', 400, 500, 600),
  ],
  swiss: normal('Archivo', 400, 500, 600, 700, 800, 900),
  terminal: [
    ...normal('JetBrains Mono', 400, 500, 600, 700),
    ...normal('Space Grotesk', 400, 500, 600, 700),
  ],
  executive: [
    ...normal('Newsreader', 400, 500, 600),
    ...italic('Newsreader', 400),
    ...normal('Hanken Grotesk', 400, 500, 600, 700),
  ],
  luxury: [
    ...normal('Bodoni Moda', 400, 500, 600),
    ...italic('Bodoni Moda', 400),
    ...normal('Hanken Grotesk', 400, 500, 600, 700),
  ],
  medical: [
    ...normal('IBM Plex Sans', 400, 500, 600, 700),
    ...normal('IBM Plex Mono', 400, 500, 600),
  ],
  school: [
    ...normal('Lora', 400, 500, 600),
    ...italic('Lora', 400, 500),
    ...normal('Hanken Grotesk', 400, 500, 600, 700),
  ],
  financial: [
    ...normal('Libre Franklin', 400, 500, 600, 700, 800),
    ...normal('Source Serif 4', 400, 500, 600),
  ],
  research: [
    ...normal('Spectral', 400, 500, 600),
    ...italic('Spectral', 400, 500),
    ...normal('IBM Plex Sans', 400, 500, 600, 700),
  ],
  legal: [
    ...normal('EB Garamond', 400, 500, 600),
    ...italic('EB Garamond', 400, 500),
    ...normal('Hanken Grotesk', 400, 500, 600, 700),
  ],
};

/** Page chrome with a given page-1 masthead; the running header + footer are shared and
 *  token-driven, so only the masthead varies between templates. */
function chromeWith(masthead: MastheadComponent): SkinChrome {
  return { masthead, runningHeader: StandardRunningHeader, footer: StandardFooter };
}

const STANDARD_CHROME = chromeWith(StandardMasthead);

const TAGLINE = 'Talk to AI. See what it means.';

export const editorial: TemplateSkin = {
  id: 'editorial',
  label: 'Editorial',
  blurb: 'Warm cream magazine field guide — Instrument Serif, hairline rules.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FCFBF9',
    ink: '#1A1815',
    muted: '#4A4538',
    faint: '#A8A293',
    accent: '#1C6E8C',
    tint: '#EEF3F4',
    rule: '#E2DDD2',
    ruleStrong: '#1A1815',
    track: '#EDE9E0',
    padding: '58px 64px 46px',
    radius: 3,
    cardRadius: 4,
    invertBg: '#1A1815',
    invertInk: '#F7F4EC',
  },
  fonts: {
    hrefs: FONT_HREFS.editorial,
    faces: DOC_SKIN_FACES.editorial,
    display: "'Instrument Serif', serif",
    body: "'Hanken Grotesk', -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const swiss: TemplateSkin = {
  id: 'swiss',
  label: 'Swiss',
  blurb: 'Bold international typographic — Archivo black, hard rules, red accent.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FFFFFF',
    ink: '#111111',
    muted: '#3A3A36',
    faint: '#8A8A85',
    accent: '#E1261C',
    tint: '#F2F2EF',
    rule: '#E2E2DE',
    ruleStrong: '#111111',
    track: '#E6E6E2',
    padding: '46px 56px 40px',
    radius: 0,
    cardRadius: 2,
    invertBg: '#E1261C',
    invertInk: '#FFFFFF',
  },
  fonts: {
    hrefs: FONT_HREFS.swiss,
    faces: DOC_SKIN_FACES.swiss,
    display: "'Archivo', -apple-system, sans-serif",
    body: "'Archivo', -apple-system, sans-serif",
    displayWeight: 800,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const terminal: TemplateSkin = {
  id: 'terminal',
  label: 'Terminal',
  blurb: 'Dark dot-grid developer console — Space Grotesk + JetBrains Mono, mint accent.',
  brand: { name: 'MAVÉA', tagline: 'talk to AI. see what it means.' },
  tokens: {
    pageBg: '#0C1014',
    pageBgImage: 'radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)',
    pageBgSize: '22px 22px',
    ink: '#C9D2DB',
    muted: '#8A96A2',
    faint: '#5C6873',
    accent: '#5EEAD4',
    tint: '#0E1419',
    rule: '#1E2730',
    ruleStrong: '#1E2730',
    track: '#1B232B',
    padding: '46px 50px 34px',
    radius: 6,
    cardRadius: 6,
    dark: true,
    invertBg: '#0E1419',
    invertInk: '#EAF0F5',
  },
  fonts: {
    hrefs: FONT_HREFS.terminal,
    faces: DOC_SKIN_FACES.terminal,
    display: "'Space Grotesk', -apple-system, sans-serif",
    body: "'Space Grotesk', -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const executive: TemplateSkin = {
  id: 'executive',
  label: 'Executive',
  blurb: 'Confidential consulting briefing — Newsreader, navy, left accent rule.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FFFFFF',
    ink: '#16202E',
    muted: '#525C6B',
    faint: '#8A93A2',
    accent: '#1C3D5A',
    tint: '#EEF1F5',
    rule: '#E2E6EC',
    ruleStrong: '#16202E',
    track: '#E6EAF0',
    padding: '56px 64px 44px 60px',
    pageBorderLeft: '4px solid var(--accent)',
    radius: 0,
    cardRadius: 4,
    invertBg: '#16202E',
    invertInk: '#F2F5F9',
  },
  fonts: {
    hrefs: FONT_HREFS.executive,
    faces: DOC_SKIN_FACES.executive,
    display: "'Newsreader', serif",
    body: "'Hanken Grotesk', -apple-system, sans-serif",
    mono: "'Hanken Grotesk', -apple-system, sans-serif",
    displayWeight: 500,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const luxury: TemplateSkin = {
  id: 'luxury',
  label: 'Luxury',
  blurb: 'Centered didone fashion editorial — Bodoni Moda, oxblood, hairlines.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#F8F4EC',
    ink: '#221C14',
    muted: '#5A5040',
    faint: '#9A8E78',
    accent: '#7A2E33',
    tint: '#EFE8DC',
    rule: '#D6CCBB',
    ruleStrong: '#D6CCBB',
    track: '#E2D9C9',
    padding: '54px 70px 44px',
    radius: 0,
    cardRadius: 4,
    invertBg: '#221C14',
    invertInk: '#F8F4EC',
  },
  fonts: {
    hrefs: FONT_HREFS.luxury,
    faces: DOC_SKIN_FACES.luxury,
    display: "'Bodoni Moda', serif",
    body: "'Hanken Grotesk', -apple-system, sans-serif",
    mono: "'Hanken Grotesk', -apple-system, sans-serif",
    displayWeight: 500,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const medical: TemplateSkin = {
  id: 'medical',
  label: 'Medical',
  blurb: 'Clinical health summary — IBM Plex, teal, rounded record cards.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FFFFFF',
    ink: '#16242A',
    muted: '#46555B',
    faint: '#9AA5AA',
    accent: '#0F766E',
    tint: '#E8F1F0',
    rule: '#E4E9EB',
    ruleStrong: '#0F766E',
    track: '#E4E9EB',
    padding: '50px 56px 40px',
    radius: 8,
    cardRadius: 10,
    invertBg: '#16242A',
    invertInk: '#EAF4F2',
  },
  fonts: {
    hrefs: FONT_HREFS.medical,
    faces: DOC_SKIN_FACES.medical,
    display: "'IBM Plex Sans', -apple-system, sans-serif",
    body: "'IBM Plex Sans', -apple-system, sans-serif",
    mono: "'IBM Plex Mono', monospace",
    displayWeight: 700,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const school: TemplateSkin = {
  id: 'school',
  label: 'School',
  blurb: 'Academic report card — Lora, maroon crest, warm paper.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FCFAF6',
    ink: '#241C18',
    muted: '#5A4D44',
    faint: '#9A8C7E',
    accent: '#7A1D2B',
    tint: '#F5EBE5',
    rule: '#E7DFD3',
    ruleStrong: '#7A1D2B',
    track: '#EDE4D8',
    padding: '52px 60px 40px',
    radius: 4,
    cardRadius: 8,
    invertBg: '#241C18',
    invertInk: '#F7EFE7',
  },
  fonts: {
    hrefs: FONT_HREFS.school,
    faces: DOC_SKIN_FACES.school,
    display: "'Lora', serif",
    body: "'Hanken Grotesk', -apple-system, sans-serif",
    mono: "'Hanken Grotesk', -apple-system, sans-serif",
    displayWeight: 500,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const financial: TemplateSkin = {
  id: 'financial',
  label: 'Financial',
  blurb: 'Investment brief — Libre Franklin + Source Serif, forest green, tabular nums.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FFFFFF',
    ink: '#15211B',
    muted: '#46554D',
    faint: '#96A09A',
    accent: '#1B4332',
    tint: '#EAF1ED',
    rule: '#E7ECE9',
    ruleStrong: '#1B4332',
    track: '#E7ECE9',
    padding: '50px 58px 40px',
    radius: 0,
    cardRadius: 8,
    invertBg: '#15211B',
    invertInk: '#EAF1ED',
    pos: '#1B7A4A',
    neg: '#B4342A',
  },
  fonts: {
    hrefs: FONT_HREFS.financial,
    faces: DOC_SKIN_FACES.financial,
    display: "'Source Serif 4', serif",
    body: "'Libre Franklin', -apple-system, sans-serif",
    mono: "'Libre Franklin', -apple-system, sans-serif",
    displayWeight: 600,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const research: TemplateSkin = {
  id: 'research',
  label: 'Research',
  blurb: 'Academic preprint — Spectral + IBM Plex, indigo, abstract rule.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FFFFFF',
    ink: '#1A1A24',
    muted: '#46465A',
    faint: '#9A9AAA',
    accent: '#43388E',
    tint: '#EEEDF7',
    rule: '#E2E2EC',
    ruleStrong: '#1A1A24',
    track: '#E6E6F0',
    padding: '50px 60px 40px',
    radius: 0,
    cardRadius: 10,
    invertBg: '#1A1A24',
    invertInk: '#EEEDF7',
  },
  fonts: {
    hrefs: FONT_HREFS.research,
    faces: DOC_SKIN_FACES.research,
    display: "'Spectral', serif",
    body: "'IBM Plex Sans', -apple-system, sans-serif",
    mono: "'IBM Plex Sans', -apple-system, sans-serif",
    displayWeight: 600,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

export const legal: TemplateSkin = {
  id: 'legal',
  label: 'Legal',
  blurb: 'Law-firm memorandum — EB Garamond, burgundy, privileged & confidential.',
  brand: { name: 'MAVÉA', tagline: TAGLINE },
  tokens: {
    pageBg: '#FCFAF5',
    ink: '#2A211C',
    muted: '#5A4D43',
    faint: '#9A8A7A',
    accent: '#5B2333',
    tint: '#F1E9DC',
    rule: '#E2D8C8',
    ruleStrong: '#5B2333',
    track: '#EBE2D4',
    padding: '54px 66px 42px',
    radius: 0,
    cardRadius: 6,
    invertBg: '#2A211C',
    invertInk: '#F4ECDE',
  },
  fonts: {
    hrefs: FONT_HREFS.legal,
    faces: DOC_SKIN_FACES.legal,
    display: "'EB Garamond', serif",
    body: "'Hanken Grotesk', -apple-system, sans-serif",
    mono: "'Hanken Grotesk', -apple-system, sans-serif",
    displayWeight: 500,
  },
  sections: {},
  chrome: STANDARD_CHROME,
};

// Templates whose reference has a structurally distinct page-1 header get a bespoke masthead;
// only Terminal keeps the standard one (its identity comes from the dark console body). Running
// header + footer stay shared.
editorial.chrome = chromeWith(EditorialMasthead);
swiss.chrome = chromeWith(SwissMasthead);
executive.chrome = chromeWith(ExecutiveMasthead);
luxury.chrome = chromeWith(LuxuryMasthead);
medical.chrome = chromeWith(MedicalMasthead);
school.chrome = chromeWith(SchoolMasthead);
financial.chrome = chromeWith(FinancialMasthead);
research.chrome = chromeWith(ResearchMasthead);
legal.chrome = chromeWith(LegalMasthead);

// Per-skin section overrides — the body voice each reference draws structurally differently
// (the rest of each skin still rides the shared, token-driven renderers).
financial.sections = { specTable: FinancialSpecTable };
swiss.sections = { specTable: SwissSpecTable };
terminal.sections = { specTable: TerminalSpecTable };
luxury.sections = { rankedList: LuxuryRankedList };
legal.sections = { numberedMilestones: LegalNumberedMilestones };
medical.sections = { specTable: MedicalSpecTable };
school.sections = { specTable: SchoolSpecTable };
research.sections = { prose: ResearchProse };

/** Every skin, keyed by id. */
export const SKINS: Record<SkinId, TemplateSkin> = {
  editorial,
  swiss,
  terminal,
  executive,
  luxury,
  medical,
  school,
  financial,
  research,
  legal,
};

/** Gallery display order. */
export const SKIN_ORDER: SkinId[] = [
  'editorial',
  'swiss',
  'terminal',
  'executive',
  'luxury',
  'medical',
  'school',
  'financial',
  'research',
  'legal',
];

const TOPIC_HINTS: { test: RegExp; skin: SkinId }[] = [
  { test: /financ|money|invest|portfolio|budget|market|stock|fund|econ/i, skin: 'financial' },
  { test: /health|medic|clinic|symptom|wellness|fitness|nutrition|body/i, skin: 'medical' },
  { test: /legal|law|contract|compliance|policy|memo/i, skin: 'legal' },
  { test: /research|science|paper|physics|biology|chem|math|algorithm/i, skin: 'research' },
  { test: /school|educat|learn|course|curriculum|study|exam|grade/i, skin: 'school' },
  // Word-bound the short/ambiguous tokens so "therapy", "device", "develop" don't misroute here.
  { test: /code|software|\bapi\b|engineer|\bdev\b|program|terminal|\bsystem\b/i, skin: 'terminal' },
];

/** A sensible default skin for an answer's domain (the user can always change it). */
export function suggestSkin(topic?: string): SkinId {
  if (topic) {
    for (const { test, skin } of TOPIC_HINTS) if (test.test(topic)) return skin;
  }
  return 'editorial';
}
