// families.ts — the gallery's ordered, human-labelled grouping of the block library.
// Each entry pairs a family id (the on-disk folder name under canvas/blocks/) with the
// per-family registry whose keys ARE that family's block types. The list is curated for
// a readable display ORDER and section LABELS, so it is hand-maintained — but it must not
// silently drift: tests/component-protocol.test.ts fails if a family folder ships without
// an entry here. Any type not owned by a family is a built-in renderer, grouped as 'core'.
import { charts1Registry } from '../canvas/blocks/charts1/registry';
import { charts2Registry } from '../canvas/blocks/charts2/registry';
import { diagramsRegistry } from '../canvas/blocks/diagrams/registry';
import { statsRegistry } from '../canvas/blocks/stats/registry';
import { tablesRegistry } from '../canvas/blocks/tables/registry';
import { flowsRegistry } from '../canvas/blocks/flows/registry';
import { docsRegistry } from '../canvas/blocks/docs/registry';
import { referenceRegistry } from '../canvas/blocks/reference/registry';
import { aiRegistry } from '../canvas/blocks/ai/registry';
import { briefsRegistry } from '../canvas/blocks/briefs/registry';
import { mediaRegistry } from '../canvas/blocks/media/registry';
import { layoutRegistry } from '../canvas/blocks/layout/registry';
import { composeRegistry } from '../canvas/blocks/compose/registry';
import { everydayRegistry } from '../canvas/blocks/everyday/registry';
import { statusRegistry } from '../canvas/blocks/status/registry';
import { overlaysRegistry } from '../canvas/blocks/overlays/registry';
import { formsRegistry } from '../canvas/blocks/forms/registry';
import { pickersRegistry } from '../canvas/blocks/pickers/registry';
import { navRegistry } from '../canvas/blocks/nav/registry';
import { displayRegistry } from '../canvas/blocks/display/registry';
import { codeRegistry } from '../canvas/blocks/code/registry';
import { learnRegistry } from '../canvas/blocks/learn/registry';
import { dashboardRegistry } from '../canvas/blocks/dashboard/registry';
import { financeRegistry } from '../canvas/blocks/finance/registry';

/** A family id + the human label shown as the section heading in the gallery. */
export interface FamilyDef {
  id: string;
  label: string;
  registry: Record<string, unknown>;
}

/** Display order — data viz first, then content & knowledge, then the interface kit. */
export const FAMILIES: FamilyDef[] = [
  { id: 'charts1', label: 'Charts · hierarchy & flow', registry: charts1Registry },
  { id: 'charts2', label: 'Charts · trends & ranges', registry: charts2Registry },
  { id: 'diagrams', label: 'Diagrams & schematics', registry: diagramsRegistry },
  { id: 'learn', label: 'Learn · math & assessment', registry: learnRegistry },
  { id: 'stats', label: 'Stats & KPIs', registry: statsRegistry },
  { id: 'tables', label: 'Tables & matrices', registry: tablesRegistry },
  { id: 'flows', label: 'Flows & plans', registry: flowsRegistry },
  { id: 'media', label: 'Media & maps', registry: mediaRegistry },
  { id: 'docs', label: 'Documents & evidence', registry: docsRegistry },
  { id: 'reference', label: 'Reference & language', registry: referenceRegistry },
  { id: 'ai', label: 'AI & reasoning', registry: aiRegistry },
  { id: 'briefs', label: 'Applied briefs', registry: briefsRegistry },
  { id: 'layout', label: 'Layout & content', registry: layoutRegistry },
  { id: 'compose', label: 'Compose & messages', registry: composeRegistry },
  { id: 'everyday', label: 'Everyday & utilities', registry: everydayRegistry },
  { id: 'nav', label: 'Navigation', registry: navRegistry },
  { id: 'overlays', label: 'Overlays', registry: overlaysRegistry },
  { id: 'forms', label: 'Forms & inputs', registry: formsRegistry },
  { id: 'pickers', label: 'Pickers', registry: pickersRegistry },
  { id: 'status', label: 'Status & feedback', registry: statusRegistry },
  { id: 'display', label: 'Display', registry: displayRegistry },
  { id: 'code', label: 'Code & syntax', registry: codeRegistry },
  { id: 'dashboard', label: 'Living dashboards', registry: dashboardRegistry },
  { id: 'finance', label: 'Finance & Fundraising', registry: financeRegistry },
];
