// backup.ts — a portable, decrypted snapshot of the user-managed Live stores.
//
// Persisted content is encrypted with a non-extractable, origin-bound key, so copying browser
// storage is not a backup. This module waits for encrypted stores to hydrate, exports their
// in-memory plaintext, and restores only bounded, production-validated content through each
// store's merge seam. Credentials are intentionally never portable.
import { ALLOWED_BLOCK_TYPES } from '../../engine/blockTypes';
import { validateLiveResponse } from '../../engine/liveSchema';
import { CATALOG_FACTS, ensureDetails } from '../../canvas/blocks/catalog';
import type { ConversationSpec } from '../../data/conversation';
import { getDashboards, mergeDashboards, whenDashboardsHydrated } from '../dashboards/store';
import { getMemoryNodes, importMemoryNodes, whenMemoryHydrated } from '../memory/store';
import { getAllCards, getStudyPrefs, importCards, importStudyPrefs } from '../srs/store';
import type { StudyStyle } from '../srs/store';
import { getLibrary, importLibrary, whenLibraryHydrated } from '../library/store';
import { getAtlas, importAtlas, whenAtlasHydrated } from '../atlas/store';
import { getCourses, getProgress, importCourses } from '../course/store';
import { exportConfig, importConfigWithSummary, type CredentialField } from '../useLiveConfig';

export const CURRENT_VERSION = 1;
export const MAX_BACKUP_BYTES = 25_000_000;

const MAX_DEPTH = 32;
const MAX_TOTAL_VALUES = 500_000;
const MAX_OBJECT_KEYS = 256;
const MAX_STRING_LENGTH = 32_768;
const MAX_BLOCKS_PER_CANVAS = 24;

type SectionName = 'dashboards' | 'memory' | 'flashcards' | 'library' | 'atlas' | 'courses';

const SECTION_LIMITS: Record<SectionName, { count: number; entryBytes: number }> = {
  dashboards: { count: 24, entryBytes: 1_000_000 },
  memory: { count: 50, entryBytes: 16_000 },
  flashcards: { count: 1_000, entryBytes: 32_000 },
  library: { count: 12, entryBytes: 240_000 },
  atlas: { count: 500, entryBytes: 16_000 },
  courses: { count: 60, entryBytes: 300_000 },
};

export type BackupWarning =
  | 'credentials-ignored'
  | 'durability-unverified'
  | 'entries-rejected'
  | 'future-version'
  | 'import-may-evict-existing'
  | 'stores-excluded';

export interface ExcludedStore {
  id: string;
  reason: 'credential' | 'device-preference' | 'ephemeral-cache' | 'not-yet-portable';
}

/** These omissions are part of the file format, not an accidental claim of "everything". */
export const EXCLUDED_STORES: readonly ExcludedStore[] = Object.freeze([
  { id: 'provider-api-keys', reason: 'credential' },
  { id: 'search-api-keys', reason: 'credential' },
  { id: 'github-token', reason: 'credential' },
  { id: 'active-session-and-turn-history', reason: 'not-yet-portable' },
  { id: 'turn-bookmarks', reason: 'not-yet-portable' },
  { id: 'dashboard-refresh-ledger', reason: 'not-yet-portable' },
  { id: 'dashboard-morning-briefing', reason: 'not-yet-portable' },
  { id: 'dashboard-budget-open-and-optimizer-state', reason: 'device-preference' },
  { id: 'course-generated-frame-cache', reason: 'ephemeral-cache' },
  { id: 'course-checkpoint-cache', reason: 'ephemeral-cache' },
  { id: 'course-mastery', reason: 'not-yet-portable' },
  { id: 'ripple-course-progress-and-metadata', reason: 'not-yet-portable' },
  { id: 'ripple-tracked-items', reason: 'not-yet-portable' },
  { id: 'appearance-audio-performance-preferences', reason: 'device-preference' },
  { id: 'setup-tour-demo-and-feature-hints', reason: 'device-preference' },
  { id: 'legal-acceptance-record', reason: 'device-preference' },
  { id: 'one-shot-navigation-seeds', reason: 'ephemeral-cache' },
]);

export interface BackupBundle {
  app: 'mavea';
  kind: 'backup';
  version: number;
  exportedAt: number;
  data: {
    dashboards?: unknown[];
    memory?: unknown[];
    flashcards?: unknown[];
    study?: unknown;
    library?: unknown[];
    atlas?: unknown[];
    courses?: { courses: unknown[]; progress: Record<string, unknown> };
    settings?: Record<string, unknown>;
  };
}

