// backup.ts — one user-initiated file that carries a whole Mavéa install between browsers.
//
// WHY THIS EXISTS: every store persists AES-GCM ciphertext under a NON-EXTRACTABLE key pinned to one
// origin's IndexedDB (keyVault.ts). Copying localStorage to incognito / another port / another
// machine carries ciphertext whose key doesn't exist there, so every store silently decrypts to
// empty. The only correct backup is DECRYPTED JSON of the in-memory state each store already holds,
// re-imported through each store's own merge helper — which re-encrypts on the destination origin.
//
// This module statically imports every store, so it is loaded LAZILY (LiveSettings imports it inside
// the export/import click handlers) to keep those stores out of the settings chunk.
//
// SECURITY: API keys are NEVER included. exportConfig() already strips them; on import we additionally
// delete keys/searchKeys from the settings section and importConfig forces rememberKey:false, so no
// import path can ever persist a credential. Every imported item is coerced by its owning store, so a
// hand-edited or hostile file yields dropped items, never a crash.
//
// HYDRATION: the encrypted stores decrypt asynchronously at module load. By the time a user opens the
// "Your data" tab and clicks Export, hydration has long since resolved and the getters return full
// state; a pathological cold-load-then-instant-export could under-capture, which is acceptable for a
// deliberate, buried action.
import { getDashboards, mergeDashboards } from '../dashboards/store';
import { getMemoryNodes, importMemoryNodes } from '../memory/store';
import { getAllCards, getStudyPrefs, importCards, importStudyPrefs } from '../srs/store';
import type { StudyStyle } from '../srs/store';
import { getLibrary, importLibrary } from '../library/store';
import { getAtlas, importAtlas } from '../atlas/store';
import { getCourses, getProgress, importCourses } from '../course/store';
import { exportConfig, importConfig } from '../useLiveConfig';

/** Bumped when the bundle shape changes. A future importer stays lenient: it reads the sections it
 *  knows and lets each store's coerce drop anything unfamiliar, so a newer file still imports what it
 *  can (with `versionAhead` flagged), and an older file fills missing sections with nothing. */
export const CURRENT_VERSION = 1;

/** Largest backup string we'll parse — a full install is a few MB; this stops a memory-bomb file. */
export const MAX_BACKUP_BYTES = 25_000_000;

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

export interface ImportSummary {
  dashboards: number;
  memory: number;
  flashcards: number;
  /** The style flashcards are in after the import — consent-bearing, so it's reported, not silent. */
  studyStyle: StudyStyle;
  library: number;
  atlas: number;
  courses: number;
  settingsApplied: boolean;
  versionAhead: boolean;
}

/** Snapshot the current DECRYPTED state of every grieve-losing store into one bundle. */
export function buildBackup(): BackupBundle {
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
        progress: Object.fromEntries(courses.map((c) => [c.id, getProgress(c.id)])),
      },
      // exportConfig() already strips keys/searchKeys and forces rememberKey:false.
      settings: JSON.parse(exportConfig()) as Record<string, unknown>,
    },
  };
}

/** Build the bundle and download it as `mavea-backup-YYYY-MM-DD.json`. Reuses the same
 *  Blob → object-URL → anchor sequence LiveSettings uses for the settings-only export. */
export function downloadBackup(): void {
  const json = JSON.stringify(buildBackup());
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `mavea-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Parse, validate, and MERGE an imported backup. Never deletes existing data (each store upserts by
 *  id). Throws one friendly Error for a fatal problem (unparseable, oversized, or not a Mavéa backup);
 *  per-section problems are absorbed by the stores' coerce guards and simply count fewer items. */
export function importBackup(json: string): ImportSummary {
  if (json.length > MAX_BACKUP_BYTES) {
    throw new Error('That file is too large to be a Mavéa backup.');
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(json);
  } catch {
    throw new Error('This file isn’t valid JSON — it may be corrupted or not a Mavéa backup.');
  }
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('This file isn’t a Mavéa backup.');
  }
  const b = bundle as Partial<BackupBundle>;
  if (b.app !== 'mavea' || b.kind !== 'backup' || typeof b.version !== 'number' || !b.data) {
    throw new Error('This file isn’t a Mavéa backup.');
  }
  const data = b.data;

  const summary: ImportSummary = {
    dashboards: mergeDashboards(asArray(data.dashboards)),
    memory: importMemoryNodes(asArray(data.memory)),
    flashcards: importCards(asArray(data.flashcards)),
    // After importCards, so the style derivation sees the merged collection.
    studyStyle: importStudyPrefs(data.study),
    library: importLibrary(asArray(data.library)),
    atlas: importAtlas(asArray(data.atlas)),
    courses:
      data.courses && typeof data.courses === 'object'
        ? importCourses(data.courses.courses, data.courses.progress)
        : 0,
    settingsApplied: false,
    versionAhead: b.version > CURRENT_VERSION,
  };

  if (data.settings && typeof data.settings === 'object') {
    // Belt-and-suspenders: strip any credentials a hand-edited file might carry BEFORE importConfig,
    // which itself also forces rememberKey:false so nothing could persist even if it slipped through.
    const settings = { ...data.settings, keys: {}, searchKeys: {}, rememberKey: false };
    importConfig(JSON.stringify(settings));
    summary.settingsApplied = true;
  }

  return summary;
}
