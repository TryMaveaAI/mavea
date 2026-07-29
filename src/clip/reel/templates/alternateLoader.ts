// One cached request shared by Remix intent preloading and every lazy finish component.
import { cachedImport } from '../../../lib/cachedImport';

export type AlternateFinishes = typeof import('./alternateFinishes');

export const preloadAlternateFinishes = cachedImport(
  (): Promise<AlternateFinishes> => import('./alternateFinishes'),
);