export interface SectionPreflight {
  incoming: number;
  /** Entries that passed backup-level shape/size/content gates. Owning stores can still reject a
   *  semantically incomplete entry; the final ImportSectionSummary reflects that exact count. */
  accepted: number;
  rejected: number;
  limit: number;
}

export interface BackupPreflight {
  version: number;
  versionAhead: boolean;
  byteLength: number;
  credentialsPresent: CredentialField[];
  warnings: BackupWarning[];
  excludedStores: readonly ExcludedStore[];
  sections: Record<SectionName, SectionPreflight>;
}

export interface ImportSectionSummary extends SectionPreflight {
  conflicts: number;
  evictedExisting: number;
}

export interface ImportSummary {
  dashboards: number;
  memory: number;
  flashcards: number;
  studyStyle: StudyStyle;
  library: number;
  atlas: number;
  courses: number;
  settingsApplied: boolean;
  versionAhead: boolean;
  credentialsIgnored: CredentialField[];
  warnings: BackupWarning[];
  excludedStores: readonly ExcludedStore[];
  /** Store writers are intentionally non-throwing and asynchronous. The merge is immediately
   *  visible in memory, but this API cannot truthfully promise that browser storage accepted it. */
  durability: 'best-effort-unverified';
  preflight: BackupPreflight;
  sections: Record<SectionName, ImportSectionSummary>;
}

interface PreparedBackup {
  bundle: BackupBundle;
  preflight: BackupPreflight;
}

async function awaitEncryptedStores(): Promise<void> {
  await Promise.all([
    whenDashboardsHydrated(),
    whenMemoryHydrated(),
    whenLibraryHydrated(),
    whenAtlasHydrated(),
  ]);
}

/** Snapshot the current decrypted state after every encrypted store has finished its initial read. */
export async function buildBackup(): Promise<BackupBundle> {
  await awaitEncryptedStores();
  const courses = getCourses();
  return {
    app: 'mavea',
    kind: 'backup',
    version: CURRENT_VERSION,
    exportedAt: Date.now(),
    data: {
      dashboards: getDashboards(),
      memory: getMemoryNodes(),
      flashcards: getAllCards(),
      study: getStudyPrefs(),
      library: getLibrary(),
      atlas: getAtlas(),
      courses: {
        courses,
        progress: Object.fromEntries(courses.map((course) => [course.id, getProgress(course.id)])),
      },
      settings: JSON.parse(exportConfig()) as Record<string, unknown>,
    },
  };
}

export async function downloadBackup(): Promise<void> {
  const json = JSON.stringify(await buildBackup());
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mavea-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function byteLength(value: string): number {
  return typeof TextEncoder === 'function'
    ? new TextEncoder().encode(value).byteLength
    : value.length * 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertAggregateBounds(value: unknown): void {
  let values = 0;
  const walk = (current: unknown, depth: number): void => {
    values += 1;
    if (values > MAX_TOTAL_VALUES || depth > MAX_DEPTH) {
      throw new Error('That backup is too complex to import safely.');
    }
    if (typeof current === 'string' && current.length > MAX_STRING_LENGTH) {
      throw new Error('That backup contains an oversized text field.');
    }
    if (Array.isArray(current)) {
      for (const item of current) walk(item, depth + 1);
      return;
    }
    if (isRecord(current)) {
      const entries = Object.entries(current);
      if (entries.length > MAX_OBJECT_KEYS) {
        throw new Error('That backup contains an oversized object.');
      }
      for (const [key, child] of entries) {
        if (key.length > 256) throw new Error('That backup contains an oversized field name.');
        walk(child, depth + 1);
      }
    }
  };
  walk(value, 0);
}

function entryWithinBounds(value: unknown, maxBytes: number): boolean {
  try {
    return isRecord(value) && byteLength(JSON.stringify(value)) <= maxBytes;
  } catch {
    return false;
  }
}

function boundedEntries(
  value: unknown,
  section: SectionName,
): { incoming: number; entries: Record<string, unknown>[]; rejected: number } {
  const raw = Array.isArray(value) ? value : [];
  const { count, entryBytes } = SECTION_LIMITS[section];
  const entries = raw
    .slice(0, count)
    .filter((entry): entry is Record<string, unknown> => entryWithinBounds(entry, entryBytes));
  return { incoming: raw.length, entries, rejected: raw.length - entries.length };
}

const ALL_BLOCK_TYPES = new Set([
  ...ALLOWED_BLOCK_TYPES,
  ...CATALOG_FACTS.map((fact) => fact.type),
]);

async function ensureBlockDetails(entries: readonly Record<string, unknown>[]): Promise<void> {
  const types = new Set<string>();
  const collect = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks.slice(0, MAX_BLOCKS_PER_CANVAS)) {
      if (isRecord(block) && typeof block.type === 'string') types.add(block.type);
    }
  };
  for (const entry of entries) {
    if (isRecord(entry.spec)) collect(entry.spec.blocks);
    if (Array.isArray(entry.widgets)) {
      for (const widget of entry.widgets) if (isRecord(widget)) collect([widget.block]);
    }
  }
  await ensureDetails(types);
}

