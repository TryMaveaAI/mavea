// tracked.ts — a small, local store of changes you've chosen to keep an eye on. Tracking a change
// snapshots its grounded ShipModel to localStorage so you can reopen it later (and, for a GitHub
// source, re-fetch it to see what moved). Device-local only — nothing leaves the browser, and it
// stays strictly read-only: a tracked item is a saved analysis, never a write back to anything.
import type { ShipModel } from './model';

export interface TrackedItem {
  id: string;
  /** What it is, e.g. "acme/widget #4821" or the repo name. */
  label: string;
  /** When it was tracked (epoch ms). */
  savedAt: number;
  /** How to re-fetch it later, when the source supports it. */
  source: ShipModel['provenance']['source'];
  /** The grounded snapshot to reopen. */
  model: ShipModel;
}

const KEY = 'mavea.ripple.tracked.v1';
const MAX = 20;

function read(): TrackedItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as TrackedItem[]).filter((t) => t && t.id && t.model)
      : [];
  } catch {
    return [];
  }
}

function write(items: TrackedItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* quota / disabled storage — tracking is best-effort, never fatal */
  }
}

export function listTracked(): TrackedItem[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/** Track a model, stamping the save time (passed in — `Date.now()` is avoided in pure modules and
 *  is fine here, but the caller may supply one for determinism). De-dupes by label, newest wins. */
export function trackModel(model: ShipModel, savedAt: number = Date.now()): TrackedItem {
  // The repo alone is not an identity — two PRs on one repo would de-dupe onto a single row, and
  // the number is the half a reader recognises.
  const named = [model.pr.repo, model.pr.number].filter(Boolean).join(' ');
  const label = named || model.pr.title || 'change';
  const item: TrackedItem = {
    id: `${label}::${savedAt}`,
    label,
    savedAt,
    source: model.provenance.source,
    model,
  };
  const rest = read().filter((t) => t.label !== label);
  write([item, ...rest]);
  return item;
}

export function untrack(id: string): void {
  write(read().filter((t) => t.id !== id));
}
