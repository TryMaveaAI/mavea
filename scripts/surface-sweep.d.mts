export interface Surface {
  key: string;
  label: string;
  /** The route prefix this row covers; '' is the landing. */
  route: string;
  hash: string;
  ready: string;
  click?: string[];
  reading?: string;
  settleMs?: number;
  owns?: string[];
  lab?: boolean;
}
export const SURFACES: Surface[];
export function uncoveredRoutes(prefixes: string[]): string[];
export function surfacesTouchedBy(changedFiles: string[]): Set<string> | null;
export const WIDTHS: number[];
export function heightFor(width: number): number;
export const DEFAULT_SIZES: string[];
export const ZOOM_SIZES: string[];
export const ZOOM_DPRS: number[];
