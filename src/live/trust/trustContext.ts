// trustContext.ts — the channel between a figure in prose and the one card that can explain it.
// Split from the provider component so the context and its hook stay a plain module (the
// BlankFillContext idiom) and every .tsx here exports components only.
import { createContext, useContext } from 'react';
import type { TrustRegistry, UsedInRef } from './registry';

export interface TrustContextValue {
  registry: TrustRegistry;
  /** Open the card for a value, anchored to the control the reader clicked. */
  open: (valueId: string, anchor: HTMLElement) => void;
  /** Jump the surface to a place the value is used. Absent when the host can't navigate. */
  onNavigate?: (ref: UsedInRef) => void;
  /** False until the reader has opened their first card — the card explains itself exactly once. */
  hinted: boolean;
  markHinted: () => void;
}

export const TrustContext = createContext<TrustContextValue | null>(null);

/** Null outside a provider: a figure rendered without a world stays plain text instead of throwing. */
export function useTrust(): TrustContextValue | null {
  return useContext(TrustContext);
}
