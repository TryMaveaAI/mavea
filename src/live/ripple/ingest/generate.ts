// generate.ts — the one place the diff path talks to a model. It asks the connected provider to
// enrich the deterministic floor and merges the result back. It NEVER throws and NEVER blocks the
// floor: on an abort it returns the floor unchanged (nothing to report — something newer already
// superseded it). On a GENUINE failure — no model, bad credentials, a refusal, malformed JSON — it
// resolves null instead, so the caller can say so rather than silently passing the floor off as a
// real read. Either way enrichment is pure upside for the reader: the grounded floor is on screen
// the instant they paste, and the model's read fills in when (and only when) it succeeds.
import { getAdapter } from '../../providers';
import type { ModelConfig } from '../../../types/mavea';
import type { ThinkingLevel } from '../../providers/types';
import type {
  CourseCapstone,
  CourseLesson,
  LessonDetail,
  QuizQuestion,
  ShipCourse,
  ShipModel,
} from '../model';
import {
  ENRICH_SYSTEM,
  buildEnrichPrompt,
  parseEnrichment,
  mergeEnrichment,
  type Enrichment,
} from './companionSchema';
import { EnrichmentStreamReader } from './streamEnrich';
import { buildIncidentPrompt, mergeIncident, parseIncidentEnrichment } from './incident';
import {
  ONBOARD_SYSTEM,
  COURSES_SYSTEM,
  COURSE_CLOSING_SYSTEM,
  LESSON_SYSTEM,
  buildOnboardPrompt,
  buildCoursesPrompt,
  buildCourseClosingPrompt,
  buildLessonPrompt,
  parseOnboarding,
  parseCoursesResponse,
  parseCourseClosingResponse,
  parseLessonDetail,
  mergeOnboarding,
} from './onboardSchema';
import { fetchFileContents } from './githubBrowser';
import { fnv1a } from '../cache';

/** Options for the diff enrichment. `onPartial` fires as the reply streams — fed the enrichment
 *  fields that have FULLY landed so far (validated, never half-parsed) so the verdict can sharpen in
 *  place; the resolved model is still the canonical final parse. */
export interface EnrichOpts {
  signal?: AbortSignal;
  codeContext?: string;
  onPartial?: (enr: Enrichment) => void;
  /** Hard output cap, sized to the model tier (smaller for slow/cheap models). Default 2600. */
  maxTokens?: number;
  /** Reasoning effort, sized to the tier (providers without the knob ignore it). */
  thinkingLevel?: ThinkingLevel;
}

/** The streaming half of an enrichment call: accumulate the raw reply and hand the overlay every
 *  field that has FULLY landed. ONE reader (and one buffer) for the whole reply, held in this
 *  closure — the reader's per-field cursors are what make a delta cost its own bytes instead of a
 *  fresh six-way walk of everything received so far, and each closed element is parsed exactly
 *  once. Reasoning tokens are skipped (never part of the answer), and nothing is emitted until
 *  something has actually landed. */
function enrichmentDeltas(
  onPartial: (enr: Enrichment) => void,
): (chunk: string, meta?: { reasoning?: boolean }) => void {
  const reader = new EnrichmentStreamReader();
  let buf = '';
  return (chunk, meta) => {
    if (meta?.reasoning) return;
    buf += chunk;
    const partial = reader.read(buf);
    if (
      partial.summary ||
      partial.gateRationale ||
      partial.risks ||
      partial.changes ||
      partial.cascades ||
      partial.suggestions
    ) {
      onPartial(partial);
    }
  };
}

/** Enriches the floor with the model's read of the diff. Resolves the enriched model on success;
 *  resolves the unchanged floor if the run was aborted (superseded, not a failure); resolves `null`
 *  on a genuine failure (no key, a refusal, malformed JSON) so the caller can surface that honestly
 *  instead of quietly passing the floor off as a real read. */
export async function enrichShipModel(
  floor: ShipModel,
  diffText: string,
  cfg: ModelConfig,
  opts: EnrichOpts = {},
): Promise<ShipModel | null> {
  const { signal, codeContext, onPartial, maxTokens = 2600, thinkingLevel } = opts;
  try {
    // Stream the verdict in: as JSON arrives, hand the overlay each field the instant it closes.
    const onDelta = onPartial ? enrichmentDeltas(onPartial) : undefined;
    const out = await getAdapter(cfg.provider).generate(
      {
        system: ENRICH_SYSTEM,
        // The schema + rules are stable, so pass them as the cache base — providers serve them from
        // cache on every re-analysis (Anthropic ephemeral block, Gemini systemInstruction).
        systemBase: ENRICH_SYSTEM,
        history: [],
        user: buildEnrichPrompt(floor, diffText, codeContext),
        maxTokens,
        temperature: 0,
        format: null, // free-form JSON — we parse + validate defensively in parseEnrichment
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(signal ? { signal } : {}),
      },
      cfg,
      onDelta,
    );
    if (signal?.aborted) return floor;
    const enr = parseEnrichment(out.raw);
    if (!enr) return null; // the model replied, but not with a parseable read — a genuine failure
    return mergeEnrichment(floor, enr, cfg.model);
  } catch (err) {
    // AbortError is an intentional cancel (a newer analysis superseded this one) — not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return floor;
    return null;
  }
}

