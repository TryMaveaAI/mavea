import {
  chooseComponents,
  menuFor,
  type SelectionInput,
  type SelectionResult,
} from '../../src/live/select';

/** The synchronous equivalent of `selectComponents` for tests.
 *
 *  In the app, selection is sync over the compact facts index and only the prompt MENU needs the
 *  catalog's lazily-loaded detail fields, so `selectComponents` is async purely to await those
 *  shards. `tests/setup.ts` preloads them all, so the same two steps compose synchronously
 *  here — same code paths, no `await` threaded through several hundred assertions. The async wrapper
 *  and the laziness it exists for are covered directly by `tests/catalog-index.test.ts`. */
export function select(input: SelectionInput): SelectionResult {
  const choice = chooseComponents(input);
  return {
    types: choice.types,
    promptSnippet: menuFor(choice),
    allowed: choice.allowed,
    bestFit: choice.bestFit,
  };
}
