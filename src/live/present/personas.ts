// Presentation styles for Present mode — unified with the export deck so what you present is what
// you export. The set of styles is exactly the ten slide skins; PresentationDeck renders the live
// answer through the shared SlideStage in the chosen skin. The persisted choice survives reloads.
// Import the skin data straight from its registry, NOT the slides barrel — the barrel re-exports
// the deck composer, which reaches the export pipeline and the ~580-entry catalog, pinning it into
// the eager Live-mount chunk. The registry (+ its types) is catalog-free.
import { SLIDE_SKIN_ORDER, SLIDE_SKINS } from '../../slides/skins/registry';
import type { SlideSkinId } from '../../slides/skins/types';

export type PersonaId = SlideSkinId;

export interface PersonaDef {
  id: PersonaId;
  label: string;
  description: string;
  /** Accent colour shown in the picker swatch. */
  accent: string;
}

export const PERSONAS: readonly PersonaDef[] = SLIDE_SKIN_ORDER.map((id) => {
  const s = SLIDE_SKINS[id];
  return {
    id,
    label: s.label,
    // The blurb already opens with the archetype ("Editorial — Warm editorial — …"), and the row
    // ellipsizes at ~240px, so prefixing it cut away the part that tells the styles apart.
    description: s.blurb,
    accent: s.tokens.accent,
  };
});

// Bumped key: the previous persona ids (boardroom/pitch/…) are not valid skin ids.
const PERSONA_KEY = 'mavea-preso-style';

function isPersonaId(v: unknown): v is PersonaId {
  return PERSONAS.some((p) => p.id === v);
}

export function readPersona(): PersonaId {
  try {
    const v = localStorage.getItem(PERSONA_KEY);
    return isPersonaId(v) ? v : 'folio';
  } catch {
    return 'folio';
  }
}

export function persistPersona(id: PersonaId): void {
  try {
    localStorage.setItem(PERSONA_KEY, id);
  } catch {
    // private mode — choice doesn't survive reload
  }
}
