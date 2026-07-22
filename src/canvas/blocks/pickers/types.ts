// pickers family block types — 10 premium, heavily-interactive picker/input components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type.
import type { IconKey } from '../../../types/mavea';

/* shared eyebrow props — every block carries title + icon */
interface Eyebrow {
  title: string;
  icon?: IconKey;
  iconColor?: string;
  footer?: HtmlString;
}

/* ── datepicker ── field → popover month calendar; pick a day ── */
export interface DatepickerProps extends Eyebrow {
  /** field label shown above the input */
  label?: string;
  /** ISO yyyy-mm-dd default selection (defaults to a sensible date) */
  value?: string;
  /** placeholder when nothing is chosen */
  placeholder?: string;
  /** which month to show first, "yyyy-mm" (defaults to value's month) */
  month?: string;
  color?: AccentVar;
}

/* ── calendarpick ── inline month calendar + event dots; prev/next ── */
export interface CalendarEvent {
  /** ISO yyyy-mm-dd */
  date: string;
  /** dot color */
  color?: AccentVar;
  /** label shown when that day is selected */
  label?: string;
}
export interface CalendarpickProps extends Eyebrow {
  /** "yyyy-mm" month to render first */
  month?: string;
  /** ISO yyyy-mm-dd default selection */
  value?: string;
  events?: CalendarEvent[];
  color?: AccentVar;
}

/* ── daterange ── two-month range picker; click start then end ── */
export interface DaterangeProps extends Eyebrow {
  /** "yyyy-mm" left month (right is +1) */
  month?: string;
  /** ISO yyyy-mm-dd preset range start */
  start?: string;
  /** ISO yyyy-mm-dd preset range end */
  end?: string;
  /** quick preset chips, e.g. "Last 7 days" */
  presets?: string[];
  color?: AccentVar;
}

/* ── timepicker ── hours:minutes (+AM/PM) with steppers/columns ── */
export interface TimepickerProps extends Eyebrow {
  label?: string;
  /** 12 (with AM/PM) or 24 */
  format?: 12 | 24;
  /** default hour (1-12 or 0-23) */
  hour?: number;
  /** default minute */
  minute?: number;
  /** default meridiem for 12h */
  meridiem?: 'AM' | 'PM';
  /** minute step (default 5) */
  step?: number;
  color?: AccentVar;
}

/* ── colorpicker ── swatches + hue strip; shows hex + preview ── */
export interface ColorSwatch {
  hex: string;
  name?: string;
}
export interface ColorpickerProps extends Eyebrow {
  label?: string;
  /** default selected hex */
  value?: string;
  swatches?: ColorSwatch[];
  color?: AccentVar;
}

/* ── fileupload ── drag-drop dropzone + file list (name/size/progress) ── */
export interface UploadFile {
  name: string;
  /** human size, e.g. "2.4 MB" */
  size: string;
  /** 0..100 upload progress */
  progress?: number;
  kind?: 'doc' | 'image' | 'slides' | 'table' | 'pdf' | 'file';
}
export interface FileuploadProps extends Eyebrow {
  /** dropzone headline */
  prompt?: string;
  /** allowed-types hint line */
  hint?: string;
  files?: UploadFile[];
  color?: AccentVar;
}

/* ── tagsinput ── type + Enter to add chips; × / backspace to remove ── */
export interface TagsinputProps extends Eyebrow {
  label?: string;
  /** preset chips */
  tags?: string[];
  placeholder?: string;
  /** suggestion chips offered below the field */
  suggestions?: string[];
  /** soft cap on number of tags */
  max?: number;
  color?: AccentVar;
}

/* ── numberstepper ── numeric input with −/+ steppers, min/max/step ── */
export interface NumberstepperProps extends Eyebrow {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  /** caption line under the control */
  caption?: HtmlString;
  color?: AccentVar;
}

/* ── searchselect ── search box → live filtered results + keyboard nav ── */
export interface SearchOption {
  label: string;
  /** secondary line, e.g. role / detail */
  meta?: string;
  icon?: IconKey;
}
export interface SearchselectProps extends Eyebrow {
  label?: string;
  placeholder?: string;
  options: SearchOption[];
  /** index of the preselected option */
  selected?: number;
  color?: AccentVar;
}

/* ── formpanel ── composed labeled form + validation + submit ── */
export interface FormField {
  /** unique key */
  key: string;
  label: string;
  /** input flavor */
  type?: 'text' | 'email' | 'select' | 'textarea';
  placeholder?: string;
  /** prefilled value */
  value?: string;
  /** options for type='select' */
  options?: string[];
  required?: boolean;
  /** help/hint under the field */
  hint?: string;
}
export interface FormpanelProps extends Eyebrow {
  /** form heading shown above the fields */
  heading?: string;
  fields: FormField[];
  submitLabel?: string;
  /** confirmation message after a valid submit */
  success?: string;
  color?: AccentVar;
}

export type PickersBlock =
  | (BlockBase & { type: 'datepicker'; props: DatepickerProps })
  | (BlockBase & { type: 'calendarpick'; props: CalendarpickProps })
  | (BlockBase & { type: 'daterange'; props: DaterangeProps })
  | (BlockBase & { type: 'timepicker'; props: TimepickerProps })
  | (BlockBase & { type: 'colorpicker'; props: ColorpickerProps })
  | (BlockBase & { type: 'fileupload'; props: FileuploadProps })
  | (BlockBase & { type: 'tagsinput'; props: TagsinputProps })
  | (BlockBase & { type: 'numberstepper'; props: NumberstepperProps })
  | (BlockBase & { type: 'searchselect'; props: SearchselectProps })
  | (BlockBase & { type: 'formpanel'; props: FormpanelProps });
