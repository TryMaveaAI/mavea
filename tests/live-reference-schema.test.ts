import { describe, expect, it } from 'vitest';

import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { STRUCTURAL_REFERENCES } from '../src/canvas/blocks/catalog/structures.generated';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { referencePropsFor } from '../src/live/select/examples';

describe('generic live component structural references', () => {
  it('covers every generic component and each required top-level prop', () => {
    const missing: string[] = [];
    for (const meta of RAW_CATALOG.filter((entry) => entry.coercer === 'generic')) {
      const reference = referencePropsFor(meta.type);
      if (!reference) {
        missing.push(`${meta.type}: no reference props`);
        continue;
      }
      for (const prop of meta.requires) {
        if (!(prop in reference)) missing.push(`${meta.type}.${prop}`);
      }
      const structural = STRUCTURAL_REFERENCES[meta.type];
      if (!structural || typeof structural !== 'object' || Array.isArray(structural)) {
        missing.push(`${meta.type}: no generated structural reference`);
        continue;
      }
      for (const prop of meta.requires) {
        if (!(prop in structural))
          missing.push(`${meta.type}.${prop}: absent from generated shape`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('enforces explicit pipe-delimited enums without treating prose examples as enums', () => {
    const taylor = structuredClone(referencePropsFor('taylorseries'))!;
    const invalidTaylor = validateLiveResponse(
      { title: 'T', blocks: [{ type: 'taylorseries', props: { ...taylor, fn: 'made-up' } }] },
      new Set(['taylorseries']),
      1,
    );
    expect(invalidTaylor?.blocks).toHaveLength(0);

    const scale = structuredClone(referencePropsFor('scalefelt'))!;
    const freeFormScale = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'scalefelt', props: { ...scale, value: '42.7 quadrillion' } }],
      },
      new Set(['scalefelt']),
      1,
    );
    const scaleProps = freeFormScale?.blocks[0]?.props as Record<string, unknown> | undefined;
    expect(scaleProps?.value).toBe('42.7 quadrillion');
  });

  // A datatable's rows are keyed by its OWN columns, not the fixture example's keys. The fixed-key
  // structural reference must not empty them (it did — every row coerced to {} — until open-record
  // props were exempted from reference projection).
  it('keeps datatable rows keyed by the model’s own columns', () => {
    const res = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'datatable',
            props: {
              title: 'Quarterly ARR bridge',
              columns: [
                { key: 'metric', label: 'Metric' },
                { key: 'value', label: 'Value', numeric: true, align: 'right' },
                { key: 'type', label: 'Type' },
              ],
              rows: [
                { metric: 'Starting ARR', value: '$4.2M', type: 'base' },
                { metric: 'New logos', value: '$0.8M', type: 'add' },
              ],
            },
          },
        ],
      },
      new Set(['datatable']),
      1,
    );
    const props = res?.blocks[0]?.props as { rows?: Array<Record<string, string>> } | undefined;
    expect(props?.rows).toHaveLength(2);
    expect(props?.rows?.[0]).toEqual({ metric: 'Starting ARR', value: '$4.2M', type: 'base' });
    expect(props?.rows?.[1]?.metric).toBe('New logos');
  });

  // The same open-record projection bug applies to NESTED dictionaries — a leaderboard row's
  // `values` keyed by its own metric keys (here revenue/winRate, absent from the fixture reference).
  it('keeps nested open-dictionary values keyed by the model’s own metrics (leaderboard)', () => {
    const res = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'leaderboard',
            props: {
              title: 'Reps this quarter',
              metrics: [
                { key: 'revenue', label: 'Revenue' },
                { key: 'winRate', label: 'Win %' },
              ],
              rows: [
                { name: 'Ada', sub: 'West', values: { revenue: 120, winRate: 62 }, move: 1 },
                { name: 'Grace', sub: 'East', values: { revenue: 95, winRate: 48 }, move: -1 },
              ],
            },
          },
        ],
      },
      new Set(['leaderboard']),
      1,
    );
    const props = res?.blocks[0]?.props as
      { rows?: Array<{ name: string; values: Record<string, number> }> } | undefined;
    expect(props?.rows).toHaveLength(2);
    expect(props?.rows?.[0]?.values).toEqual({ revenue: 120, winRate: 62 });
  });
});

