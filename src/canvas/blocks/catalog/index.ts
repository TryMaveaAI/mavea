// Public surface of the component catalog: the metadata contract, the compact facts index (always
// resident), the lazy detail loader, and the merged lookup. RAW_CATALOG is deliberately NOT exported
// here — importing it pulls in every family and defeats the lazy split; tooling and tests reach for
// './catalog.data' explicitly.
export * from './meta';
export { catalogMeta } from './lookup';
export {
  CATALOG_FACTS,
  catalogFacts,
  familyOf,
  type ComponentFacts,
  type ComponentDetail,
} from './facts';
export {
  ensureDetails,
  ensureAllDetails,
  detailFor,
  detailsReady,
  shardOf,
  SHARD_COUNT,
} from './details';
