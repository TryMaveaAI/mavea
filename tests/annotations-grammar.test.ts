import { describe, it, expect } from 'vitest';
import {
  validateAnnotations,
  MAX_ANNOTATIONS,
  type AnnotationSurface,
} from '../src/canvas/lib/annotations';

const surface: AnnotationSurface = {
  columnKeys: ['item', 'price', 'qty'],
  rowLabels: ['Coffee', 'Bagel', 'Total'],
  valueDomain: { min: 0, max: 20 },
};

describe('validateAnnotations — data-grounded, capped, drop-individual', () => {
  it('keeps a valid receipt annotation set (the flagship scenario)', () => {
    const anns = validateAnnotations(
      [
        { op: 'format', target: { kind: 'column', key: 'price' }, as: 'currency' },
        { op: 'summary', stat: 'total', columns: ['price'] },
        { op: 'emphasize', target: { kind: 'row', match: 'Total' }, tone: 'presence' },
      ],
      surface,
    );
    expect(anns.map((a) => a.op)).toEqual(['format', 'summary', 'emphasize']);
  });

  it('drops an annotation referencing a column/row that does not exist (hallucination guard)', () => {
    const anns = validateAnnotations(
      [
        { op: 'format', target: { kind: 'column', key: 'nonexistent' }, as: 'currency' }, // dropped
        { op: 'format', target: { kind: 'column', key: 'price' }, as: 'currency' }, // kept
        { op: 'emphasize', target: { kind: 'row', match: 'Nope' } }, // dropped
      ],
      surface,
    );
    expect(anns).toHaveLength(1);
    expect(anns[0].op).toBe('format');
  });

  it('matches row/column names case-insensitively', () => {
    const anns = validateAnnotations(
      [{ op: 'emphasize', target: { kind: 'row', match: 'total' } }],
      surface,
    );
    expect(anns).toHaveLength(1);
  });

  it('WE compute summaries — a summary op needs no model number and survives on any surface', () => {
    const anns = validateAnnotations([{ op: 'summary', stat: 'mean' }], surface);
    expect(anns).toHaveLength(1);
    expect(anns[0]).toMatchObject({ op: 'summary', stat: 'mean' });
  });

  it('drops an unknown op (forward-compat versioning: v2 ops invisible to a v1 validator)', () => {
    const anns = validateAnnotations(
      [
        { op: 'hologram', target: { kind: 'block' } },
        { op: 'note', target: { kind: 'block' }, text: 'ok' },
      ],
      surface,
    );
    expect(anns).toHaveLength(1);
    expect(anns[0].op).toBe('note');
  });

  it('rejects an invalid tone but keeps the annotation without it', () => {
    const anns = validateAnnotations(
      [{ op: 'emphasize', target: { kind: 'row', match: 'Coffee' }, tone: 'neon' }],
      surface,
    );
    expect(anns).toHaveLength(1);
    expect('tone' in anns[0]).toBe(false);
  });

  it('caps total annotations at MAX_ANNOTATIONS', () => {
    const many = Array.from({ length: 20 }, () => ({
      op: 'note',
      target: { kind: 'block' },
      text: 'x',
    }));
    // note also has a per-op cap (2), so this is bounded well under MAX anyway
    const anns = validateAnnotations(many, surface);
    expect(anns.length).toBeLessThanOrEqual(MAX_ANNOTATIONS);
    expect(anns.length).toBeLessThanOrEqual(2); // per-op cap for 'note'
  });

  it('enforces per-op caps (at most 4 format ops)', () => {
    const fmts = Array.from({ length: 6 }, () => ({
      op: 'format',
      target: { kind: 'column', key: 'price' },
      as: 'currency',
    }));
    expect(validateAnnotations(fmts, surface).length).toBe(4);
  });

  it('validates a refline value against the domain and a status rule set', () => {
    const anns = validateAnnotations(
      [
        { op: 'refline', target: { kind: 'value', value: 10 }, label: 'budget', tone: 'warning' },
        { op: 'refline', target: { kind: 'value', value: 9999 } }, // wildly out of domain → dropped
        {
          op: 'status',
          target: { kind: 'column', key: 'qty' },
          rules: [{ match: 'low', tone: 'danger' }],
        },
      ],
      surface,
    );
    expect(anns.map((a) => a.op)).toEqual(['refline', 'status']);
  });

  it('returns [] for non-array input, never throws', () => {
    expect(validateAnnotations(undefined, surface)).toEqual([]);
    expect(validateAnnotations('nope', surface)).toEqual([]);
    expect(validateAnnotations({ op: 'note' }, surface)).toEqual([]);
  });
});
