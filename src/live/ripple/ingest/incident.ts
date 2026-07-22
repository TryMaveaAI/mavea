// incident.ts — Ripple in reverse. Given a live symptom (a paged alert, an error, a log line) and,
// optionally, the change that's under suspicion, trace BACK to the likely cause: the chain from the
// page to the root, the rollback to copy, and who to wake. The floor is deterministic (it parses the
// alert + pulls who-to-wake from a change's known owners); a model fills the reverse chain + cause +
// rollback, drawn from the alert and the change. STRICTLY READ-ONLY — the rollback is a draft to run
// yourself; Ripple never executes, reverts, or pages anyone.
import type { Severity, ShipIncident, ShipModel } from '../model';

/** Pull the load-bearing facts out of a pasted alert: the symptom line, a severity, a named service. */
export function parseAlert(text: string): {
  symptom: string;
  severity?: Severity;
  service?: string;
} {
  const clean = text.trim();
  const firstLine =
    clean
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim() ?? clean;
  const symptom = firstLine.length > 160 ? firstLine.slice(0, 160) + '…' : firstLine;

  let severity: Severity | undefined;
  if (/\b(p0|sev[\s-]?0|sev[\s-]?1|critical|fatal|outage|down)\b/i.test(clean)) severity = 'P0';
  else if (/\b(p1|sev[\s-]?2|high|error|5\d\d)\b/i.test(clean)) severity = 'P1';
  else if (/\b(p2|warn|degraded)\b/i.test(clean)) severity = 'P2';

  // A service-ish token: "service: foo", "[foo]", or a foo-service / foo-api name.
  const m =
    /(?:service|svc|app)[:=]\s*([a-z0-9._-]+)/i.exec(clean) ||
    /\b([a-z0-9-]+(?:-service|-api|-app|-svc))\b/i.exec(clean) ||
    /\[([a-z0-9._-]+)\]/i.exec(clean);
  const service = m?.[1];

  return { symptom, severity, ...(service ? { service } : {}) };
}

/** The deterministic incident floor: what we can say from the alert alone (+ a change's known owners
 *  if one is attached). The reverse chain, root cause, and rollback are left for the model to fill —
 *  honestly marked as inferred until connected deploys/traces confirm them. */
export function buildIncidentFloor(alertText: string, base?: ShipModel): ShipIncident {
  const a = parseAlert(alertText);
  // Who already holds the context: a change's hotspot owners, else its area teams.
  const fromHotspots = (base?.hotspots ?? [])
    .filter((h) => h.ask)
    .map((h) => ({ name: h.ask!.name, team: h.ask!.team, why: h.ask!.why }));
  const fromTeams = (base?.nodes ?? [])
    .filter((n) => n.team && n.type !== 'pr')
    .slice(0, 3)
    .map((n) => ({ name: n.team!, team: n.label, why: `owns ${n.label}` }));
  const whoToWake = fromHotspots.length ? fromHotspots.slice(0, 3) : fromTeams;

  return {
    symptom: a.symptom,
    ...(a.severity ? { severity: a.severity } : {}),
    ...(a.service ? { service: a.service } : {}),
    chain: [],
    rootCause: base
      ? 'Ripple will trace this back through the attached change — connect deploys and traces to confirm the exact cause.'
      : 'Attach the suspect change (paste its diff or load the PR) so Ripple can trace the symptom back to a line.',
    rollback: [],
    whoToWake,
    timeline: [{ time: 'now', label: `Alert received — ${a.symptom}` }],
    evidence: base
      ? 'Grounded in the attached change; the link to this symptom is Ripple’s read until deploys/traces are connected.'
      : 'From the alert text alone. Connect a change, deploys, or traces to trace the cause.',
  };
}

/** Validate a model's reverse-incident enrichment into the parts we let it fill. Returns null if
 *  nothing usable parsed (the floor then stands). */
