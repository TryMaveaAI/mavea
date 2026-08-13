// forms family block types — 10 premium, heavily-interactive form-primitive components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString, Blank } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type, identical
// to what `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── buttonbar ── gallery of button variants (all clickable, ripple/press) ── */
export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'icon' | 'loading';
export interface ButtonSpec {
  /** visible label (omit/ignored for the icon variant) */
  label?: string;
  variant: ButtonVariant;
  icon?: IconKey;
  /** disabled buttons are dimmed & non-interactive */
  disabled?: boolean;
}
export interface ButtonbarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  buttons: ButtonSpec[];
  /** caption shown under the gallery; updates with the last-pressed button */
  hint?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── textfield ── labeled inputs with validation states ── */
export type FieldState = 'default' | 'error' | 'success';
export interface FieldSpec {
  label: string;
  /** placeholder text */
  placeholder?: string;
  /** initial value (filled by default for a great resting state) */
  value?: string;
  /** leading icon inside the input */
  icon?: IconKey;
  /** validation state (drives ring + helper color) */
  state?: FieldState;
  /** helper/validation text under the field */
  helper?: string;
  /** render as a password field with a reveal toggle */
  password?: boolean;
  optional?: boolean;
}
export interface TextfieldProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  fields: FieldSpec[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── textarea ── auto-growing textarea + live char counter ── */
export interface TextareaProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  label?: string;
  placeholder?: string;
  /** initial content */
  value?: string;
  /** max characters (counter turns warning near the limit) */
  max?: number;
  /** minimum visible rows */
  minRows?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── select ── styled single-select dropdown ── */
export interface SelectOption {
  label: string;
  /** small caption shown under the label */
  caption?: string;
  icon?: IconKey;
  disabled?: boolean;
}
export interface SelectProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  label?: string;
  /** placeholder shown when nothing is chosen */
  placeholder?: string;
  options: SelectOption[];
  /** index of the default-selected option (omit → placeholder) */
  selected?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── combobox ── searchable autocomplete combobox ── */
export interface ComboItem {
  label: string;
  /** secondary text (e.g. an email or a region) */
  meta?: string;
  icon?: IconKey;
}
export interface ComboboxProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  label?: string;
  placeholder?: string;
  items: ComboItem[];
  /** index of the default-selected item */
  selected?: number;
  /** noun for the empty/results line, e.g. "people" */
  noun?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── checkboxgroup ── checkbox group w/ indeterminate "select all" ── */
export interface CheckItem {
  label: string;
  caption?: string;
  /** initially checked */
  checked?: boolean;
  disabled?: boolean;
}
export interface CheckboxgroupProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label for the master select-all row */
  allLabel?: string;
  items: CheckItem[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── radiogroup ── radio cards / rows w/ live selection ── */
export interface RadioOption {
  label: string;
  caption?: string;
  icon?: IconKey;
  /** trailing value/price/badge text */
  value?: string;
  disabled?: boolean;
}
export interface RadiogroupProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 'card' (default) draws bordered cards; 'row' draws compact rows */
  layout?: 'card' | 'row';
  options: RadioOption[];
  /** index of the default-selected option (default 0) */
  selected?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── switchset ── rows of labeled toggle switches ── */
export interface SwitchItem {
  label: string;
  description?: string;
  icon?: IconKey;
  /** initial on/off */
  on?: boolean;
  disabled?: boolean;
}
export interface SwitchsetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: SwitchItem[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── togglegroup ── multi-toggle button group (B/I/U, alignment, …) ── */
export interface ToggleItem {
  /** short label (e.g. "B"); optional if an icon is given */
  label?: string;
  icon?: IconKey;
  /** accessible/title text */
  title?: string;
  /** initially pressed */
  on?: boolean;
}
export interface TogglegroupProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: ToggleItem[];
  /** 'multi' (default) → independent toggles; 'single' → exactly one pressed */
  mode?: 'multi' | 'single';
  /** caption under the group reflecting current state */
  hint?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── otp ── segmented one-time-passcode input ── */
export interface OtpProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prompt?: string;
  /** number of digit boxes (default 6) */
  length?: number;
  /** the correct code — when fully entered & matching → verified state */
  code?: string;
  /** resend caption line */
  resendLabel?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── actionchecklist ── checkable next-steps the user works through (no model call) ── */
export type ActionPriority = 'high' | 'medium' | 'low';
export interface ActionItem {
  /** the task itself, e.g. "Reach out to 25 potential clients" */
  label: string;
  /** one-line elaboration shown under the task */
  detail?: string;
  /** urgency pill — high (danger) / medium (warning) / low (muted) */
  priority?: ActionPriority;
  /** trailing tag: a phase, due hint, or time estimate ("Day 1", "~30 min") */
  meta?: string;
  /** start already ticked off */
  done?: boolean;
}
export interface ActionchecklistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** caption under the title, e.g. "30-day validation plan" */
  subtitle?: string;
  items: ActionItem[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── blanks ── "The Blank Space": an answer rendered with intentional holes the user fills ── */
export interface BlanksProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** one calm line framing why the holes are there ("Two things only you can answer") */
  intro?: string;
  /** the holes themselves — each a value only the user can give */
  slots: Blank[];
  footer?: HtmlString;
}

/* ── preflightchecklist ── aviation preflight walkthrough, grouped into named phases ── */
export interface PreflightItem {
  /** the check itself, e.g. "Fuel quantity — CHECK visually, both tanks" */
  label: string;
  /** start already ticked off */
  checked?: boolean;
  /** a missed item is a hazard, not a nicety — gets a distinct warning marker */
  critical?: boolean;
}
export interface PreflightSection {
  /** the phase of flight, e.g. "Before Start", "Before Takeoff", "Shutdown" */
  name: string;
  items: PreflightItem[];
}
export interface PreflightchecklistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** tail number / type, e.g. "N172ME · Cessna 172S" */
  aircraft?: string;
  sections: PreflightSection[];
  footer?: HtmlString;
}

/* ── estateplanchecklist ── estate-planning documents grouped by category, status per item ── */
export type EstateDocCategory =
  'Will' | 'POA' | 'Healthcare Proxy' | 'Beneficiary designations' | 'Digital assets';
export type EstateDocStatus = 'done' | 'missing' | 'needs-update';
export interface EstateDocument {
  /** which of the five estate-planning pillars this document covers */
  category: EstateDocCategory;
  status: EstateDocStatus;
  /** when it was last reviewed/signed, e.g. "March 2023" — omit if never reviewed */
  lastReviewed?: string;
}
export interface EstateplanchecklistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  documents: EstateDocument[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── visachecklist ── immigration filing checklist, required docs set apart from optional ── */
export type VisaDocStatus = 'done' | 'pending' | 'missing';
export interface VisaDocument {
  /** the document itself, e.g. "Form I-485", "Passport-style photos (2)" */
  name: string;
  /** whether the filing is rejected without it — an item missing this is treated as required,
   *  the safer default for a legal checklist */
  required?: boolean;
  status: VisaDocStatus;
}
export interface VisachecklistProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the filing this checklist is for, e.g. "H-1B change of status", "I-485 adjustment" */
  caseType?: string;
  documents: VisaDocument[];
  color?: AccentVar;
  footer?: HtmlString;
}

export type FormsBlock =
  | (BlockBase & { type: 'buttonbar'; props: ButtonbarProps })
  | (BlockBase & { type: 'blanks'; props: BlanksProps })
  | (BlockBase & { type: 'textfield'; props: TextfieldProps })
  | (BlockBase & { type: 'textarea'; props: TextareaProps })
  | (BlockBase & { type: 'select'; props: SelectProps })
  | (BlockBase & { type: 'combobox'; props: ComboboxProps })
  | (BlockBase & { type: 'checkboxgroup'; props: CheckboxgroupProps })
  | (BlockBase & { type: 'radiogroup'; props: RadiogroupProps })
  | (BlockBase & { type: 'switchset'; props: SwitchsetProps })
  | (BlockBase & { type: 'togglegroup'; props: TogglegroupProps })
  | (BlockBase & { type: 'otp'; props: OtpProps })
  | (BlockBase & { type: 'actionchecklist'; props: ActionchecklistProps })
  | (BlockBase & { type: 'preflightchecklist'; props: PreflightchecklistProps })
  | (BlockBase & { type: 'estateplanchecklist'; props: EstateplanchecklistProps })
  | (BlockBase & { type: 'visachecklist'; props: VisachecklistProps });
