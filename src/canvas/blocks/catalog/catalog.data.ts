// catalog.data.ts — the whole component catalog, eagerly assembled.
//
// This module exists for TOOLING and TESTS: the index generator (`pnpm gen:catalog`) reads it to
// emit the compact facts index, and the migration/staleness suites deep-compare against it. The APP
// must never import it — pulling every family in defeats the lazy split and re-pins the full detail
// payload (72% of the catalog's bytes) into the first turn. `tests/eager-bundle.test.ts` enforces
// that; reach for `catalog/facts` (compact, always loaded) or `catalog/details` (lazy) instead.
//
// Family files are the authoring home; the order below — families alphabetically, entries in file
// order — is the canonical RAW_CATALOG order the facts index is generated in.
import type { ComponentCatalog } from './meta';

import { CATALOG_AI } from './families/ai';
import { CATALOG_CHARTS1 } from './families/charts1';
import { CATALOG_CHARTS2 } from './families/charts2';
import { CATALOG_CODE } from './families/code';
import { CATALOG_COMPOSE } from './families/compose';
import { CATALOG_CORE } from './families/core';
import { CATALOG_DIAGRAMS } from './families/diagrams';
import { CATALOG_DISPLAY } from './families/display';
import { CATALOG_DOCS } from './families/docs';
import { CATALOG_EVERYDAY } from './families/everyday';
import { CATALOG_FINANCE } from './families/finance';
import { CATALOG_FLOWS } from './families/flows';
import { CATALOG_FORMS } from './families/forms';
import { CATALOG_LAYOUT } from './families/layout';
import { CATALOG_LEARN } from './families/learn';
import { CATALOG_MEDIA } from './families/media';
import { CATALOG_NAV } from './families/nav';
import { CATALOG_OVERLAYS } from './families/overlays';
import { CATALOG_PICKERS } from './families/pickers';
import { CATALOG_REFERENCE } from './families/reference';
import { CATALOG_STATS } from './families/stats';
import { CATALOG_STATUS } from './families/status';
import { CATALOG_TABLES } from './families/tables';

export const RAW_CATALOG: ComponentCatalog = [
  ...CATALOG_AI,
  ...CATALOG_CHARTS1,
  ...CATALOG_CHARTS2,
  ...CATALOG_CODE,
  ...CATALOG_COMPOSE,
  ...CATALOG_CORE,
  ...CATALOG_DIAGRAMS,
  ...CATALOG_DISPLAY,
  ...CATALOG_DOCS,
  ...CATALOG_EVERYDAY,
  ...CATALOG_FINANCE,
  ...CATALOG_FLOWS,
  ...CATALOG_FORMS,
  ...CATALOG_LAYOUT,
  ...CATALOG_LEARN,
  ...CATALOG_MEDIA,
  ...CATALOG_NAV,
  ...CATALOG_OVERLAYS,
  ...CATALOG_PICKERS,
  ...CATALOG_REFERENCE,
  ...CATALOG_STATS,
  ...CATALOG_STATUS,
  ...CATALOG_TABLES,
];
