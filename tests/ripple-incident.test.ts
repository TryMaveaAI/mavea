// ripple-incident.test.ts — Ripple in reverse. Guards that an alert is parsed into a symptom/
// severity/service, that the floor is honest (real owners for who-to-wake; an inferred root cause it
// admits to), that the model's reverse read merges without overwriting the parsed facts, and that
// attaching an incident never mutates a change's structure. Read-only throughout.
import { describe, it, expect } from 'vitest';
import {
  parseAlert,
  buildIncidentFloor,
  parseIncidentEnrichment,
  mergeIncident,
  attachIncident,
} from '../src/live/ripple/ingest/incident';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { SEED_SHIP } from '../src/live/ripple/seed';

describe('parseAlert', () => {
  it('pulls the symptom, a severity, and a service from a pasted alert', () => {
    const a = parseAlert('PagerDuty: [payments-api] P1 — 5xx rate 38% on /charge\nfired at 03:14');
    expect(a.symptom).toContain('payments-api');
    expect(a.severity).toBe('P1');
    expect(a.service).toBe('payments-api');
  });
  it('reads a critical/outage as P0', () => {
    expect(parseAlert('CRITICAL: auth-service outage').severity).toBe('P0');
  });
});

describe('buildIncidentFloor', () => {
  it('stays honest: no fabricated who-to-wake when GitHub gives no owner data', () => {
    const inc = buildIncidentFloor('P0 checkout down', SEED_SHIP);
    // The honest seed carries no owners (GitHub alone can't supply them), so the floor invents none.
    expect(inc.whoToWake).toEqual([]);
    expect(inc.rootCause.toLowerCase()).toContain('connect'); // inferred → admits it
    expect(inc.timeline[0]!.label).toContain('Alert received');
    expect(inc.chain).toHaveLength(0); // the floor never invents the chain
  });
  it('derives who-to-wake from a node owner when one exists', () => {
    const withOwner: typeof SEED_SHIP = {
      ...SEED_SHIP,
      hotspots: [],
      nodes: [SEED_SHIP.nodes[0]!, { ...SEED_SHIP.nodes[1]!, team: 'Auth team' }],
    };
    const inc = buildIncidentFloor('P0 checkout down', withOwner);
    expect(inc.whoToWake.length).toBeGreaterThan(0);
  });
  it('with no change attached, asks for one', () => {
    const inc = buildIncidentFloor('something broke');
    expect(inc.rootCause.toLowerCase()).toContain('attach');
  });
});

describe('parseIncidentEnrichment + mergeIncident', () => {
  it('parses the reverse read and merges it without losing the parsed symptom', () => {
    const floor = buildIncidentFloor('P0 gateway 5xx', SEED_SHIP);
    const enr = parseIncidentEnrichment(
      JSON.stringify({
        rootCause: 'deploy-order skew: auth shipped before gateway upgraded',
        chain: [{ label: 'gateway calls the old shape', context: '12m ago' }],
        rollback: ['revert the auth deploy'],
        whoToWake: [{ name: 'Edge on-call', team: 'Edge', why: 'owns gateway' }],
      }),
    );
    expect(enr).not.toBeNull();
    const merged = mergeIncident(floor, enr!);
    expect(merged.symptom).toBe(floor.symptom); // parsed fact preserved
    expect(merged.rootCause).toContain('deploy-order');
    expect(merged.chain).toHaveLength(1);
    expect(merged.rollback).toEqual(['revert the auth deploy']);
    // the floor has no owner data (honest), so the model's who-to-wake fills it in
    expect(merged.whoToWake).toEqual([{ name: 'Edge on-call', team: 'Edge', why: 'owns gateway' }]);
  });
  it('returns null for junk', () => {
    expect(parseIncidentEnrichment('no json here')).toBeNull();
    expect(parseIncidentEnrichment('{}')).toBeNull();
  });
});

describe('attachIncident', () => {
  const base = buildShipFromDiff(
    parseUnifiedDiff('diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n'),
    'acme/widget #5',
  );

  it('attaches an incident to a change without touching its structure', () => {
    const m = attachIncident('P0 down', base);
    expect(m.incident).toBeTruthy();
    expect(m.changes).toBe(base.changes); // structure untouched
    expect(m.nodes).toBe(base.nodes);
  });
  it('builds a standalone incident model when no change is attached', () => {
    const m = attachIncident('P1 errors spiking');
    expect(m.incident?.symptom).toContain('errors spiking');
    expect(m.changes).toHaveLength(0);
  });
});