function validateBlocks(raw: unknown, title: string): ReturnType<typeof validateLiveResponse> {
  if (!Array.isArray(raw) || raw.length > MAX_BLOCKS_PER_CANVAS) return null;
  return validateLiveResponse(
    { title: title || 'Imported canvas', blocks: raw },
    ALL_BLOCK_TYPES,
    MAX_BLOCKS_PER_CANVAS,
    true,
  );
}

function safeSpec(raw: Record<string, unknown>): ConversationSpec | null {
  if (!Array.isArray(raw.blocks) || raw.blocks.length > MAX_BLOCKS_PER_CANVAS) return null;
  const validated = validateLiveResponse(
    {
      title: raw.title,
      sub: raw.sub,
      narration: raw.opener,
      topic: raw.topic,
      blocks: raw.blocks,
      sources: raw.sources,
      bend: raw.bend,
      blanks: raw.blanks,
      track: raw.track,
    },
    ALL_BLOCK_TYPES,
    MAX_BLOCKS_PER_CANVAS,
    true,
  );
  if (!validated) return null;
  return {
    id: 'live',
    workspace: 'Live',
    title: validated.title,
    sub: validated.sub,
    opener: validated.narration,
    context: [],
    blocks: validated.blocks,
    proof: null,
    ...(validated.topic ? { topic: validated.topic } : {}),
    ...(validated.track ? { track: validated.track } : {}),
    ...(validated.bend ? { bend: validated.bend } : {}),
    ...(validated.blanks?.length ? { blanks: validated.blanks, awaiting: true } : {}),
    ...(validated.sources?.length ? { sources: validated.sources } : {}),
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

async function sanitizeLibrary(
  entries: readonly Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  await ensureBlockDetails(entries);
  const safe: Record<string, unknown>[] = [];
  for (const entry of entries) {
    if (!isRecord(entry.spec)) continue;
    const spec = safeSpec(entry.spec);
    if (spec) safe.push({ ...entry, spec });
  }
  return safe;
}

async function sanitizeDashboards(
  entries: readonly Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  await ensureBlockDetails(entries);
  return entries.map((entry) => {
    if (!Array.isArray(entry.widgets)) return entry;
    const widgets: Record<string, unknown>[] = [];
    for (const value of entry.widgets.slice(0, 12)) {
      if (!isRecord(value)) continue;
      const validated = validateBlocks([value.block], 'Imported dashboard widget');
      const block = validated?.blocks[0];
      if (!block) continue;
      widgets.push({
        id: typeof value.id === 'string' ? value.id : '',
        block,
        span: value.span === 2 || value.span === 3 ? value.span : 1,
        fromSource: typeof value.fromSource === 'string' ? value.fromSource : '',
        ...(typeof value.metricId === 'string' ? { metricId: value.metricId } : {}),
        ...(typeof value.refreshQuery === 'string' ? { refreshQuery: value.refreshQuery } : {}),
      });
    }
    return { ...entry, widgets };
  });
}

function credentialsIn(settings: unknown): CredentialField[] {
  if (!isRecord(settings)) return [];
  const found: CredentialField[] = [];
  const carriesValue = (value: unknown): boolean => {
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isRecord(value)) return Object.keys(value).length > 0;
    return value !== undefined && value !== null;
  };
  if (Object.prototype.hasOwnProperty.call(settings, 'keys') && carriesValue(settings.keys)) {
    found.push('provider-api-keys');
  }
  if (
    Object.prototype.hasOwnProperty.call(settings, 'searchKeys') &&
    carriesValue(settings.searchKeys)
  ) {
    found.push('search-api-keys');
  }
  if (
    ['githubToken', 'github_token', 'ghToken'].some(
      (key) => Object.prototype.hasOwnProperty.call(settings, key) && carriesValue(settings[key]),
    )
  ) {
    found.push('github-token');
  }
  return found;
}

function sectionPreflight(
  section: SectionName,
  incoming: number,
  accepted: number,
): SectionPreflight {
  return {
    incoming,
    accepted,
    rejected: incoming - accepted,
    limit: SECTION_LIMITS[section].count,
  };
}

async function prepareBackup(json: string): Promise<PreparedBackup> {
  const size = byteLength(json);
  if (size > MAX_BACKUP_BYTES) throw new Error('That file is too large to be a Mavéa backup.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This file isn’t valid JSON — it may be corrupted or not a Mavéa backup.');
  }
  assertAggregateBounds(parsed);
  if (!isRecord(parsed)) throw new Error('This file isn’t a Mavéa backup.');
  if (
    parsed.app !== 'mavea' ||
    parsed.kind !== 'backup' ||
    typeof parsed.version !== 'number' ||
    !Number.isSafeInteger(parsed.version) ||
    parsed.version < 1 ||
    !isRecord(parsed.data)
  ) {
    throw new Error('This file isn’t a Mavéa backup.');
  }

  const data = parsed.data;
  const dashboardsRaw = boundedEntries(data.dashboards, 'dashboards');
  const memory = boundedEntries(data.memory, 'memory');
  const flashcards = boundedEntries(data.flashcards, 'flashcards');
  const libraryRaw = boundedEntries(data.library, 'library');
  const atlas = boundedEntries(data.atlas, 'atlas');
  const courseData = isRecord(data.courses) ? data.courses : {};
  const courses = boundedEntries(courseData.courses, 'courses');
  const [dashboards, library] = await Promise.all([
    sanitizeDashboards(dashboardsRaw.entries),
    sanitizeLibrary(libraryRaw.entries),
  ]);
  const progress: Record<string, unknown> = {};
  if (isRecord(courseData.progress)) {
    const acceptedCourseIds = new Set(
      courses.entries.flatMap((course) =>
        typeof course.id === 'string' && course.id ? [course.id] : [],
      ),
    );
    for (const [id, value] of Object.entries(courseData.progress)) {
      if (acceptedCourseIds.has(id) && entryWithinBounds(value, 150_000)) progress[id] = value;
    }
  }

  const bundle: BackupBundle = {
    app: 'mavea',
    kind: 'backup',
    version: parsed.version,
    exportedAt:
      typeof parsed.exportedAt === 'number' && Number.isFinite(parsed.exportedAt)
        ? parsed.exportedAt
        : 0,
    data: {
      dashboards,
      memory: memory.entries,
      flashcards: flashcards.entries,
      study: data.study,
      library,
      atlas: atlas.entries,
      courses: { courses: courses.entries, progress },
      ...(isRecord(data.settings) ? { settings: data.settings } : {}),
    },
  };

  const sections: Record<SectionName, SectionPreflight> = {
    dashboards: sectionPreflight('dashboards', dashboardsRaw.incoming, dashboards.length),
    memory: sectionPreflight('memory', memory.incoming, memory.entries.length),
    flashcards: sectionPreflight('flashcards', flashcards.incoming, flashcards.entries.length),
    library: sectionPreflight('library', libraryRaw.incoming, library.length),
    atlas: sectionPreflight('atlas', atlas.incoming, atlas.entries.length),
    courses: sectionPreflight('courses', courses.incoming, courses.entries.length),
  };
  const credentialsPresent = credentialsIn(data.settings);
  const versionAhead = parsed.version > CURRENT_VERSION;
  const warnings = new Set<BackupWarning>([
    'durability-unverified',
    'import-may-evict-existing',
    'stores-excluded',
  ]);
  if (credentialsPresent.length) warnings.add('credentials-ignored');
  if (versionAhead) warnings.add('future-version');
  if (Object.values(sections).some((section) => section.rejected > 0)) {
    warnings.add('entries-rejected');
  }
  return {
    bundle,
    preflight: {
      version: parsed.version,
      versionAhead,
      byteLength: size,
      credentialsPresent,
      warnings: [...warnings],
      excludedStores: EXCLUDED_STORES,
      sections,
    },
  };
}

