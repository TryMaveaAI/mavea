// The one feature notice the app's ROOT needs.
//
// Its own module because main.tsx statically imports LegalGate, and LegalGate quoted this notice
// out of FEATURE_NOTICE_COPY — a record of prose for every feature Mavéa has. A bundler can drop an
// unused export but not an unused property, so reading one entry pinned all of them into the eager
// landing chunk, on a page that renders none of the surfaces they describe. Same reasoning as
// live/welcome/startWithIds: one string is not worth a whole catalogue's weight on first paint.
//
// featureRiskAudit imports this rather than restating it, so the gate and the listening surfaces
// cannot drift into telling a reader two different things about their microphone.
export const VOICE_DATA_NOTICE = {
  title: 'Speech can become provider data',
  body: 'Microphone audio is sent to the speech-transcription endpoint configured by this deployment, and the resulting transcript may be sent to your selected model provider. Endpoint operators may log or retain data under their own terms. Avoid sensitive conversations and get any consent required from nearby people before listening starts.',
} as const;