export function parseIncidentEnrichment(raw: string | object): Partial<ShipIncident> | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      obj = JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const chain = Array.isArray(o.chain)
    ? o.chain
        .map((h) => {
          const hh = h as Record<string, unknown>;
          return { label: str(hh.label), context: str(hh.context) };
        })
        .filter((h) => h.label.length > 0)
    : undefined;
  const rollback = Array.isArray(o.rollback)
    ? o.rollback.map(str).filter((s) => s.length > 0)
    : undefined;
  const whoToWake = Array.isArray(o.whoToWake)
    ? o.whoToWake
        .map((w) => {
          const ww = w as Record<string, unknown>;
          return { name: str(ww.name), team: str(ww.team), why: str(ww.why) };
        })
        .filter((w) => w.name.length > 0)
    : undefined;
  const rootCause = str(o.rootCause) || undefined;

  if (!chain?.length && !rollback?.length && !whoToWake?.length && !rootCause) return null;
  return {
    ...(rootCause ? { rootCause } : {}),
    ...(chain ? { chain } : {}),
    ...(rollback ? { rollback } : {}),
    ...(whoToWake ? { whoToWake } : {}),
  };
}

/** Merge a model's reverse read onto the floor incident — only the inferred parts, never the parsed
 *  symptom/severity. who-to-wake from the floor (real owners) wins when the model offered none. */
export function mergeIncident(floor: ShipIncident, enr: Partial<ShipIncident>): ShipIncident {
  return {
    ...floor,
    rootCause: enr.rootCause || floor.rootCause,
    chain: enr.chain && enr.chain.length ? enr.chain : floor.chain,
    rollback: enr.rollback && enr.rollback.length ? enr.rollback : floor.rollback,
    whoToWake: floor.whoToWake.length ? floor.whoToWake : (enr.whoToWake ?? []),
  };
}

/** Build the incident prompt for the model — the reverse reasoning, grounded in the alert + change. */
export function buildIncidentPrompt(alertText: string, base?: ShipModel): string {
  const changes = (base?.changes ?? [])
    .map((c) => `- ${c.file}: ${c.title} — ${c.intent}`)
    .join('\n');
  return [
    'A production alert just fired. Working BACKWARDS from the symptom to the likely cause, return JSON:',
    '{',
    '  "chain": [ { "label": "a step from the symptom toward the cause", "context": "where/when" } ],',
    '  "rootCause": "the most likely root cause, stated honestly as your read",',
    '  "rollback": [ "a step to safely roll back — to copy and run yourself" ],',
    '  "whoToWake": [ { "name": "person/team", "team": "area", "why": "why them" } ]',
    '}',
    'Rules: reason only from the alert and the change below — do not invent services, deploys, or',
    'people you have no basis for. The rollback is a DRAFT the human runs; never phrase it as an',
    'action you take. If you are unsure of the cause, say so in rootCause.',
    '',
    'ALERT:',
    alertText.slice(0, 4000),
    '',
    base?.changes.length ? 'THE SUSPECT CHANGE:' : 'No change attached.',
    changes,
  ].join('\n');
}

/** Attach an incident (floor) to a change model, or make a standalone incident-only model. */
export function attachIncident(alertText: string, base?: ShipModel): ShipModel {
  const incident = buildIncidentFloor(alertText, base);
  if (base) {
    return {
      ...base,
      incident,
      provenance: {
        ...base.provenance,
        notes: [`Incident: ${incident.symptom}`, ...(base.provenance.notes ?? [])],
      },
    };
  }
  // Standalone: an incident with no change attached yet.
  return {
    pr: {
      repo: '',
      title: incident.symptom,
      summary: `A production alert fired: ${incident.symptom}. Attach the suspect change to trace it back.`,
      risks: incident.severity
        ? [{ level: 'breaks', text: `${incident.severity} — ${incident.symptom}` }]
        : [],
    },
    nodes: [],
    edges: [],
    changes: [],
    cascades: [],
    rollout: [],
    workTypes: [],
    hotspots: [],
    suggestions: [],
    suppressedNits: 0,
    modules: [],
    gate: {
      decision: 'watch',
      shipSafe: false,
      unackedP0: 0,
      requires: [],
      deployOrder: 'unset',
      conditions: [],
      rationale: 'An incident, not a change to ship.',
    },
    incident,
    provenance: {
      source: 'pasted-diff',
      example: false,
      notes: ['Incident from a pasted alert. Attach the suspect change to trace the cause.'],
    },
  };
}
