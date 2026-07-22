// Teach-intent detection: some asks literally request the whiteboard treatment — "teach
// me", "walk me through" — and for those turns the pen points generously at every stop.
// Deliberately tight: ordinary questions ("explain X", "what is Y") stay in the default
// quiet mode where Mavéa only draws when a stop names a reason.
const TEACH_ASK =
  /\b(teach me|walk me through|tutor( me)?|step[- ]by[- ]step|like i'?m (five|5|a beginner|new))\b/i;

export function isTeachAsk(text: string | null | undefined): boolean {
  return !!text && TEACH_ASK.test(text);
}
