import type { LedgerEntry } from './ledger';

export function formatLogTime(at: number): string {
  const date = new Date(at);
  const hour24 = date.getHours();
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hour12}:${minutes} ${suffix}`;
}

function checkValueChip(entry: LedgerEntry): string | null {
  if (entry.kind !== 'check' || entry.dashboardIds.length !== 1) return null;
  const match = / at (\S.*)$/.exec(entry.text);
  return match ? match[1].trim() : null;
}

export type LogChipTone = 'presence' | 'insight' | 'danger' | 'plain';
export interface LogChip {
  label: string;
  tone: LogChipTone;
}

export function chipForEntry(entry: LedgerEntry): LogChip | null {
  switch (entry.kind) {
    case 'insight':
      return { label: '✦ INSIGHT', tone: 'presence' };
    case 'savings':
      return { label: '✦ SAVINGS', tone: 'insight' };
    case 'alert':
      return { label: 'ALERT', tone: 'danger' };
    case 'goal':
      return { label: 'GOAL', tone: 'danger' };
    case 'briefing':
      return { label: 'BRIEFING', tone: 'presence' };
    case 'check': {
      const value = checkValueChip(entry);
      return value ? { label: value, tone: 'plain' } : null;
    }
  }
}
