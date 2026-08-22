// blocks/index.ts — assembles the extended component library (23 families, ~575 components).
// Each family fills its own types.ts / registry.tsx / *.tsx / styles.css (disjoint).
//
// This static merge is for the surfaces that genuinely want EVERYTHING at once — the gallery,
// the export/figure path, and the test suites. A canvas render must never import it: TopicCanvas
// resolves blocks through ./loader (per-family chunks) so an answer only downloads the families
// it uses. Family CSS moved into each family's registry so it rides that family's chunk.
import type { BlockRegistry } from './registry-types';

import { charts1Registry } from './charts1/registry';
import { charts2Registry } from './charts2/registry';
import { statsRegistry } from './stats/registry';
import { tablesRegistry } from './tables/registry';
import { flowsRegistry } from './flows/registry';
import { docsRegistry } from './docs/registry';
import { aiRegistry } from './ai/registry';
import { mediaRegistry } from './media/registry';
import { layoutRegistry } from './layout/registry';
import { statusRegistry } from './status/registry';
import { overlaysRegistry } from './overlays/registry';
import { formsRegistry } from './forms/registry';
import { pickersRegistry } from './pickers/registry';
import { navRegistry } from './nav/registry';
import { displayRegistry } from './display/registry';
import { diagramsRegistry } from './diagrams/registry';
import { learnRegistry } from './learn/registry';
import { composeRegistry } from './compose/registry';
import { everydayRegistry } from './everyday/registry';
import { referenceRegistry } from './reference/registry';
import { codeRegistry } from './code/registry';
import { dashboardRegistry } from './dashboard/registry';
import { financeRegistry } from './finance/registry';

import type { Charts1Block } from './charts1/types';
import type { Charts2Block } from './charts2/types';
import type { StatsBlock } from './stats/types';
import type { TablesBlock } from './tables/types';
import type { FlowsBlock } from './flows/types';
import type { DocsBlock } from './docs/types';
import type { AiBlock } from './ai/types';
import type { MediaBlock } from './media/types';
import type { LayoutBlock } from './layout/types';
import type { StatusBlock } from './status/types';
import type { OverlaysBlock } from './overlays/types';
import type { FormsBlock } from './forms/types';
import type { PickersBlock } from './pickers/types';
import type { NavBlock } from './nav/types';
import type { DisplayBlock } from './display/types';
import type { DiagramsBlock } from './diagrams/types';
import type { LearnBlock } from './learn/types';
import type { ComposeBlock } from './compose/types';
import type { EverydayBlock } from './everyday/types';
import type { ReferenceBlock } from './reference/types';
import type { CodeBlock } from './code/types';
import type { DashboardBlock } from './dashboard/types';
import type { FinanceBlock } from './finance/types';

export type ExtendedBlock =
  | Charts1Block
  | Charts2Block
  | StatsBlock
  | TablesBlock
  | FlowsBlock
  | DocsBlock
  | AiBlock
  | MediaBlock
  | LayoutBlock
  | StatusBlock
  | OverlaysBlock
  | FormsBlock
  | PickersBlock
  | NavBlock
  | DisplayBlock
  | DiagramsBlock
  | LearnBlock
  | ComposeBlock
  | EverydayBlock
  | ReferenceBlock
  | CodeBlock
  | DashboardBlock
  | FinanceBlock;

export const EXTENDED_REGISTRY: BlockRegistry = {
  ...charts1Registry,
  ...charts2Registry,
  ...statsRegistry,
  ...tablesRegistry,
  ...flowsRegistry,
  ...docsRegistry,
  ...aiRegistry,
  ...mediaRegistry,
  ...layoutRegistry,
  ...statusRegistry,
  ...overlaysRegistry,
  ...formsRegistry,
  ...pickersRegistry,
  ...navRegistry,
  ...displayRegistry,
  ...diagramsRegistry,
  ...learnRegistry,
  ...composeRegistry,
  ...everydayRegistry,
  ...referenceRegistry,
  ...codeRegistry,
  ...dashboardRegistry,
  ...financeRegistry,
};

export type { BlockRegistry } from './registry-types';
