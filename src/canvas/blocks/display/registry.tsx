import { entry, type BlockRegistry } from '../registry-types';
import { Avatar } from './Avatar';
import { Avatargroup } from './Avatargroup';
import { Badgeset } from './Badgeset';
import { Chipset } from './Chipset';
import { Kbd } from './Kbd';
import { Codeblock } from './Codeblock';
import { Banner } from './Banner';
import { Toaststack } from './Toaststack';
import { Spinner } from './Spinner';
import { Notification } from './Notification';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** display family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const displayRegistry: BlockRegistry = {
  avatar: entry(Avatar),
  avatargroup: entry(Avatargroup),
  badgeset: entry(Badgeset),
  chipset: entry(Chipset),
  kbd: entry(Kbd),
  codeblock: entry(Codeblock),
  banner: entry(Banner),
  toaststack: entry(Toaststack),
  spinner: entry(Spinner),
  notification: entry(Notification),
};
