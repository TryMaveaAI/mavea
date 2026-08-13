import { entry, type BlockRegistry } from '../registry-types';
import { EtymTree } from './EtymTree';
import { FactSheet } from './FactSheet';
import { HazardCard } from './HazardCard';
import { NewsDigest } from './NewsDigest';
import { Translation } from './Translation';
import { Pronunciation } from './Pronunciation';
import { Dictionary } from './Dictionary';
import { Gloss } from './Gloss';
import { ScaleFelt } from './ScaleFelt';
import { HearIt } from './HearIt';
import { IpaChart } from './IpaChart';
import { ScriptStroke } from './ScriptStroke';
import { PhonicsWord } from './PhonicsWord';
import { PosBreakdown } from './PosBreakdown';
import { SpeciesCard } from './SpeciesCard';
import { TermBase } from './TermBase';
import { SizeCompare } from './SizeCompare';
import { BaseConversion } from './BaseConversion';
import { HistoricalPerson } from './HistoricalPerson';
import { OnThisDay } from './OnThisDay';
import { CountryCard } from './CountryCard';
import { WorldGrid } from './WorldGrid';
import { WarConflict } from './WarConflict';
import { DistinctionCard } from './DistinctionCard';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** reference family registry — wave-1: FactSheet, NewsDigest, Translation, Pronunciation;
 *  wave-2: Dictionary;
 *  wave-3: Gloss;
 *  wave-4: ScaleFelt, HearIt, IpaChart, ScriptStroke;
 *  wave-5: PhonicsWord;
 *  wave-6: SpeciesCard;
 *  wave-7: HazardCard;
 *  wave-8: TermBase, SizeCompare, BaseConversion, HistoricalPerson, OnThisDay,
 *          CountryCard, WorldGrid, WarConflict;
 *  wave-9: PosBreakdown;
 *  wave-10: DistinctionCard */
export const referenceRegistry: BlockRegistry = {
  // ── wave 1: real components ──────────────────────────────────────────────

  factsheet: entry(FactSheet),
  newsdigest: entry(NewsDigest),

  // ── wave 2 ───────────────────────────────────────────────────────────────

  dictionary: entry(Dictionary),

  translation: entry(Translation),

  pronunciation: entry(Pronunciation),

  // ── wave 3 ───────────────────────────────────────────────────────────────

  gloss: entry(Gloss),
  scalefelt: entry(ScaleFelt),
  hearit: entry(HearIt),

  // ── wave 4 ───────────────────────────────────────────────────────────────

  ipachart: entry(IpaChart),
  scriptstroke: entry(ScriptStroke),

  // ── wave 5 ───────────────────────────────────────────────────────────────

  phonicsword: entry(PhonicsWord),

  // ── wave 6 ───────────────────────────────────────────────────────────────

  speciescard: entry(SpeciesCard),
  etymtree: entry(EtymTree),

  // ── wave 7 ──────────────────────────────────────────────────────────────

  hazardcard: entry(HazardCard),

  // ── wave 8 ──────────────────────────────────────────────────────────────

  termbase: entry(TermBase),
  sizecompare: entry(SizeCompare),
  baseconversion: entry(BaseConversion),
  historicalperson: entry(HistoricalPerson),
  onthisday: entry(OnThisDay),
  countrycard: entry(CountryCard),
  worldgrid: entry(WorldGrid),
  warconflict: entry(WarConflict),

  // ── wave 9 ──────────────────────────────────────────────────────────────

  posbreakdown: entry(PosBreakdown),

  // ── wave 10 ─────────────────────────────────────────────────────────────

  distinctioncard: entry(DistinctionCard),
};
