// Types for the enum-coverage analyzer (the .mjs stays plain Node-runnable; this gives the
// drift-guard test full typing).
export interface EnumGap {
  /** The Live-facing block type. */
  type: string;
  /** Dotted prop path, e.g. `events[].status` or `rows[].cells[].state`. */
  path: string;
  /** The enum's valid values (the set the model must choose from). */
  values: string[];
  /** How many of `values` are currently named in the component's propHints. */
  named: number;
}

export const gaps: EnumGap[];
export const typeToProps: Map<string, string>;
export const catalog: Map<string, string>;
export const enums: Map<string, string[]>;
export function enumPropsOf(
  ifaceName: string,
  prefix?: string,
): { path: string; values: string[] }[];
