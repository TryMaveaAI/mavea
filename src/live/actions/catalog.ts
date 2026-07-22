// catalog.ts — the (now empty) menu of side-effecting actions Mavéa could PROPOSE.
//
// The "Connect apps" write-actions feature — add a calendar event, draft an email, post to
// Slack, open a PR — was removed: the integrations we could actually honor end to end were
// too few to justify the surface (a Slack webhook posts to one fixed channel, Gmail needs a
// restricted scope most self-hosted deployments can't get verified), and a half-true action
// is worse than none. With no actions here, Live never proposes one and `actionsMenu` stays
// empty, so nothing downstream changes behavior.
//
// This is NOT the path Ripple uses to read GitHub — that's a direct, read-only api.github.com
// client in the browser (src/live/ripple/ingest/githubBrowser.ts), untouched by this removal.
//
// The types and helpers below are kept as an inert seam: `actionsMenu`/`getConnectedMcps`
// are still imported by the turn builder, and the generic "action" block primitive still
// renders, so nothing has to change at once. See the removal TODO in the session plan for
// the final excision (deleting the seam once the concurrent turn-builder work lands).

/** One parameter the model must supply for an action. */
export interface ActionParam {
  name: string;
  /** A coarse type, only to guide the model + a light client-side check. */
  type: 'string' | 'date' | 'time' | 'duration' | 'email';
  required: boolean;
  desc: string;
}

/** One proposable action, backed by an MCP server reached through the `/actions` proxy. */
export interface ActionSpec {
  /** Stable id, also the proxy route: POST /actions/<id>. */
  id: string;
  /** The MCP server / integration this belongs to (gates by what the user connected). */
  mcp: string;
  /** Human label for the confirm card's CTA. */
  label: string;
  /** One line the prompt shows so the model knows when to offer it. */
  desc: string;
  params: ActionParam[];
  /** The verb shown on the confirm button. */
  cta: string;
}

/** No proposable actions ship today — the write-actions feature was removed. */
export const ACTIONS: readonly ActionSpec[] = [];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionSpec(id: string): ActionSpec | undefined {
  return BY_ID.get(id);
}

/** The actions a user has connected (by MCP id). Drives both the prompt menu and the
 *  validator — an action whose MCP isn't connected is never offered or run. */
export function enabledActions(connected: ReadonlySet<string>): ActionSpec[] {
  return ACTIONS.filter((a) => connected.has(a.mcp));
}

/**
 * The prompt menu of currently-connected actions, appended to the system prompt so the
 * model can PROPOSE one when it genuinely helps. Returns '' when nothing is connected, so
 * the model is never tempted to offer an action the user can't run.
 */
export function actionsMenu(connected: ReadonlySet<string>): string {
  const available = enabledActions(connected);
  if (available.length === 0) return '';
  const lines = available.map((a) => {
    const params = a.params.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ');
    return `- ${a.id}: ${a.desc} (params: ${params})`;
  });
  return [
    'When the answer naturally leads to a concrete next step the user can DO, you may add ONE',
    '"action" block: {"type":"action","props":{"id": <one of the ids below>, "label"?: string,',
    '"args": { …the params… }}}. Offer it only when it genuinely helps — the user always confirms',
    'before anything happens. Available actions:',
    ...lines,
  ].join('\n');
}
