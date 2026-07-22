// display family block types — 10 premium, heavily-interactive display/feedback primitives
// (the application primitives a top kit ships: avatars, badges, chips, kbd, code, banners,
// toasts, spinners, notifications). Prop shapes are realistic & sample-friendly — a data
// agent fills them later.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared file
// we must not edit), so import it from its canonical source — same type, identical to what
// `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── avatar ── image / initials / icon avatar (click → cycle size, ring + status dot) ── */
export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';
export interface AvatarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** display name — drives initials when no image */
  name?: string;
  /** optional image URL; falls back to initials, then a glyph */
  src?: string;
  /** glyph to draw when neither image nor name is given */
  glyph?: IconKey;
  /** explicit initials override (else derived from name) */
  initials?: string;
  /** default size (click the avatar to cycle S→M→L) */
  size?: AvatarSize;
  /** presence dot */
  status?: AvatarStatus;
  /** draw an accent ring around the avatar */
  ring?: boolean;
  color?: AccentVar;
  /** sub-line under the name, e.g. a role */
  role?: string;
  footer?: HtmlString;
}

/* ── avatargroup ── overlapping stack + "+N" overflow (hover spreads & names a face) ── */
export interface AvatarMember {
  name: string;
  src?: string;
  initials?: string;
  color?: AccentVar;
  status?: AvatarStatus;
  /** sub-line in the hover readout */
  role?: string;
}
export interface AvatargroupProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  members: AvatarMember[];
  /** how many faces to show before collapsing to "+N" (default 5) */
  max?: number;
  size?: AvatarSize;
  /** caption under the stack, e.g. "12 collaborators" */
  caption?: HtmlString;
  footer?: HtmlString;
}

/* ── badgeset ── badge variants + a count badge on an icon (click → bump the count) ── */
export type BadgeVariant = 'solid' | 'soft' | 'outline' | 'dot';
export interface BadgeSpec {
  label: string;
  variant?: BadgeVariant;
  color?: AccentVar;
  icon?: IconKey;
}
export interface BadgesetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  badges: BadgeSpec[];
  /** icon the count badge sits on, e.g. 'bell' */
  countIcon?: IconKey;
  /** initial unread count for the notification badge */
  count?: number;
  countColor?: AccentVar;
  footer?: HtmlString;
}

/* ── chipset ── selectable + removable tags with leading icon/avatar (toggle / dismiss) ── */
export interface ChipSpec {
  label: string;
  /** leading icon */
  icon?: IconKey;
  /** leading avatar initials (mutually exclusive-ish with icon) */
  avatar?: string;
  color?: AccentVar;
  /** start selected */
  selected?: boolean;
  /** show the remove × */
  removable?: boolean;
}
export interface ChipsetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  chips: ChipSpec[];
  /** 'multi' (default) or 'single' selection */
  mode?: 'single' | 'multi';
  /** live summary line under the chips */
  summary?: HtmlString;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── kbd ── keyboard key-caps shown in context lines (hover a shortcut → highlight) ── */
export interface ShortcutSpec {
  /** the keys, e.g. ["⌘","K"] or ["Ctrl","⇧","P"] */
  keys: string[];
  /** what the shortcut does */
  label: string;
  icon?: IconKey;
}
export interface KbdProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  shortcuts: ShortcutSpec[];
  /** index of the row highlighted by default */
  active?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── codeblock ── language label + line numbers + real syntax highlighting + copy button ── */
export type CodeTokenKind = 'kw' | 'str' | 'num' | 'fn' | 'comment' | 'punct' | 'var' | 'type';
export interface CodeToken {
  text: string;
  kind?: CodeTokenKind;
}
/** a source line is a sequence of colored tokens (legacy pre-tokenized form) */
export type CodeLine = CodeToken[];
export interface CodeblockProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** language chip, e.g. "tsx" */
  lang?: string;
  /** optional file name shown in the chrome */
  filename?: string;
  /** raw source — the preferred form; highlighted client-side via Shiki. */
  code?: string;
  /** pre-tokenized lines (legacy fallback) — used only when `code` is absent. */
  lines?: CodeLine[];
  /** show line-number gutter (default true) */
  lineNumbers?: boolean;
  /** lines to highlight (1-based), e.g. [3] */
  highlight?: number[];
  /**
   * Show the isolated Run control only when this is a complete, dependency-free snippet.
   * Imports, browser/DOM APIs, server globals, and fragments that depend on omitted setup are not
   * runnable. Default false so a code listing never promises execution it cannot deliver.
   */
  runnable?: boolean;
  footer?: HtmlString;
}

/* ── banner ── full-width app banner (info/success/warning/promo) + action + dismiss ── */
export type BannerTone = 'info' | 'success' | 'warning' | 'promo';
export interface BannerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tone?: BannerTone;
  /** banner icon (defaults per tone) */
  bannerIcon?: IconKey;
  /** the headline shown in the banner */
  message: HtmlString;
  /** secondary text under the message */
  detail?: HtmlString;
  /** primary action label (click → confirmed state) */
  action?: string;
  /** allow dismiss (×) — default true */
  dismissible?: boolean;
  footer?: HtmlString;
}

/* ── toaststack ── stacked toasts w/ auto-dismiss progress bar (button pushes another) ── */
export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface ToastSpec {
  kind?: ToastKind;
  title: string;
  desc?: HtmlString;
  icon?: IconKey;
}
export interface ToaststackProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** toasts shown initially */
  toasts: ToastSpec[];
  /** pool the "push" button cycles through */
  pool?: ToastSpec[];
  /** auto-dismiss duration in ms (0 = never) */
  duration?: number;
  /** label for the push button */
  pushLabel?: string;
  footer?: HtmlString;
}

/* ── spinner ── spinner styles/sizes + indeterminate bar + a loading button ── */
export interface SpinnerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label under the showcase */
  caption?: HtmlString;
  /** loading-button text (idle state) */
  buttonLabel?: string;
  /** loading-button text (busy state) */
  loadingLabel?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── notification ── notification list w/ avatar/icon, time-ago, unread dot, actions ── */
export interface NotificationItem {
  /** initials for the avatar (else the icon is used) */
  avatar?: string;
  icon?: IconKey;
  color?: AccentVar;
  /** title — may carry <strong> emphasis */
  title: HtmlString;
  /** relative time, e.g. "2m" */
  time?: string;
  /** start unread */
  unread?: boolean;
}
export interface NotificationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: NotificationItem[];
  /** label for the mark-all-read action */
  markAllLabel?: string;
  footer?: HtmlString;
}

export type DisplayBlock =
  | (BlockBase & { type: 'avatar'; props: AvatarProps })
  | (BlockBase & { type: 'avatargroup'; props: AvatargroupProps })
  | (BlockBase & { type: 'badgeset'; props: BadgesetProps })
  | (BlockBase & { type: 'chipset'; props: ChipsetProps })
  | (BlockBase & { type: 'kbd'; props: KbdProps })
  | (BlockBase & { type: 'codeblock'; props: CodeblockProps })
  | (BlockBase & { type: 'banner'; props: BannerProps })
  | (BlockBase & { type: 'toaststack'; props: ToaststackProps })
  | (BlockBase & { type: 'spinner'; props: SpinnerProps })
  | (BlockBase & { type: 'notification'; props: NotificationProps });
