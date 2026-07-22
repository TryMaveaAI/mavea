/** Time-of-day greeting ("Good morning/afternoon/evening"). Pure + testable; kept out of the
 *  component file so fast-refresh stays happy. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The friend's spoken hello for a returning visit — warm, brief, and lightly inviting (it nudges
 *  the user to actually talk to Mavéa). One short line so it stays lean and unobtrusive. */
export function welcomeBackLine(hour: number): string {
  return `${greetingFor(hour)}. What can I help you explore?`;
}
