// colors.ts — the one place that maps Ripple's status vocabulary to the shared design tokens, so
// every section reads risk the same way. No hex here; just token references.
import type { NodeStatus, RiskLevel } from './model';

export function statusVar(s: NodeStatus): string {
  switch (s) {
    case 'breaks':
      return 'var(--danger)';
    case 'migration':
      return 'var(--warning)';
    case 'affected':
      return 'var(--presence)';
    case 'safe':
      return 'var(--insight)';
    case 'untested':
    default:
      return 'var(--text-muted)';
  }
}

export function statusLabel(s: NodeStatus): string {
  switch (s) {
    case 'breaks':
      return 'BREAKS';
    case 'migration':
      return 'MIGRATION';
    case 'affected':
      return 'AFFECTED';
    case 'safe':
      return 'SAFE';
    case 'untested':
    default:
      return 'UNTESTED';
  }
}

export function riskVar(r: RiskLevel): string {
  return r === 'breaks' ? 'var(--danger)' : r === 'watch' ? 'var(--warning)' : 'var(--insight)';
}
