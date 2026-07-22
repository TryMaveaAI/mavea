// The default, token-driven layout for every slide kind. A skin overrides only the few it draws
// differently; SlideStage resolves `skin.layouts[kind] ?? SHARED_LAYOUTS[kind]`.
import type { SlideLayoutMap } from '../types';
import { Chart, Comparison, DataTable, KeyFigure } from './data';
import { Agenda, Process, Roadmap } from './lists';
import { FullBleed, TeamGrid } from './media';
import { Figure } from './figure';
import { Closing, Cover, Prose, Quote, SectionDivider } from './structural';

export const SHARED_LAYOUTS: SlideLayoutMap = {
  cover: Cover,
  sectionDivider: SectionDivider,
  agenda: Agenda,
  keyFigure: KeyFigure,
  comparison: Comparison,
  dataTable: DataTable,
  roadmap: Roadmap,
  process: Process,
  chart: Chart,
  figure: Figure,
  quote: Quote,
  teamGrid: TeamGrid,
  fullBleed: FullBleed,
  prose: Prose,
  closing: Closing,
};