/** Read a repo's README + manifest in one parallel best-effort wave (missing → ''). Shared by the two
 *  on-demand Understand calls below. */
async function readRepoDocs(
  repo: string,
  ref: string | undefined,
): Promise<{ readme: string; pkg: string }> {
  const [readme, pkg] = await Promise.all([
    Promise.all(
      ['README.md', 'readme.md', 'Readme.md', 'docs/README.md'].map((p) =>
        fetchFileContents(p, ref, repo).catch(() => ({ ok: false as const })),
      ),
    ).then((rs) => {
      const hit = rs.find((r) => r.ok && r.content);
      return hit && hit.ok ? (hit.content ?? '') : '';
    }),
    fetchFileContents('package.json', ref, repo)
      .catch(() => ({ ok: false as const }))
      .then((r) => (r.ok && r.content ? r.content : '')),
  ]);
  return { readme, pkg };
}

/** Options for the orientation call (the lighter Understand read). */
export interface OrientationOpts {
  signal?: AbortSignal;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
}

/** Orientation: turn the file tree into a real project read — per-area purposes + dependencies, a
 *  first-week path, and a request's life — merged onto the floor. Loaded ON DEMAND (the "Map & request
 *  life" view), independently of the heavy curriculum. Never throws; returns the model unchanged on any
 *  failure (the structural floor stands). */
export async function enrichOrientation(
  model: ShipModel,
  repo: string,
  ref: string | undefined,
  cfg: ModelConfig,
  opts: OrientationOpts = {},
): Promise<ShipModel> {
  const { signal, maxTokens = 2600, thinkingLevel } = opts;
  if (model.modules.length === 0) return model;
  try {
    const { readme, pkg } = await readRepoDocs(repo, ref);
    if (signal?.aborted) return model;
    const orientation = await getAdapter(cfg.provider)
      .generate(
        {
          system: ONBOARD_SYSTEM,
          systemBase: ONBOARD_SYSTEM,
          history: [],
          user: buildOnboardPrompt(model, readme, pkg),
          maxTokens,
          temperature: 0,
          format: null,
          ...(thinkingLevel ? { thinkingLevel } : {}),
          ...(signal ? { signal } : {}),
        },
        cfg,
      )
      .then((r) => parseOnboarding(r.raw))
      .catch(() => null);
    if (signal?.aborted || !orientation) return model;
    return mergeOnboarding(model, orientation);
  } catch {
    return model;
  }
}

/** Options for the curriculum OUTLINE call, sized to the model tier. `count` = number of weeks. */
export interface CoursesOpts {
  signal?: AbortSignal;
  count?: number;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  /** Area name to center the curriculum on (from the reader's focus picker). Absent = whole repo,
   *  which still ranks the highest-impact areas first. */
  focus?: string;
}

/** Build the multi-week curriculum OUTLINE from the repo — the syllabus structure (weeks + lessons +
 *  the real files each studies), NOT the lesson bodies (those are `enrichLesson`, on demand). Cheap
 *  relative to the deep lessons. Runs only when the Courses view opens; result is cached. Returns the
 *  courses, or undefined on any failure/abort (the caller keeps the floor). */
export async function enrichCourses(
  model: ShipModel,
  repo: string,
  ref: string | undefined,
  cfg: ModelConfig,
  opts: CoursesOpts = {},
): Promise<ShipCourse[] | undefined> {
  const { signal, count = 5, maxTokens = 4000, thinkingLevel, focus } = opts;
  if (model.modules.length === 0) return undefined;
  try {
    const { readme, pkg } = await readRepoDocs(repo, ref);
    if (signal?.aborted) return undefined;
    const courses = await getAdapter(cfg.provider)
      .generate(
        {
          system: COURSES_SYSTEM,
          systemBase: COURSES_SYSTEM,
          history: [],
          user: buildCoursesPrompt(model, readme, pkg, count, focus),
          maxTokens,
          temperature: 0,
          format: null,
          ...(thinkingLevel ? { thinkingLevel } : {}),
          ...(signal ? { signal } : {}),
        },
        cfg,
      )
      .then((r) => parseCoursesResponse(r.raw))
      .catch(() => undefined);
    if (signal?.aborted) return undefined;
    return courses && courses.length ? courses : undefined;
  } catch {
    return undefined;
  }
}

/** The token-HEAVY closing check (end-of-week quiz + capstone) for ONE course, generated ON DEMAND when
 *  the reader opens that course — never in the light outline above. Mirrors enrichCourses: never throws,
 *  returns undefined on any failure/abort, so the course simply renders without a quiz/capstone. */
