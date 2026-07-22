import { entry, type BlockRegistry } from '../registry-types';
import { Progressbar } from './Progressbar';
import { Stepindicator } from './Stepindicator';
import { Statustimeline } from './Statustimeline';
import { Healthgrid } from './Healthgrid';
import { Emptystate } from './Emptystate';
import { Skeleton } from './Skeleton';
import { Sliderinput } from './Sliderinput';
import { Segmented } from './Segmented';
import { Rangefilter } from './Rangefilter';
import { Ratinginput } from './Ratinginput';
import { A11yAudit } from './A11yAudit';
import { PainScale } from './PainScale';
import { HabitTracker } from './HabitTracker';
import { StreakGrid } from './StreakGrid';
import { Litigationtimeline } from './Litigationtimeline';
import { BillTracker } from './BillTracker';
import { Triageboard } from './Triageboard';
import { Mentalhealthscreen } from './Mentalhealthscreen';
import { Usabilityfindings } from './Usabilityfindings';
import { Roomblockdashboard } from './Roomblockdashboard';
import { ImmigrationCase } from './ImmigrationCase';
import type { StepindicatorProps } from './types';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** status family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const statusRegistry: BlockRegistry = {
  progressbar: entry(Progressbar),
  // stepindicator walks itself through its steps while the tour spotlights it → needs `spotlight`.
  stepindicator: (p, c) => (
    <Stepindicator {...(p as StepindicatorProps)} delay={c.delay} spotlight={c.spotlight} />
  ),
  statustimeline: entry(Statustimeline),
  healthgrid: entry(Healthgrid),
  emptystate: entry(Emptystate),
  skeleton: entry(Skeleton),
  sliderinput: entry(Sliderinput),
  segmented: entry(Segmented),
  rangefilter: entry(Rangefilter),
  ratinginput: entry(Ratinginput),
  a11yaudit: entry(A11yAudit),
  painscale: entry(PainScale),
  habittracker: entry(HabitTracker),
  streakgrid: entry(StreakGrid),
  litigationtimeline: entry(Litigationtimeline),
  billtracker: entry(BillTracker),
  triageboard: entry(Triageboard),
  mentalhealthscreen: entry(Mentalhealthscreen),
  usabilityfindings: entry(Usabilityfindings),
  roomblockdashboard: entry(Roomblockdashboard),
  immigrationcase: entry(ImmigrationCase),
};
