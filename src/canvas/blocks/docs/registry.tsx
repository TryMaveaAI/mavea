import { entry, type BlockRegistry } from '../registry-types';
import { Hypothesiscard } from './Hypothesiscard';
import { Docview } from './Docview';
import { Pdfreader } from './Pdfreader';
import { Annotateddoc } from './Annotateddoc';
import { Redline } from './Redline';
import { Citationchain } from './Citationchain';
import { Factcheck } from './Factcheck';
import { Confidencemeter } from './Confidencemeter';
import { Highlightsnippet } from './Highlightsnippet';
import { Annotcallouts } from './Annotcallouts';
import { Sourcelist } from './Sourcelist';
import { Claimgrid } from './Claimgrid';
import { Docoutline } from './Docoutline';
import { DiffViewer } from './DiffViewer';
import { ParallelText } from './ParallelText';
import { ClinicalTimeline } from './ClinicalTimeline';
import { ResearchSummary } from './ResearchSummary';
import { EligibilityCheck } from './EligibilityCheck';
import { EvidenceTrace } from './EvidenceTrace';
import { ReviewSynth } from './ReviewSynth';
import { Resume } from './Resume';
import { Changelog } from './Changelog';
import { Lessonplan } from './Lessonplan';
import { Casebrief } from './Casebrief';
import { Patentclaimchart } from './Patentclaimchart';
import { Storystructure } from './Storystructure';
import { Vetpatientchart } from './Vetpatientchart';
import { Scoutingreport } from './Scoutingreport';
import type { HighlightsnippetProps } from './types';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** docs family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const docsRegistry: BlockRegistry = {
  hypothesiscard: entry(Hypothesiscard),
  docview: entry(Docview),
  pdfreader: entry(Pdfreader),
  annotateddoc: entry(Annotateddoc),
  redline: entry(Redline),
  citationchain: entry(Citationchain),
  factcheck: entry(Factcheck),
  confidencemeter: entry(Confidencemeter),
  highlightsnippet: (p, c) => (
    <Highlightsnippet {...(p as HighlightsnippetProps)} delay={c.delay} />
  ),
  annotcallouts: entry(Annotcallouts),
  sourcelist: entry(Sourcelist),
  claimgrid: entry(Claimgrid),
  docoutline: entry(Docoutline),
  diffviewer: entry(DiffViewer),
  paralleltext: entry(ParallelText),
  clinicaltimeline: entry(ClinicalTimeline),
  researchsummary: entry(ResearchSummary),
  eligibilitycheck: entry(EligibilityCheck),
  evidencetrace: entry(EvidenceTrace),
  reviewsynth: entry(ReviewSynth),
  resume: entry(Resume),
  changelog: entry(Changelog),
  lessonplan: entry(Lessonplan),
  casebrief: entry(Casebrief),
  patentclaimchart: entry(Patentclaimchart),
  storystructure: entry(Storystructure),
  vetpatientchart: entry(Vetpatientchart),
  scoutingreport: entry(Scoutingreport),
};
