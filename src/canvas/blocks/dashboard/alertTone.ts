// Shared mapping from an alert/tripwire state to its accent token + default chip label. Tokens only,
// so it rides light/dark. Used by the thesis chip and the standing-alerts rows.
import type { AlertState } from './types';

export function alertAccent(state: AlertState): string {
  switch (state) {
    case 'triggered':
      return 'var(--danger)';
    case 'clear':
      return 'var(--insight)';
    case 'watching':
      return 'var(--presence)';
    case 'awaiting':
    default:
      return 'var(--text-muted)';
  }
}

export function alertLabel(state: AlertState): string {
  switch (state) {
    case 'triggered':
      return 'TRIGGERED';
    case 'clear':
      return 'CLEAR';
    case 'watching':
      return 'WATCHING';
    case 'awaiting':
    default:
      return 'AWAITING';
  }
}
