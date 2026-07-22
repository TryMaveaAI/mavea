// run.ts — execute a CONFIRMED action through the same-origin `/actions` proxy.
//
// This is the only place an action actually fires, and only after the user has confirmed
// it on the card. The browser never holds credentials or speaks MCP directly: it POSTs to
// `/actions/<id>`, an mcpo-style gateway the deployment wires up (the same pattern as the
// existing `/tts` and `/llm/*` proxies), which owns OAuth and forwards to the MCP
// server. Never throws — a missing connector or a failed call resolves to an honest
// result the surface can show.
import { fetchWithTimeout } from '../providers/http';
import { actionSpec } from './catalog';

export interface ActionResult {
  ok: boolean;
  /** A short line to show the user — what happened, or why it didn't. */
  detail: string;
}

const ACTION_TIMEOUT_MS = 15_000;
const CONFIRMATION_TIMEOUT_MS = 5_000;

/**
 * Run a confirmed action. Validates the action exists and its required params are present
 * (defense-in-depth; the confirm card already gathered them), then posts to the proxy.
 */
export async function runAction(id: string, args: Record<string, string>): Promise<ActionResult> {
  const spec = actionSpec(id);
  if (!spec) return { ok: false, detail: `Unknown action: ${id}` };

  for (const p of spec.params) {
    if (p.required && !(args[p.name] ?? '').trim()) {
      return { ok: false, detail: `Missing required field: ${p.name}` };
    }
  }

  try {
    const body = JSON.stringify({ args });
    const confirmation = await fetchWithTimeout(
      '/actions/confirm',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, args }),
      },
      CONFIRMATION_TIMEOUT_MS,
    );
    const confirmationData = (await confirmation.json().catch(() => ({}))) as {
      detail?: string;
      confirmationToken?: string;
    };
    if (!confirmation.ok || !confirmationData.confirmationToken) {
      return {
        ok: false,
        detail: confirmationData.detail || 'The action confirmation expired. Please try again.',
      };
    }

    const res = await fetchWithTimeout(
      `/actions/${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-action-confirmation': confirmationData.confirmationToken,
        },
        body,
      },
      ACTION_TIMEOUT_MS,
    );
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    if (!res.ok) {
      // Prefer the gateway's own explanation ("GitHub isn't set up here — add …") over a
      // bare status, so the card tells the user exactly what to fix.
      return {
        ok: false,
        detail: data.detail || `The ${spec.mcp} action didn't go through (${res.status}).`,
      };
    }
    return { ok: true, detail: data.detail || `${spec.label} — done.` };
  } catch {
    return {
      ok: false,
      detail: `Couldn't reach the ${spec.mcp} connector — is it set up in this deployment?`,
    };
  }
}
