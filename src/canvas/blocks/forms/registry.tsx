import { entry, type BlockRegistry } from '../registry-types';
import { Blanks } from './Blanks';
import { Buttonbar } from './Buttonbar';
import { Textfield } from './Textfield';
import { Textarea } from './Textarea';
import { Select } from './Select';
import { Combobox } from './Combobox';
import { Checkboxgroup } from './Checkboxgroup';
import { Radiogroup } from './Radiogroup';
import { Switchset } from './Switchset';
import { Togglegroup } from './Togglegroup';
import { Otp } from './Otp';
import { Actionchecklist } from './Actionchecklist';
import { Preflightchecklist } from './Preflightchecklist';
import { Estateplanchecklist } from './Estateplanchecklist';
import { Visachecklist } from './Visachecklist';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** forms family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const formsRegistry: BlockRegistry = {
  blanks: entry(Blanks),
  buttonbar: entry(Buttonbar),
  textfield: entry(Textfield),
  textarea: entry(Textarea),
  select: entry(Select),
  combobox: entry(Combobox),
  checkboxgroup: entry(Checkboxgroup),
  radiogroup: entry(Radiogroup),
  switchset: entry(Switchset),
  togglegroup: entry(Togglegroup),
  otp: entry(Otp),
  actionchecklist: entry(Actionchecklist),
  preflightchecklist: entry(Preflightchecklist),
  estateplanchecklist: entry(Estateplanchecklist),
  visachecklist: entry(Visachecklist),
};