export async function preflightBackup(json: string): Promise<BackupPreflight> {
  return (await prepareBackup(json)).preflight;
}

function ids(items: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    if (isRecord(item) && typeof item.id === 'string' && item.id) out.add(item.id);
  }
  return out;
}

function sectionResult(
  preflight: SectionPreflight,
  accepted: number,
  incomingItems: readonly unknown[],
  before: readonly unknown[],
  after: readonly unknown[],
): ImportSectionSummary {
  const incomingIds = ids(incomingItems);
  const beforeIds = ids(before);
  const afterIds = ids(after);
  let conflicts = 0;
  let evictedExisting = 0;
  for (const id of incomingIds) if (beforeIds.has(id)) conflicts += 1;
  for (const id of beforeIds) if (!afterIds.has(id)) evictedExisting += 1;
  return {
    ...preflight,
    accepted,
    rejected: preflight.incoming - accepted,
    conflicts,
    evictedExisting,
  };
}

/** Merge a bounded backup after encrypted hydration. The returned counts describe in-memory state;
 *  `durability` remains explicit because owning stores intentionally swallow quota/private-mode
 *  failures to keep the running app usable. */
export async function importBackup(json: string): Promise<ImportSummary> {
  const [{ bundle, preflight }] = await Promise.all([prepareBackup(json), awaitEncryptedStores()]);
  const { data } = bundle;
  const before = {
    dashboards: getDashboards(),
    memory: getMemoryNodes(),
    flashcards: getAllCards(),
    library: getLibrary(),
    atlas: getAtlas(),
    courses: getCourses(),
  };

  const dashboards = mergeDashboards(data.dashboards ?? []);
  const memory = importMemoryNodes(data.memory ?? []);
  const flashcards = importCards(data.flashcards ?? []);
  const studyStyle = importStudyPrefs(data.study);
  const library = importLibrary(data.library ?? []);
  const atlas = importAtlas(data.atlas ?? []);
  const courses = data.courses ? importCourses(data.courses.courses, data.courses.progress) : 0;

  let settingsApplied = false;
  let credentialsIgnored = [...preflight.credentialsPresent];
  if (data.settings) {
    const settings = importConfigWithSummary(JSON.stringify(data.settings), {
      mode: 'merge',
      preserveSecretState: true,
    });
    settingsApplied = settings.appliedFields.length > 0;
    credentialsIgnored = [...new Set([...credentialsIgnored, ...settings.credentialsIgnored])];
  }

  const after = {
    dashboards: getDashboards(),
    memory: getMemoryNodes(),
    flashcards: getAllCards(),
    library: getLibrary(),
    atlas: getAtlas(),
    courses: getCourses(),
  };
  const sections: Record<SectionName, ImportSectionSummary> = {
    dashboards: sectionResult(
      preflight.sections.dashboards,
      dashboards,
      data.dashboards ?? [],
      before.dashboards,
      after.dashboards,
    ),
    memory: sectionResult(
      preflight.sections.memory,
      memory,
      data.memory ?? [],
      before.memory,
      after.memory,
    ),
    flashcards: sectionResult(
      preflight.sections.flashcards,
      flashcards,
      data.flashcards ?? [],
      before.flashcards,
      after.flashcards,
    ),
    library: sectionResult(
      preflight.sections.library,
      library,
      data.library ?? [],
      before.library,
      after.library,
    ),
    atlas: sectionResult(
      preflight.sections.atlas,
      atlas,
      data.atlas ?? [],
      before.atlas,
      after.atlas,
    ),
    courses: sectionResult(
      preflight.sections.courses,
      courses,
      data.courses?.courses ?? [],
      before.courses,
      after.courses,
    ),
  };
  const warnings = new Set(preflight.warnings);
  if (credentialsIgnored.length) warnings.add('credentials-ignored');
  if (Object.values(sections).some((section) => section.rejected > 0)) {
    warnings.add('entries-rejected');
  }
  if (Object.values(sections).some((section) => section.evictedExisting > 0)) {
    warnings.add('import-may-evict-existing');
  }

  return {
    dashboards,
    memory,
    flashcards,
    studyStyle,
    library,
    atlas,
    courses,
    settingsApplied,
    versionAhead: preflight.versionAhead,
    credentialsIgnored,
    warnings: [...warnings],
    excludedStores: EXCLUDED_STORES,
    durability: 'best-effort-unverified',
    preflight,
    sections,
  };
}
