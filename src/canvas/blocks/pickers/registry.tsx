import { entry, type BlockRegistry } from '../registry-types';
import { Datepicker } from './Datepicker';
import { Calendarpick } from './Calendarpick';
import { Daterange } from './Daterange';
import { Timepicker } from './Timepicker';
import { Colorpicker } from './Colorpicker';
import { Fileupload } from './Fileupload';
import { Tagsinput } from './Tagsinput';
import { Numberstepper } from './Numberstepper';
import { Searchselect } from './Searchselect';
import { Formpanel } from './Formpanel';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** pickers family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const pickersRegistry: BlockRegistry = {
  datepicker: entry(Datepicker),
  calendarpick: entry(Calendarpick),
  daterange: entry(Daterange),
  timepicker: entry(Timepicker),
  colorpicker: entry(Colorpicker),
  fileupload: entry(Fileupload),
  tagsinput: entry(Tagsinput),
  numberstepper: entry(Numberstepper),
  searchselect: entry(Searchselect),
  formpanel: entry(Formpanel),
};
