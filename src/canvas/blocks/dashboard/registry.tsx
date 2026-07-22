import { entry, type BlockRegistry } from '../registry-types';
import { ThesisCard } from './ThesisCard';
import { AlignmentGauge } from './AlignmentGauge';
import { StandingAlerts } from './StandingAlerts';
import { SourcesLineage } from './SourcesLineage';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** dashboard family registry — the four bespoke living-dashboard widgets. Rendered by the Dashboards
 *  surface (and exercised in the gallery); kept out of the model's selection catalog. */
export const dashboardRegistry: BlockRegistry = {
  thesis: entry(ThesisCard),
  alignmentgauge: entry(AlignmentGauge),
  standingalerts: entry(StandingAlerts),
  sourceslineage: entry(SourcesLineage),
};
