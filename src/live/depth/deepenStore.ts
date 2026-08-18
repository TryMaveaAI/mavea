// deepenStore.ts — which concept sections may request a "Go deeper" drawer, and with what.
//
// Drawer content is authored ON OPEN (see ./deepen), so the turn that used to author it eagerly
// instead parks what that later call needs: the ask, the model config the answer ran with, and a
// content fingerprint of each concept section it actually produced. A drawer may be requested
// only for a section whose label AND standard cards match the parked turn — content addressing,
// not a surface flag — so a baked demo, the tour, and a restored session (specs no live turn on
// this page produced) can never fire a model call: their sections match no parked turn, and a
// section that already carries drawer content never asks (SectionGroup renders it directly).
//
// Kept a dependency-free leaf (type-only imports): SectionGroup reads it synchronously at render
// time, and a value import of the turn machinery here would pin the engine into the canvas chunk
// (see tests/eager-bundle.test.ts).
import type { Block } from '../../data/conversation';
import type { ModelConfig } from '../../types/mavea';

export interface DeepenTurn {
  /** The user's ask, for the drawer prompt's framing. */
  ask: string;
  /** The config the turn ran with — the drawer extends THAT answer, on the same model. */
  cfg: ModelConfig;
  tier: 'frontier' | 'mid' | 'small';
  /** label → the content fingerprints of that section's standard (depth ≤ 1) blocks. */
  sections: Map<string, Set<string>>;
}

let parked: DeepenTurn | null = null;

/** One block's content fingerprint. Block ids are deliberately excluded: a merge turn renumbers
 *  them (settleTurn), and the `live-N` scheme also appears in every baked spec — type + title is
 *  both more stable across re-tiles and more specific to this answer's actual content. */
function fingerprint(b: Block): string {
  const title = (b.props as { title?: string }).title;
  return `${b.type}\0${typeof title === 'string' ? title : ''}`;
}

/** Standard-canvas blocks only — mirrors depthLens's partition (absent depth is 1). */
function isStandard(b: Block): boolean {
  const depth = (b as { depth?: number }).depth;
  return typeof depth !== 'number' || depth < 2;
}

/** Park the turn that just produced a sectioned answer. A turn with no section tags leaves the
 *  previous parked turn in place: its fingerprints can only ever match the very blocks it was
 *  parked for, and a merge turn may keep those on screen. */
export function rememberDeepenTurn(turn: {
  ask: string;
  cfg: ModelConfig;
  tier: 'frontier' | 'mid' | 'small';
  blocks: readonly Block[];
}): void {
  const sections = new Map<string, Set<string>>();
  for (const b of turn.blocks) {
    const raw = (b as { section?: string }).section;
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label || !isStandard(b)) continue;
    const set = sections.get(label) ?? new Set<string>();
    set.add(fingerprint(b));
    sections.set(label, set);
  }
  if (sections.size) parked = { ask: turn.ask, cfg: turn.cfg, tier: turn.tier, sections };
}

/** True when `label`'s drawer may be authored on demand: every standard card the section shows
 *  is one the parked live turn produced. Subset (not equality) on purpose — the responsive grid
 *  drops blocks that reported themselves unrenderable, and that must not orphan the drawer. */
export function deepenOffered(label: string, standard: readonly Block[]): boolean {
  const key = label.trim();
  if (!parked || !key || standard.length === 0) return false;
  const set = parked.sections.get(key);
  return !!set && standard.every((b) => set.has(fingerprint(b)));
}

/** The parked turn, for ./deepen's fetch. Null until a sectioned live turn lands. */
export function getDeepenTurn(): DeepenTurn | null {
  return parked;
}

/** Cache-key seed for one section's drawer: the label + the exact cards it deepens, so the same
 *  label under a different answer (or a re-asked question with new cards) misses cleanly.
 *  Control-char separators for the same reason expandKey's are: labels and titles are
 *  unbounded text, and a plain join would let a word drift across a boundary and collide
 *  two requests. */
export function deepenKeySeed(label: string, standard: readonly Block[]): string {
  return `${label.trim()}\0${standard.map(fingerprint).join('\u0001')}`;
}

export function __resetDeepenForTests(): void {
  parked = null;
}
