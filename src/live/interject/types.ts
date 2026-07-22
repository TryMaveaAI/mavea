// Interjections — the small, occasional moments where Mavéa steps into the conversation on its
// own (not in answer to a question): a clip was shared, a fact was remembered, a new topic began.
// These are event-driven and local — no model call, no fabricated content — so the presence reads
// as a participant rather than a corner widget. The vocabulary of "moments" lives here.

/** A real product moment that may prompt Mavéa to speak up. */
export type MomentType = 'clipShared'; // the user just exported/shared a replay clip
