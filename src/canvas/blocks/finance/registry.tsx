import { entry, type BlockRegistry } from '../registry-types';
import { VestingSchedule } from './VestingSchedule';
import { TermSheet } from './TermSheet';
import { FundraisingRounds } from './FundraisingRounds';
import { SaferTerms } from './SaferTerms';
import { DilutionWaterfall } from './DilutionWaterfall';
import { ThreeStatementLink } from './ThreeStatementLink';
import { YieldCurve } from './YieldCurve';
import { EfficientFrontier } from './EfficientFrontier';
import { BondLadder } from './BondLadder';
import { CashflowTimeline } from './CashflowTimeline';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** finance family registry — equity, fundraising, and fixed-income blocks. */
export const financeRegistry: BlockRegistry = {
  vestingschedule: entry(VestingSchedule),
  termsheet: entry(TermSheet),
  fundraisingrounds: entry(FundraisingRounds),
  saferterms: entry(SaferTerms),
  dilutionwaterfall: entry(DilutionWaterfall),
  threestatementlink: entry(ThreeStatementLink),
  yieldcurve: entry(YieldCurve),
  efficientfrontier: entry(EfficientFrontier),
  bondladder: entry(BondLadder),
  cashflowtimeline: entry(CashflowTimeline),
};
