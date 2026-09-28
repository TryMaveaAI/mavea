// The codebase's single notion of "an overlay is holding the user's attention". Watch Me
// Think layers Share / Present / the palette on top of a settled map, and Escape there must
// close only the top overlay — never tear down the curated map underneath (data loss). Kept
// as a single predicate (with its own shape) so the Escape handling and its effect deps
// can't drift apart and silently re-open this.

/** The full set of overlays/modes that count as "holding attention" above the canvas. */
export interface AttentionOverlays {
  paletteOpen: boolean;
  shareOpen: boolean;
  exportOpen: boolean;
  dashOpen: boolean;
  showSettings: boolean;
  proofOpen: boolean;
  showHow: boolean;
  replayAt: number | null;
  recapOpen: boolean;
  atlasOpen: boolean;
  delegateOpen: boolean;
  srsOpen: boolean;
  zoomLevel: unknown;
  mindViewOpen: boolean;
  /** A card open on the Lens stage — a modal sheet like the rest, so a replay's banner and
   *  transport must yield to it rather than paint over its toolbar and strip. */
  lensOpen: boolean;
}

export function anyOverlayOpen(o: AttentionOverlays): boolean {
  return (
    o.paletteOpen ||
    o.shareOpen ||
    o.exportOpen ||
    o.dashOpen ||
    o.showSettings ||
    o.proofOpen ||
    o.showHow ||
    o.replayAt !== null ||
    o.recapOpen ||
    o.atlasOpen ||
    o.delegateOpen ||
    o.srsOpen ||
    o.zoomLevel !== null ||
    o.mindViewOpen ||
    o.lensOpen
  );
}
