// live-verify-consistency.test.ts — guards the cross-block numeric consistency checks.
//
// The failure these lock against (seen in a real haiku "Fast" answer): one canvas said
// "Future: $1,800" in a buckets card and "$1,100" for the same bucket in a donut, with
// narration claiming the needs bucket "grows" while the numbers shrank. Two charts on
// one screen disagreeing kills the product's promise, so checkConsistency now extracts
// labeled amounts across blocks and flags contradictions and part/total mismatches as
// HARD issues — routed to the same one-shot self-correction pass as the sparse guard.
// Numbers are NEVER silently mutated: only the model can know which figure is right.
import {
  autoFix,
  checkConsistency,
  hasHardIssue,
  parseAmount,
  HARD_ISSUE_CODES,
} from '../src/live/verify';
import type { LiveResponse } from '../src/engine/liveSchema';
import type { Block } from '../src/data/conversation';

function resp(blocks: LiveResponse['blocks']): LiveResponse {
  return { title: 't', sub: '', narration: '', blocks };
}

function kpi(title: string, items: { label: string; val: string }[]): Block {
  return { type: 'kpi', col: 6, delay: 0, props: { title, kpis: items } };
}

function stack(
  title: string,
  total: string | undefined,
  segments: { label: string; value: number; display: string }[],
): Block {
  return {
    type: 'stack',
    col: 6,
    delay: 0,
    props: {
      title,
      ...(total ? { total } : {}),
      segments: segments.map((s) => ({ ...s, color: 'var(--presence)' })),
    },
  };
}

function donut(title: string, rows: { label: string; pct: number }[]): Block {
  return {
    type: 'donut',
    col: 4,
    delay: 0,
    props: { title, rows: rows.map((r) => ({ ...r, color: 'var(--presence)' })) },
  };
}

function codes(r: LiveResponse): string[] {
  return checkConsistency(r).map((i) => i.code);
}

describe('parseAmount', () => {
  it('parses currency, separators, suffixes and rates', () => {
    expect(parseAmount('$1,800')?.value).toBe(1800);
    expect(parseAmount('≈3.2k')?.value).toBe(3200);
    expect(parseAmount('$1.5M')?.value).toBe(1_500_000);
    expect(parseAmount('$5,000/mo')?.value).toBe(5000);
    expect(parseAmount('36%')).toMatchObject({ value: 36, kind: 'pct' });
  });

  it('rejects ranges and qualitative strings (strict on purpose)', () => {
    expect(parseAmount('$1,800–$2,000')).toBeNull();
    expect(parseAmount('about half')).toBeNull();
    expect(parseAmount('High')).toBeNull();
  });
});

