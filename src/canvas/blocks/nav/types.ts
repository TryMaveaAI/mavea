// nav family block types — 10 premium, heavily-interactive navigation components.
// Prop shapes are realistic & sample-friendly (the data agent fills them later).
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared
// file we must not edit), so import it from its canonical source — same type, identical
// to what `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── navbar ── top app nav bar: brand, links (active item), search, avatar/actions ── */
export interface NavbarLink {
  label: string;
  icon?: IconKey;
  /** badge count shown on the link, e.g. 3 */
  badge?: number;
}
export interface NavbarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** brand wordmark shown left of the links */
  brand: string;
  /** brand glyph (defaults to 'spark') */
  brandIcon?: IconKey;
  links: NavbarLink[];
  /** index of the active link (default 0) */
  active?: number;
  /** placeholder for the search field */
  searchPlaceholder?: string;
  /** initials shown in the avatar pill, e.g. "AM" */
  avatar?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── sidenav ── grouped sidebar nav with icons, active state, collapse toggle ── */
export interface SidenavItem {
  label: string;
  icon?: IconKey;
  /** badge count, e.g. 12 */
  badge?: number;
}
export interface SidenavGroup {
  /** section heading, e.g. "Workspace" */
  heading?: string;
  items: SidenavItem[];
}
export interface SidenavProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  brand?: string;
  brandIcon?: IconKey;
  groups: SidenavGroup[];
  /** "groupIndex.itemIndex" of the active item (default "0.0") */
  active?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── breadcrumb ── trail with separators + an overflow "…" menu when long ── */
export interface CrumbItem {
  label: string;
  icon?: IconKey;
}
export interface BreadcrumbProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: CrumbItem[];
  /** collapse to "…" when there are more than this many crumbs (default 4) */
  maxVisible?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── pagination ── first/prev, numbered pages w/ ellipsis, next/last — live page ── */
export interface PaginationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** total number of pages */
  total: number;
  /** initial current page (1-based, default 1) */
  page?: number;
  /** how many page buttons to keep around the current one (default 1) */
  siblings?: number;
  /** noun for the summary line, e.g. "results" */
  unitLabel?: string;
  /** items per page, used for the "showing X–Y of Z" line */
  perPage?: number;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── menubar ── application menu bar (File/Edit/View) — click opens its dropdown ── */
export interface MenuEntry {
  label: string;
  icon?: IconKey;
  /** keyboard shortcut hint, e.g. "⌘S" */
  shortcut?: string;
  /** render a separator below this entry */
  divider?: boolean;
  /** dim / disable this entry */
  disabled?: boolean;
}
export interface MenuColumn {
  label: string;
  entries: MenuEntry[];
}
export interface MenubarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  menus: MenuColumn[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── megamenu ── nav item that opens a multi-column mega-menu panel on hover ── */
export interface MegaLink {
  label: string;
  icon?: IconKey;
  /** one-line description under the label */
  desc?: string;
  /** mark as a highlighted / new item */
  badge?: string;
}
export interface MegaColumn {
  heading: string;
  links: MegaLink[];
}
export interface MegamenuProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the nav items shown in the bar; the `trigger`-th opens the panel */
  tabs: string[];
  /** index of the tab that owns the mega panel (default 0) */
  trigger?: number;
  columns: MegaColumn[];
  /** optional promo card shown on the right of the panel */
  promoTitle?: string;
  promoCopy?: HtmlString;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── toolbar ── formatting toolbar: grouped icon buttons, dividers, pressed states ── */
export interface ToolButton {
  /** icon glyph for the button */
  icon: IconKey;
  /** accessible label / tooltip text */
  label: string;
  /** toggle button that stays pressed (e.g. Bold) */
  toggle?: boolean;
  /** initially pressed (for toggles) */
  on?: boolean;
}
export interface ToolGroup {
  buttons: ToolButton[];
}
export interface ToolbarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  groups: ToolGroup[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── commandbar ── contextual action bar for selected items (count + actions) ── */
export interface CommandAction {
  label: string;
  icon?: IconKey;
  /** style the action as destructive (red) */
  danger?: boolean;
}
export interface CommandbarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** noun for the selection, e.g. "item" / "file" */
  noun?: string;
  /** total selectable items, used to drive the live selected count */
  totalItems?: number;
  /** initially selected count (default 3) */
  selected?: number;
  /** sample rows shown above the bar (clicking a row toggles its selection) */
  rows?: { label: string; meta?: string; icon?: IconKey }[];
  actions: CommandAction[];
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── treeview ── file/folder tree: expand/collapse, selection, nesting, icons ── */
export interface TreeNode {
  label: string;
  /** icon override; folders default to layers, leaves to doc */
  icon?: IconKey;
  /** start expanded (folders only) */
  open?: boolean;
  /** trailing meta, e.g. "12 KB" */
  meta?: string;
  children?: TreeNode[];
}
export interface TreeviewProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: TreeNode[];
  /** label of the initially-selected node */
  selected?: string;
  color?: AccentVar;
  footer?: HtmlString;
}

/* ── bottomnav ── mobile bottom navigation bar (icons + labels + active indicator) ── */
export interface BottomTab {
  label: string;
  icon: IconKey;
  /** badge count / dot, e.g. 2 */
  badge?: number;
}
export interface BottomnavProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tabs: BottomTab[];
  /** index of the active tab (default 0) */
  active?: number;
  /** optional preview headline that swaps per tab */
  screens?: string[];
  color?: AccentVar;
  footer?: HtmlString;
}

export type NavBlock =
  | (BlockBase & { type: 'navbar'; props: NavbarProps })
  | (BlockBase & { type: 'sidenav'; props: SidenavProps })
  | (BlockBase & { type: 'breadcrumb'; props: BreadcrumbProps })
  | (BlockBase & { type: 'pagination'; props: PaginationProps })
  | (BlockBase & { type: 'menubar'; props: MenubarProps })
  | (BlockBase & { type: 'megamenu'; props: MegamenuProps })
  | (BlockBase & { type: 'toolbar'; props: ToolbarProps })
  | (BlockBase & { type: 'commandbar'; props: CommandbarProps })
  | (BlockBase & { type: 'treeview'; props: TreeviewProps })
  | (BlockBase & { type: 'bottomnav'; props: BottomnavProps });
