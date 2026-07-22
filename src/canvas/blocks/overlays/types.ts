// overlays family block types — 10 premium, heavily-interactive overlay primitives
// (modal, confirm, drawer, sheet, popover, hovercard, tooltip, menu, contextmenu, commandk).
// Each BLOCK is a `.card` with an inviting trigger; clicking opens the real overlay.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type.
import type { IconKey } from '../../../types/mavea';

/* shared shape for an actionable item across menus / command palette */
export interface OverlayAction {
  label: string;
  icon?: IconKey;
  /** right-aligned keyboard hint, e.g. "⌘K" */
  shortcut?: string;
  /** optional sub-caption (command palette) */
  hint?: string;
  /** render as a destructive (danger-colored) item */
  danger?: boolean;
}

/* ── modal ── trigger → centered modal dialog (title, body, footer, X, Esc) ── */
export interface ModalProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label on the card's trigger button */
  trigger?: string;
  triggerIcon?: IconKey;
  /** short description under the trigger */
  description?: HtmlString;
  /** dialog heading */
  heading?: string;
  /** dialog body copy (HTML) */
  body?: HtmlString;
  /** primary footer action label */
  confirm?: string;
  /** secondary footer action label */
  cancel?: string;
  color?: AccentVar;
}

/* ── confirmdialog ── destructive confirm (icon + Cancel + Confirm) ── */
export interface ConfirmdialogProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  /** alert heading, e.g. "Delete project?" */
  heading?: string;
  /** alert body warning copy */
  body?: HtmlString;
  /** glyph inside the alert badge */
  alertIcon?: IconKey;
  confirm?: string;
  cancel?: string;
  /** accent for the destructive action (defaults var(--danger)) */
  color?: AccentVar;
}

/* ── drawer ── trigger → right-side drawer (header, scroll body, footer) ── */
export interface DrawerRow {
  label: string;
  value?: string;
  icon?: IconKey;
}
export interface DrawerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  heading?: string;
  subhead?: string;
  /** scrollable rows in the drawer body */
  rows?: DrawerRow[];
  confirm?: string;
  cancel?: string;
  color?: AccentVar;
}

/* ── sheet ── trigger → bottom sheet (grabber, content, actions) ── */
export interface SheetOption {
  label: string;
  icon?: IconKey;
  /** mark as the recommended / selected option */
  selected?: boolean;
  meta?: string;
}
export interface SheetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  heading?: string;
  subhead?: string;
  /** tappable options in the sheet */
  options?: SheetOption[];
  color?: AccentVar;
}

/* ── popover ── anchored popover next to its trigger (arrow + content) ── */
export interface PopoverProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  heading?: string;
  /** popover body copy (HTML) */
  body?: HtmlString;
  /** little stat / value highlighted inside the popover */
  stat?: string;
  statLabel?: string;
  /** action button label inside the popover */
  action?: string;
  color?: AccentVar;
}

/* ── hovercard ── hover an @mention → rich preview after a small delay ── */
export interface HovercardStat {
  label: string;
  value: string;
}
export interface HovercardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the inline trigger text, e.g. "@maya.chen" */
  mention?: string;
  /** preceding sentence the mention sits inside */
  lead?: HtmlString;
  /** preview card name + handle + bio */
  name?: string;
  handle?: string;
  bio?: HtmlString;
  /** initials for the avatar */
  avatar?: string;
  stats?: HovercardStat[];
  action?: string;
  color?: AccentVar;
}

/* ── tooltip ── several elements with styled tooltips (4 placements) ── */
export type TipPlacement = 'top' | 'bottom' | 'left' | 'right';
export interface TooltipTarget {
  label: string;
  icon?: IconKey;
  /** tooltip copy */
  tip: string;
  placement?: TipPlacement;
}
export interface TooltipProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** prompt line above the targets */
  prompt?: HtmlString;
  targets?: TooltipTarget[];
  color?: AccentVar;
}

/* ── menu ── dropdown trigger → menu (items, icons, shortcuts, separators) ── */
export interface MenuItem {
  label: string;
  icon?: IconKey;
  shortcut?: string;
  /** insert a separator BEFORE this item */
  separator?: boolean;
  danger?: boolean;
}
export interface MenuProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  /** small label above the menu, e.g. an account email */
  menuLabel?: string;
  items?: MenuItem[];
  color?: AccentVar;
}

/* ── contextmenu ── right-click (or click) a target → context menu ── */
export interface ContextmenuProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label inside the right-clickable target zone */
  target?: string;
  targetIcon?: IconKey;
  description?: HtmlString;
  items?: MenuItem[];
  color?: AccentVar;
}

/* ── commandk ── ⌘K palette (search + grouped commands + ↑/↓ + Enter) ── */
export interface CommandGroup {
  label: string;
  commands: OverlayAction[];
}
export interface CommandkProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  trigger?: string;
  triggerIcon?: IconKey;
  description?: HtmlString;
  /** placeholder text in the palette search input */
  placeholder?: string;
  groups?: CommandGroup[];
  color?: AccentVar;
}

export type OverlaysBlock =
  | (BlockBase & { type: 'modal'; props: ModalProps })
  | (BlockBase & { type: 'confirmdialog'; props: ConfirmdialogProps })
  | (BlockBase & { type: 'drawer'; props: DrawerProps })
  | (BlockBase & { type: 'sheet'; props: SheetProps })
  | (BlockBase & { type: 'popover'; props: PopoverProps })
  | (BlockBase & { type: 'hovercard'; props: HovercardProps })
  | (BlockBase & { type: 'tooltip'; props: TooltipProps })
  | (BlockBase & { type: 'menu'; props: MenuProps })
  | (BlockBase & { type: 'contextmenu'; props: ContextmenuProps })
  | (BlockBase & { type: 'commandk'; props: CommandkProps });
