// Types for the dependency-free gateway connector core, so the app's tests get real
// checking when they import it. The gateway itself stays plain ESM with no build step.

/** The outcome of running one connector — mirrors what the HTTP layer sends back. */
export interface ConnectorResult {
  ok: boolean;
  /** HTTP status to return (200 ok, 4xx bad input / unconfigured, 5xx upstream). */
  status: number;
  /** A short line for the confirm card — what happened, or what to fix. */
  detail: string;
  /** Read-only data a connector returns (e.g. Ripple's fetched PR diff). Write actions omit it. */
  payload?: unknown;
}

/** The action ids this gateway can run (the proxy routes the app POSTs to). */
export const SUPPORTED_ACTIONS: string[];

/**
 * Run a confirmed action. Pure and never throws: pass the env holding the credentials and a
 * fetch implementation (both default to the process global / runtime `fetch`).
 */
export function runConnector(
  id: string,
  args: Record<string, unknown> | undefined,
  env?: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): Promise<ConnectorResult>;