describe('applied brief runtime contracts', () => {
  const validateBrief = (type: string, props: Record<string, unknown>) =>
    validateLiveResponse({ title: 'T', blocks: [{ type, props }] }, new Set([type]), 1)?.blocks;

  const cases: Array<{
    type: string;
    valid: Record<string, unknown>;
    invalid: Record<string, unknown>;
  }> = [
    {
      type: 'requirementboard',
      valid: {
        title: 'Scope',
        groups: [{ priority: 'must', items: [{ requirement: 'Works offline' }] }],
      },
      invalid: { title: 'Scope', groups: [{ priority: 'must', items: [{ owner: 'Sam' }] }] },
    },
    {
      type: 'experimentplan',
      valid: {
        title: 'Test',
        hypothesis: 'The change helps.',
        variables: [{ name: 'Variant', role: 'input' }],
        steps: ['Measure once.'],
      },
      invalid: {
        title: 'Test',
        hypothesis: 'The change helps.',
        variables: [{ name: 'Variant' }],
        steps: ['Measure once.'],
      },
    },
    {
      type: 'stakeholdermap',
      valid: {
        title: 'People',
        stakeholders: [{ name: 'Jordan', influence: 'high', interest: 'low' }],
      },
      invalid: { title: 'People', stakeholders: [{ name: 'Jordan', influence: 'high' }] },
    },
    {
      type: 'approvalflow',
      valid: {
        title: 'Approval',
        request: 'Approve the plan',
        approvers: [{ name: 'Jordan', status: 'pending' }],
      },
      invalid: {
        title: 'Approval',
        request: 'Approve the plan',
        approvers: [{ name: 'Jordan' }],
      },
    },
    {
      type: 'maintenanceplan',
      valid: { title: 'Care', assets: [{ asset: 'Filter', tasks: [{ task: 'Replace' }] }] },
      invalid: { title: 'Care', assets: [{ asset: 'Filter', tasks: [{ interval: 'Monthly' }] }] },
    },
    {
      type: 'contactdirectory',
      valid: {
        title: 'Contacts',
        entries: [{ name: 'Jordan', methods: [{ label: 'Work', value: '(555) 010-0184' }] }],
      },
      invalid: {
        title: 'Contacts',
        entries: [{ name: 'Jordan', methods: [{ label: 'Work' }] }],
      },
    },
    {
      type: 'tripbudget',
      valid: { title: 'Trip', lines: [{ category: 'Rail', planned: '$80' }] },
      invalid: { title: 'Trip', lines: [{ category: 'Rail' }] },
    },
    {
      type: 'clausecompare',
      valid: {
        title: 'Terms',
        left: { label: 'Current', text: 'Thirty days.' },
        right: { label: 'Proposed', text: 'Sixty days.' },
        differences: [{ topic: 'Notice', change: 'The period changes.' }],
      },
      invalid: {
        title: 'Terms',
        left: { label: 'Current' },
        right: { label: 'Proposed', text: 'Sixty days.' },
        differences: [{ topic: 'Notice', change: 'The period changes.' }],
      },
    },
    {
      type: 'incidentbrief',
      valid: {
        title: 'Incident',
        impact: 'Checkout delayed',
        timeline: [{ time: '10:00', event: 'Detected' }],
      },
      invalid: { title: 'Incident', impact: 'Checkout delayed', timeline: [{ event: 'Detected' }] },
    },
    {
      type: 'coveragecheck',
      valid: { title: 'Coverage', rows: [{ item: 'Mechanical fault', status: 'unknown' }] },
      invalid: { title: 'Coverage', rows: [{ item: 'Mechanical fault', status: 'maybe' }] },
    },
    {
      type: 'offerbreakdown',
      valid: { title: 'Offer', parts: [{ label: 'Base', value: '$100,000' }] },
      invalid: { title: 'Offer', parts: [{ label: 'Base' }] },
    },
  ];

  it.each(cases)('accepts substantive minimal $type props', ({ type, valid }) => {
    expect(validateBrief(type, valid)).toHaveLength(1);
  });

  it.each(cases)(
    'drops $type when required nested data is absent or invalid',
    ({ type, invalid }) => {
      expect(validateBrief(type, invalid)).toHaveLength(0);
    },
  );

  it('drops optional statuses that cannot be normalized onto the closed vocabulary', () => {
    const blocks = validateBrief('approvalflow', {
      title: 'Approval',
      request: 'Approve the plan',
      status: 'waiting-for-a-miracle',
      approvers: [{ name: 'Jordan', status: 'pending' }],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks?.[0]?.props).not.toHaveProperty('status');
  });
});

// The "validated but hollow" class: a block whose data passes validation but is then discarded
// by the renderer's own vocabulary switch (logicmodel buckets columns by `stage` and drops any
// column without one of its five keys), leaving a card of nothing but "—" placeholders. Nested
// enum hints are enforced at validation with snap-repair, so near-misses keep their data and
// anything unsalvageable drops the block entirely — never a rendered shell.
describe('nested closed vocabularies (validated ⇒ substantive)', () => {
  const validate = (blocks: unknown[], types: string[]) =>
    validateLiveResponse({ title: 'T', blocks }, new Set(types), blocks.length);

  it('repairs the stage drifts a model actually writes (case, ±s, synonym keys)', () => {
    const res = validate(
      [
        {
          type: 'logicmodel',
          props: {
            title: 'How news becomes price',
            columns: [
              { label: 'Inputs', items: ['Wire headlines', 'Filings'] },
              { name: 'activity', items: ['Desks parse the release'] },
              { phase: 'OUTPUTS', items: ['Quotes move'] },
              { stage: 'outcomes', items: ['Spread narrows'] },
              { stage: 'Impacts', items: ['New consensus price'] },
            ],
          },
        },
      ],
      ['logicmodel'],
    );
    const props = res?.blocks[0]?.props as
      { columns?: Array<{ stage: string; items: string[] }> } | undefined;
    expect(props?.columns?.map((c) => c.stage)).toEqual([
      'inputs',
      'activities',
      'outputs',
      'outcomes',
      'impact',
    ]);
    expect(props?.columns?.every((c) => c.items.length > 0)).toBe(true);
  });

  it('drops the whole block when no column carries a recoverable stage', () => {
    const res = validate(
      [
        {
          type: 'logicmodel',
          props: {
            title: 'How news becomes price',
            columns: [
              { stage: 'resources', items: ['Wire headlines'] },
              { stage: 'work', items: ['Desks parse the release'] },
              { stage: 'results', items: ['New consensus price'] },
            ],
          },
        },
      ],
      ['logicmodel'],
    );
    expect(res?.blocks).toHaveLength(0);
  });

  it('treats blank-string items as no data at all', () => {
    const res = validate(
      [
        {
          type: 'logicmodel',
          props: {
            title: 'How news becomes price',
            columns: [
              { stage: 'inputs', items: ['', '  '] },
              { stage: 'activities', items: [''] },
            ],
          },
        },
      ],
      ['logicmodel'],
    );
    expect(res?.blocks).toHaveLength(0);
  });

  it('drops only the field on an enrichment enum miss, keeping the item’s content', () => {
    const res = validate(
      [
        {
          type: 'chatthread',
          props: {
            title: 'Support thread',
            messages: [
              { role: 'user', text: 'Any update on the refund?', status: 'seen' },
              { role: 'Assistant', text: 'Processed this morning — 3-5 days to land.' },
            ],
          },
        },
      ],
      ['chatthread'],
    );
    const props = res?.blocks[0]?.props as
      { messages?: Array<{ role: string; text: string; status?: string }> } | undefined;
    expect(props?.messages).toHaveLength(2);
    expect(props?.messages?.[0]?.status).toBeUndefined();
    expect(props?.messages?.[0]?.text).toBe('Any update on the refund?');
    expect(props?.messages?.[1]?.role).toBe('assistant');
  });

  it('never closes an "e.g." example list into an enum (stacktrace errorType)', () => {
    const res = validate(
      [
        {
          type: 'stacktrace',
          props: {
            title: 'Crash on checkout',
            errorType: 'RangeError',
            message: 'Maximum call stack size exceeded',
          },
        },
      ],
      ['stacktrace'],
    );
    const props = res?.blocks[0]?.props as { errorType?: string } | undefined;
    expect(props?.errorType).toBe('RangeError');
  });
});