export async function enrichCourseClosing(
  course: ShipCourse,
  cfg: ModelConfig,
  opts: { signal?: AbortSignal; maxTokens?: number; thinkingLevel?: ThinkingLevel } = {},
): Promise<{ quiz?: QuizQuestion[]; capstone?: CourseCapstone } | undefined> {
  const { signal, maxTokens = 4000, thinkingLevel } = opts;
  if (!course.lessons.length) return undefined;
  try {
    const r = await getAdapter(cfg.provider).generate(
      {
        system: COURSE_CLOSING_SYSTEM,
        systemBase: COURSE_CLOSING_SYSTEM,
        history: [],
        user: buildCourseClosingPrompt(course),
        maxTokens,
        temperature: 0,
        format: null,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    if (signal?.aborted) return undefined;
    return parseCourseClosingResponse(r.raw);
  } catch {
    return undefined;
  }
}

const LESSON_FILES = 3; // changed-file excerpts to feed a deep lesson
const LESSON_EXCERPT_LINES = 140;

/** The lesson's real code, gathered for the deep lesson call — and a content hash of exactly what
 *  was read. These gateway file reads cost no model call, so a caller can always gather fresh (never
 *  trusting a possibly-stale `ref`) and use the hash to address the lesson CACHE: when the files
 *  haven't changed, the hash matches and the cached lesson serves; when they have, it misses cleanly
 *  and only THIS lesson regenerates — never the rest of the course. */
export interface LessonCode {
  codeContext: string;
  contentHash: string;
}

/** Read the actual code a lesson studies (the files it points at), in parallel + bounded, so the
 *  deep lesson teaches from real code rather than guessing. Directories simply yield no file — that's
 *  fine; the model teaches from whatever excerpts came back. Never throws. */
export async function gatherLessonCode(
  lesson: CourseLesson,
  ref: string | undefined,
  repo: string,
): Promise<LessonCode> {
  const files = lesson.read.filter((p) => /\.[a-z0-9]+$/i.test(p)).slice(0, LESSON_FILES);
  const fetched = await Promise.all(
    files.map((f) =>
      fetchFileContents(f, ref, repo)
        .catch(() => ({ ok: false as const }))
        .then((r) => ({ file: f, r })),
    ),
  );
  const codeContext = fetched
    .filter((x) => x.r.ok && x.r.content)
    .map((x) => {
      const content = (x.r as { content: string }).content;
      const excerpt = content.split('\n').slice(0, LESSON_EXCERPT_LINES).join('\n');
      return `FILE ${x.file}:\n${excerpt}\n`;
    })
    .join('\n');
  return { codeContext, contentHash: fnv1a(codeContext) };
}

/** Options for the deep per-lesson call. */
export interface LessonOpts {
  signal?: AbortSignal;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  altitude?: import('../model').Altitude;
}

/** Generate the in-depth body of ONE lesson from its already-gathered real code (see
 *  `gatherLessonCode`) so the walkthrough can quote actual excerpts — the spotlight. This is the
 *  deep, expensive call, run only when the reader opens the lesson, and the result is cached. Never
 *  throws; returns null on any failure so the lesson stays at its outline level. */
export async function enrichLesson(
  course: ShipCourse,
  lesson: CourseLesson,
  codeContext: string,
  cfg: ModelConfig,
  opts: LessonOpts = {},
): Promise<LessonDetail | null> {
  const { signal, maxTokens = 4200, thinkingLevel, altitude } = opts;
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        system: LESSON_SYSTEM,
        systemBase: LESSON_SYSTEM,
        history: [],
        user: buildLessonPrompt(course, lesson, codeContext, altitude),
        maxTokens,
        temperature: 0,
        format: null,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    if (signal?.aborted) return null;
    return parseLessonDetail(out.raw);
  } catch {
    return null;
  }
}

/** Incident mode: have the model reason the reverse chain (symptom → cause), the rollback, and who
 *  to wake, grounded in the alert + the attached change. Never throws; returns the model unchanged
 *  (its floor incident stands) on any failure. */
export async function enrichIncident(
  model: ShipModel,
  alertText: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<ShipModel> {
  if (!model.incident) return model;
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        system:
          'You are an on-call engineer reasoning BACKWARDS from a production alert to its likely ' +
          'cause. You ground every claim in the alert and the change provided; you never invent ' +
          'deploys, services, or people. The rollback is a draft the human runs — never an action ' +
          'you take. Reply with STRICT JSON only.',
        history: [],
        user: buildIncidentPrompt(alertText, model),
        maxTokens: 1500,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    if (signal?.aborted) return model;
    const enr = parseIncidentEnrichment(out.raw);
    if (!enr) return model;
    return { ...model, incident: mergeIncident(model.incident, enr) };
  } catch {
    return model;
  }
}
