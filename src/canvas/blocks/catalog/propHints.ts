/** Recover a closed string enum from a catalog hint such as `"sin" | "cos" | "exp"`.
 * One quoted example is descriptive, not a closed set; two or more pipe-separated alternatives
 * form an enforceable vocabulary. Shared by validation and generated gallery stress contracts so
 * synthetic fixtures can never mutate a renderer discriminator. */
export function enumValuesFromHint(hint: string | undefined): ReadonlySet<string> | null {
  // Quoted examples separated by prose ("A", "B", or "C") are not an enum. Only the catalog's
  // explicit pipe vocabulary ("a" | "b") closes the set; otherwise valid fixture/model values
  // such as a person's relationship or an arbitrary magnitude would be rejected accidentally.
  if (!hint || !/\|\s*["']/.test(hint)) return null;
  // An "e.g." BEFORE the first quoted value marks the whole pipe list as illustrative
  // ('e.g. "TypeError"|"ValueError"') — enforcing it would reject every legitimate value the
  // example didn't happen to include. An "e.g." later in the hint is just descriptive prose
  // after a genuine vocabulary and doesn't reopen the set.
  const egAt = hint.indexOf('e.g.');
  if (egAt !== -1 && egAt < hint.search(/["']/)) return null;
  const values = [...hint.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  return values.length >= 2 ? new Set(values) : null;
}
