// cast.ts — fictional personas for curated prerecorded examples. Identity only (name, role,
// look); what each scenario asks lives in scripts.ts, and its baked model answers
// in corpus/. This file is deliberately tiny and dependency-free: the landing's demo cards
// import it eagerly, so it must never pull the Live surface, the corpus, or anything heavy
// into the landing bundle.

export interface DemoCastMember {
  id: string;
  /** The session's job — what a visitor would come here to do ("Run a quarterly review").
   *  This LEADS everywhere a demo is offered; the persona is the supporting detail. */
  useCase: string;
  name: string;
  /** Short fictional context shown under the name ("Fictional CFO"). */
  role: string;
  /** A single letter (initials disc) or a single emoji (tinted disc). */
  avatar: string;
  /** Card/banner accent color. */
  accent: string;
  /** One-line hook for the card — what this session shows. */
  blurb: string;
  /** Coarse audience label ("Finance", "Student", …) for chips and badges. */
  kind: string;
}

/** The four hero sessions the landing leads with, one per use-case category. */
export interface DemoCategory {
  id: string;
  label: string;
  /** The hero persona for this category's card. */
  persona: string;
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: 'business', label: 'Business', persona: 'cfo' },
  { id: 'learn', label: 'Learn', persona: 'student' },
  { id: 'build', label: 'Build', persona: 'dev' },
  { id: 'travel', label: 'Travel', persona: 'traveler' },
];

/** The curated prerecorded examples — one per landing category, each led by its USE CASE. Kept small
 *  and flagship-grade on purpose: together the four double as a feature tour (pin, bend,
 *  pen, focus, spatial canvas, chips, export, present, dashboards, flashcards, share, ⌘K).
 *  Each entry has a script (scripts.ts) and a baked corpus shard
 *  (corpus/<id>.generated.json); a test keeps the three in lockstep. */
export const DEMO_CAST: DemoCastMember[] = [
  {
    id: 'cfo',
    useCase: 'Run a quarterly review',
    name: 'Renata',
    role: 'Fictional CFO',
    avatar: 'R',
    accent: '#3ed8a6',
    blurb: 'The whole quarter in one canvas, then board-ready in a tap.',
    kind: 'Finance',
  },
  {
    id: 'student',
    useCase: 'Study for an exam',
    name: 'Maya',
    role: 'Fictional student',
    avatar: 'M',
    accent: '#4fc3e8',
    blurb: 'Cramming for an econ exam, explained so it sticks.',
    kind: 'Student',
  },
  {
    id: 'dev',
    useCase: 'Reason about architecture',
    name: 'Devon',
    role: 'Fictional engineer',
    avatar: 'D',
    accent: '#54c7c0',
    blurb: 'OAuth, sessions vs JWTs — the architecture, drawn out.',
    kind: 'Engineer',
  },
  {
    id: 'traveler',
    useCase: 'Plan a trip',
    name: 'Lena',
    role: 'Fictional traveler',
    avatar: 'L',
    accent: '#ff9a6b',
    blurb: 'Three days in Lisbon, mapped, planned, and print-ready.',
    kind: 'Travel',
  },
];

const BY_ID = new Map(DEMO_CAST.map((p) => [p.id, p]));

export function castMember(id: string): DemoCastMember | undefined {
  return BY_ID.get(id);
}

/** The hero persona for each landing card, in category order. */
export function heroCast(): DemoCastMember[] {
  return DEMO_CATEGORIES.map((c) => BY_ID.get(c.persona)).filter((p): p is DemoCastMember => !!p);
}
