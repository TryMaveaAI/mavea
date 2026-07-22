// The fill-context for "The Blank Space", kept in its own module so the BlankSlot component file
// only exports a component (Fast Refresh / react-refresh requirement).
import { createContext } from 'react';
import type { FillValue } from '../../data/conversation';

/** Live-only wiring: the filled values so far, which hole is armed for voice/tour, and how a fill
 *  commits. TopicCanvas provides it in Live; the scripted Demo never does, so a BlankSlot falls
 *  back to local state and the holes stay fillable in isolation (and in the render coverage test). */
export interface BlankFillState {
  values: Record<string, FillValue>;
  activeKey: string | null;
  fill: (value: FillValue) => void;
  unfill?: (key: string) => void;
  activate?: (key: string) => void;
  /** Refine the answer with the values filled so far (the "Complete" affordance). */
  complete?: () => void;
  /** True while a refine turn is streaming — disables Complete so it can't double-fire. */
  busy?: boolean;
}

export const BlankFillContext = createContext<BlankFillState | null>(null);
