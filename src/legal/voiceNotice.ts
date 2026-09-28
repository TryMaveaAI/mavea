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
  title: 'Speech may be shared with providers',
  body: 'Microphone audio is processed by the speech-to-text service this deployment uses (on this computer by default, though it may be a remote service), and the resulting transcript may be sent to the model provider you select. Remote operators may log or retain this data under their own terms. You are responsible for avoiding sensitive conversations and for obtaining any consent required from others before listening begins.',
} as const;
