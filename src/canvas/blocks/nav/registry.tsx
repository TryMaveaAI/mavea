import { entry, type BlockRegistry } from '../registry-types';
import { Navbar } from './Navbar';
import { Sidenav } from './Sidenav';
import { Breadcrumb } from './Breadcrumb';
import { Pagination } from './Pagination';
import { Menubar } from './Menubar';
import { Megamenu } from './Megamenu';
import { Toolbar } from './Toolbar';
import { Commandbar } from './Commandbar';
import { Treeview } from './Treeview';
import { Bottomnav } from './Bottomnav';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** nav family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const navRegistry: BlockRegistry = {
  navbar: entry(Navbar),
  sidenav: entry(Sidenav),
  breadcrumb: entry(Breadcrumb),
  pagination: entry(Pagination),
  menubar: entry(Menubar),
  megamenu: entry(Megamenu),
  toolbar: entry(Toolbar),
  commandbar: entry(Commandbar),
  treeview: entry(Treeview),
  bottomnav: entry(Bottomnav),
};
