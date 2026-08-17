// display.ts — display-only helpers shared by the trust UI. Formatting lives here rather than on
// the contract so types.ts stays pure data, and so the inline figure and the card that explains it
// can never disagree about what a value reads as.
import type { Receipt } from '../ground/types';
import type { ValueStatus, WorldValue } from './types';

/** The badge over every card: how the figure was produced, in the reader's words. */
export const STATUS_LABEL: Record<ValueStatus, string> = {
  grounded: 'GROUNDED',
  calculated: 'CALCULATED LOCALLY',
  illustrative: 'ILLUSTRATIVE',
  structure: 'NO NUMBER',
};

/** The figure as text. Already unit-suffixed upstream (withUnit), so there is exactly one place
 *  where a number becomes words. */
export function rawOf(v: WorldValue): string {
  return v.kind === 'calculated' ? v.raw : v.resolution.raw;
}

/**
 * The figure as a NUMBER, or null when the value has none.
 *
 * Every arm of the union is covered here so a consumer never reaches into one: a calculated value
 * holds a branded `value`, a grounded/illustrative one holds its resolution's, and a T0 structure
 * value holds no number at all — that last case is the reason this returns null rather than 0. A
 * caller that wants to SIZE something by a figure has to handle "there is no figure", which on this
 * surface is a real and common answer.
 */
export function numberOf(v: WorldValue): number | null {
  if (v.kind === 'calculated') return v.value;
  return v.resolution.ok && v.resolution.tier !== 'T0' ? v.resolution.value : null;
}

/** Where a T1 figure lives in the user's own files, e.g. "Your file · doc 2, p. 7, cell B14".
 *  `doc` is 0-indexed in the contract and 1-based for a reader. */
export function userFileLine(r: Receipt): string {
  const parts: string[] = [];
  if (r.doc !== undefined) parts.push(`doc ${r.doc + 1}`);
  if (r.page !== undefined) parts.push(`p. ${r.page}`);
  if (r.cell !== undefined) parts.push(`cell ${r.cell}`);
  return parts.length ? `Your file · ${parts.join(', ')}` : 'Your file';
}

/** Identifier grammar, mirroring calc.ts's: the display must tokenize exactly like the evaluator,
 *  or a substituted label could land inside another id. */
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/** The formula with each input id swapped for its human label, so the derivation reads as a
 *  sentence instead of as code. An id with no value behind it stays verbatim. */
export function formulaWithLabels(
  formula: string,
  labelOf: (id: string) => string | undefined,
): string {
  return formula.replace(IDENT_RE, (token) => labelOf(token) ?? token);
}
