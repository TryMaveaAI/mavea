import { entry, type BlockRegistry } from '../registry-types';
import { Modal } from './Modal';
import { Confirmdialog } from './Confirmdialog';
import { Drawer } from './Drawer';
import { Sheet } from './Sheet';
import { Popover } from './Popover';
import { Hovercard } from './Hovercard';
import { Tooltip } from './Tooltip';
import { Menu } from './Menu';
import { Contextmenu } from './Contextmenu';
import { Commandk } from './Commandk';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** overlays family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const overlaysRegistry: BlockRegistry = {
  modal: entry(Modal),
  confirmdialog: entry(Confirmdialog),
  drawer: entry(Drawer),
  sheet: entry(Sheet),
  popover: entry(Popover),
  hovercard: entry(Hovercard),
  tooltip: entry(Tooltip),
  menu: entry(Menu),
  contextmenu: entry(Contextmenu),
  commandk: entry(Commandk),
};
