// One cached request shared by Remix intent preloading and every lazy finish component.
export type AlternateFinishes = typeof import('./alternateFinishes');

let promise: Promise<AlternateFinishes> | undefined;

export function preloadAlternateFinishes(): Promise<AlternateFinishes> {
  promise ??= import('./alternateFinishes');
  return promise;
}