describe('checkConsistency — cross-block value conflicts', () => {
  it('lists value-conflict and stack-sum as HARD issue codes (repair, never mutate)', () => {
    expect(HARD_ISSUE_CODES.has('value-conflict')).toBe(true);
    expect(HARD_ISSUE_CODES.has('stack-sum')).toBe(true);
    expect(HARD_ISSUE_CODES.has('donut-sum')).toBe(false); // mechanical, autoFix handles it
  });

  it('flags the real rent-increase failure: same bucket, different dollars across blocks', () => {
    const r = resp([
      kpi('Your three buckets (revised)', [
        { label: 'Needs', val: '$1,800' },
        { label: 'Wants', val: '$1,400' },
        { label: 'Future', val: '$1,800' },
      ]),
      stack('Where the $5,000 goes now', '$5,000', [
        { label: 'Rent', value: 1800, display: '$1,800' },
        { label: 'Other needs', value: 700, display: '$700' },
        { label: 'Wants', value: 1400, display: '$1,400' },
        { label: 'Future', value: 1100, display: '$1,100' },
      ]),
    ]);
    const issues = checkConsistency(r);
    const conflict = issues.find((i) => i.code === 'value-conflict');
    expect(conflict).toBeDefined();
    expect(conflict?.detail).toContain('future');
    expect(conflict?.detail).toContain('$1,800');
    expect(conflict?.detail).toContain('$1,100');
    expect(hasHardIssue(issues)).toBe(true);
  });

  it('matches labels case-insensitively and ignoring punctuation', () => {
    const r = resp([
      kpi('Buckets', [{ label: 'Future!', val: '$1,800' }]),
      kpi('Plan', [{ label: '  FUTURE ', val: '$1,100' }]),
    ]);
    expect(codes(r)).toContain('value-conflict');
  });

  it('reads amounts embedded in donut labels ("Future $1,100" style)', () => {
    const r = resp([
      kpi('Buckets', [{ label: 'Future', val: '$1,800' }]),
      donut('Where it goes', [
        { label: 'Future $1,100', pct: 22 },
        { label: 'Everything else $3,900', pct: 78 },
      ]),
    ]);
    expect(codes(r)).toContain('value-conflict');
  });

  it('tolerance edge: within 1% passes, just beyond 1% flags', () => {
    const ok = resp([
      kpi('A', [{ label: 'Savings', val: '$1,000' }]),
      kpi('B', [{ label: 'Savings', val: '$1,010' }]), // exactly 1% off max — allowed
    ]);
    expect(codes(ok)).not.toContain('value-conflict');

    const bad = resp([
      kpi('A', [{ label: 'Savings', val: '$1,000' }]),
      kpi('B', [{ label: 'Savings', val: '$1,012' }]), // >1% — contradiction
    ]);
    expect(codes(bad)).toContain('value-conflict');
  });

  it('does NOT compare pct shares across blocks (each is a share of its OWN whole)', () => {
    // Rent is 48% of the needs sub-budget but 36% of the full budget — both true.
    const r = resp([
      {
        type: 'breakdown',
        col: 4,
        delay: 0,
        props: {
          title: 'Needs: where the $2,500 goes',
          rows: [
            { name: 'Rent', val: '', pct: 48 },
            { name: 'Everything else', val: '', pct: 52 },
          ],
        },
      },
      donut('Where the $5,000 goes', [
        { label: 'Rent', pct: 36 },
        { label: 'Everything else', pct: 64 },
      ]),
    ]);
    expect(codes(r)).not.toContain('value-conflict');
  });

  it('does NOT flag duplicate labels inside a single block', () => {
    const r = resp([
      kpi('Quarters', [
        { label: 'Revenue', val: '$100' },
        { label: 'Revenue', val: '$200' },
      ]),
      donut('Split', [
        { label: 'A', pct: 50 },
        { label: 'B', pct: 50 },
      ]),
    ]);
    expect(codes(r)).not.toContain('value-conflict');
  });

  it('passes a clean, consistent multi-block spec untouched', () => {
    const r = resp([
      kpi('Buckets', [
        { label: 'Needs', val: '$2,500' },
        { label: 'Wants', val: '$1,500' },
        { label: 'Future', val: '$1,000' },
      ]),
      stack('Where the $5,000 goes', '$5,000', [
        { label: 'Needs', value: 2500, display: '$2,500' },
        { label: 'Wants', value: 1500, display: '$1,500' },
        { label: 'Future', value: 1000, display: '$1,000' },
      ]),
      donut('Composition', [
        { label: 'Needs', pct: 50 },
        { label: 'Wants', pct: 30 },
        { label: 'Future', pct: 20 },
      ]),
    ]);
    expect(checkConsistency(r)).toEqual([]);
    expect(autoFix(r).blocks).toEqual(r.blocks);
  });
});

describe('checkConsistency — parts vs stated total', () => {
  it('flags a stack whose segments do not sum to its stated total', () => {
    const r = resp([
      kpi('Headline', [{ label: 'Income', val: '$5,000' }]),
      stack('Where the $5,000 goes', '$5,000', [
        { label: 'Rent', value: 1800, display: '$1,800' },
        { label: 'Other needs', value: 700, display: '$700' },
        { label: 'Wants', value: 1400, display: '$1,400' },
        { label: 'Savings', value: 1800, display: '$1,800' }, // sums to 5,700
      ]),
    ]);
    const issues = checkConsistency(r);
    expect(issues.some((i) => i.code === 'stack-sum')).toBe(true);
    expect(hasHardIssue(issues)).toBe(true);
  });

  it('accepts pct-style segment values (sum ≈100) against a dollar total', () => {
    const r = resp([
      kpi('Headline', [{ label: 'Income', val: '$5,000' }]),
      stack('Split', '$5,000', [
        { label: 'Needs', value: 50, display: 'half' },
        { label: 'Wants', value: 30, display: 'a third' },
        { label: 'Future', value: 20, display: 'a fifth' },
      ]),
    ]);
    expect(codes(r)).not.toContain('stack-sum');
  });

  it('skips a stack without a stated total', () => {
    const r = resp([
      kpi('Headline', [{ label: 'Income', val: '$5,000' }]),
      stack('Split', undefined, [
        { label: 'A', value: 10, display: '$10' },
        { label: 'B', value: 20, display: '$20' },
      ]),
    ]);
    expect(codes(r)).not.toContain('stack-sum');
  });

  it('flags donut shares that do not sum to ~100, and autoFix normalizes them', () => {
    const r = resp([
      kpi('Headline', [{ label: 'Income', val: '$5,000' }]),
      donut('Broken split', [
        { label: 'A', pct: 30 },
        { label: 'B', pct: 30 },
      ]),
      stack('Breakdown', '$5,000', [{ label: 'X', value: 5000, display: '$5,000' }]),
    ]);
    const issues = checkConsistency(r);
    expect(issues.some((i) => i.code === 'donut-sum')).toBe(true);
    expect(hasHardIssue(issues)).toBe(false); // soft — autoFix clears it for free
    const fixed = autoFix(r);
    const d = fixed.blocks.find((b) => b.type === 'donut');
    const sum = (d as Extract<Block, { type: 'donut' }>).props.rows.reduce((a, x) => a + x.pct, 0);
    expect(sum).toBe(100);
    expect(checkConsistency(fixed).some((i) => i.code === 'donut-sum')).toBe(false);
  });
});
