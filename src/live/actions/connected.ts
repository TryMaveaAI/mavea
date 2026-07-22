// connected.ts — an inert seam kept only so the turn builder still compiles.
//
// The "Connect apps" write-actions feature was removed (see catalog.ts). There is no longer
// anything to connect, so this always reports an empty set — Live proposes no actions and the
// prompt never mentions one. Kept because the turn builder still imports it; it can be deleted
// with the rest of the seam once that removal lands. Ripple's GitHub reading is unrelated and
// lives entirely in src/live/ripple/ingest/githubBrowser.ts.

/** No MCP integrations are connectable — the actions feature was removed. */
export function getConnectedMcps(): Set<string> {
  return new Set();
}
