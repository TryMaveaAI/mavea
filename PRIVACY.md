# Mavéa Privacy Notice

Effective: September 3, 2026

This notice describes the current, unmodified local and self-hosted Mavéa software. It does not describe a future hosted service. Local-first does not mean every feature stays on your device: connected features send data through the deployment to third parties you choose. If a person or organization deploys Mavéa for others, that operator must provide any additional privacy notices and controls required for its deployment.

## 1. Who handles your information

The Mavéa Maintainers publish software. They do not receive your prompts or browser-local data merely because you install or run it. The person or organization hosting the copy you use is the **deployment operator**. When you self-host, you control that deployment and its logs, storage, configuration, and provider accounts.

Where data-protection law such as the GDPR or UK GDPR applies to a deployment, the deployment operator normally acts as the controller of personal data processed through it — that is you, when you self-host for yourself. The Maintainers are neither a controller nor a processor of that data, because it never reaches them.

The unmodified project has no Mavéa user-account system, first-party cloud database, advertising network, product-analytics service, telemetry, or conversation-retention service. Normal network requests can still be visible to the deployment host, infrastructure providers, and the third-party services described below. A modified or separately hosted deployment may behave differently, and its operator is responsible for disclosing any additional collection, logging, accounts, analytics, retention, or sharing it adds.

The current repository does not set analytics or advertising cookies and does not include first-party usage tracking. A modified deployment that adds cookies, analytics, advertising, or other tracking must disclose and manage those technologies separately.

## 2. Information kept in your browser or deployment

Depending on the features you use, browser storage may contain:

- conversations, saved canvases, bookmarks, memory items, and session history;
- courses, lessons, flashcards, quiz progress, Ripple analyses, and dashboards;
- the readings a dashboard has fetched over time, kept per tracked item as its own record so a value's history and the sites it came from survive between checks;
- preferences such as theme, performance, visual richness, voice, and setup state;
- drafts, tracked items, presentation settings, and recent feature state;
- provider and model configuration;
- remembered provider, search, or optional GitHub credentials;
- a short-lived cache of recent questions and the answers to them, kept on the device so that asking the same thing again does not bill your key a second time; it expires within a day, and it deliberately excludes any answer that drew on attachments, ink, filled-in blanks, cited sources, or your remembered facts (document text attached to a Prism or Synthesis map is kept separately — see the next entry);
- the map of a document you exploded with Prism or Synthesis — its claims and the extracted page text they are quoted against — kept on the device so re-opening the same file does not bill your key to read it again. It is filed under that file's identity and the model that read it, so it is only ever reused for the same document; it does not expire on a timer, because the mapping cannot go stale and re-running it would charge you for an identical result. It is bounded instead: the least recently opened entries are dropped once the store passes a fixed number of entries or a fixed total size. Clearing site data removes it;
- the margin notes Mavéa writes for an answer you opened in the Study, kept on the device against that answer and the model that wrote them, so returning to the same answer does not bill your key to write them again; it is bounded the same way the document maps above are, and clearing site data removes it;
- temporary in-progress and finished video-export files in origin-private browser storage until the export is consumed or discarded; and
- short-lived demo, tour, route, and in-progress session data.

Saved content is encrypted in browser storage only where the relevant feature and browser support it. Dashboards and the readings they fetch are encrypted with the same device key, the readings in IndexedDB with only their routing details — which tracked item, and when — left readable so they can be looked up. Course data, mastery and progress, some Ripple data and analysis caches, preferences, metadata, and fallback content can be stored in ordinary local storage or IndexedDB. Anyone who can use your unlocked device or browser profile, and malicious extensions or same-origin code, may be able to access browser data.

Because this browser data is encrypted to this specific browser, it does not carry over to a different browser, an incognito window, or another device. You can export a backup file of your dashboards, memory, flashcards, saved canvases, map, and courses, and import it elsewhere to move that data. A backup carries a dashboard's definition and its latest values, not its fetched reading history, so moving to another browser starts that history fresh. The backup is plain, unencrypted JSON under your control, so store and share it carefully; it deliberately excludes your provider and search keys. Importing a backup merges into existing data and never deletes it, and importing a file you did not create can add content from that file — import only backups you trust.

Browser and operating-system caches may retain application assets and optional voice models. The actions gateway may store connected-service credentials and configuration on the deployment operator's machine.

## 3. Credentials and connected-service tokens

Provider and search keys stay in memory until reload unless you choose Remember. When supported, Remember encrypts them with a non-extractable, device-bound browser key and stores ciphertext locally. Without the required browser cryptography, the unmodified app keeps them session-only rather than writing plaintext. Settings exports exclude provider and search keys.

Keys are decrypted when needed and pass through the deployment's same-origin proxy to the provider you selected. The proxy and its host can technically access credentials and content in transit. Browser encryption does not protect against an active compromise of the device, browser, extension, deployment, proxy, or provider.

The scope you grant is the boundary of what these features can read: a token that can reach private repositories lets any feature you run reach them too, and what it reads can then be sent to your selected model provider (see section 4). Review the scopes at the point of authorization, prefer read-only, and revoke a connection you are no longer using.

Optional GitHub and Google connections can store access tokens, refresh tokens, or repository settings in the actions gateway or its host configuration. The unmodified gateway writes persisted OAuth tokens to an owner-readable host file and keeps limited audit metadata, not request bodies or provider response text. Whoever runs the gateway controls that file, its backups, logs, deletion, and security.

The unmodified gateway has no separate Mavéa user accounts. On a shared deployment, everyone allowed to use action features may act through the deployment operator's connected GitHub or Google account. Use a dedicated, least-privilege gateway and do not expose it to people who should not share those permissions.

## 4. Prompts, files, code, and generated content

Text you type or paste, conversation context, remembered facts, attached files, extracted document text, images, repository content, diffs, search queries, and feature instructions may be sent through the deployment to the model, search, or connected provider needed for the feature you request. Responses and generated content return through the deployment to your browser.

Prism and Synthesis stage and extract supported files locally where possible, but relevant content can still be sent for analysis. Ripple can parse code locally before optional model enrichment sends relevant code or diffs. Local staging is not a promise that later analysis remains local.

Two of these flows do not wait for you to press anything, which is the part worth knowing. Features that watch something for you — tracked items, dashboards, and the morning brief — re-issue requests on the cadence you configure, so the same content and credentials go out again on a timer rather than only when you ask; most run only while Mavéa is open, and each run can bill your provider. And remembered facts are attached to later requests: something you told Mavéa once can be included in a request you make weeks afterwards, to whichever provider is selected at that time. You can review or forget remembered items, and turning a tracked item or a dashboard off stops its checks.

Connecting a code host is the same boundary, and it is worth stating plainly because the content is not something you typed: when you point Mavéa at a repository, the files, documentation, diffs, commit messages, issues, and other repository data a feature reads can be sent through the deployment to the model provider you selected. **A private repository is not treated differently from a public one** — if you grant a token or OAuth scope that can read private repositories, private source and internal documentation can leave your control the same way a pasted snippet does, and the provider's own retention and processing terms then apply to it. Grant the narrowest scope that makes the feature work, prefer read-only and a repository allowlist where your host offers one, use a dedicated account for shared deployments, and do not connect a repository whose contents you are not permitted to disclose to that provider.

## 5. Voice, microphone, speech, and reels

If you enable listening, the browser captures microphone input. Audio is processed by the deployment's configured speech-to-text endpoint — by default a local one on the same machine, though an operator can configure a different endpoint — which converts speech to text. Recognized transcripts may then be sent to your selected model provider, including while listening continues.

The browser sends captured audio to the speech-to-text endpoint configured by the deployment. The unmodified Mavéa client does not intentionally persist microphone audio itself and does not include it in later conversation-model requests; it sends the resulting transcript instead. A remote or modified speech endpoint, deployment proxy, infrastructure provider, browser extension, or operator can receive, log, or retain the audio under its own configuration and terms. Captured audio is discarded by the client as it is transcribed, and the microphone is released when you stop listening or the tab becomes hidden. The client does not intentionally create a voiceprint or identify speakers. In a listening mode, whatever is said near you can be transcribed too — see the Terms for your responsibilities toward other people.

Spoken answers send narration text to the configured text-to-speech service. Reel and conversation-video cuts are directed, rendered, and encoded in your browser; no model provider is called. Reel narration text is sent to the configured text-to-speech service. During a video export, encoded chunks and the finished clip may be held in origin-private browser storage so a large video does not have to remain in JavaScript memory. Normal cancellation, replacement, sharing, and download cleanup remove those temporary files; a download can retain its temporary file for up to 60 seconds while the browser takes ownership. A crash, forced close, or storage failure can interrupt cleanup and leave a temporary file behind. A later video export makes a bounded, best-effort pass that removes only Mavéa temporary video files more than 24 hours old; clearing the site's browser data also removes them. A finished export leaves Mavéa only when you save, publish, or send it to a destination you choose.

## 6. Services that can receive data

According to the feature and configuration you choose, recipients can include:

- Google Gemini, Anthropic Claude, OpenAI, xAI Grok, OpenRouter, or another model endpoint you configure;
- configured web-search providers and Wikipedia;
- the configured speech-to-text or text-to-speech service;
- GitHub, when you point Ripple at a repository;
- OpenFreeMap's tile host when you open a map, and Wikimedia's upload host for the small set of individually reviewed tour images; these requests expose ordinary network metadata such as your IP address and user agent to those hosts;
- the jsDelivr content-delivery network, from which the local command-line server downloads version-pinned voice-recognition assets once on first voice use and then serves them from its own cache; and
- the deployment host, reverse proxy, network, and infrastructure providers.

Those parties process data under their own terms and privacy notices. They may retain requests, use data for abuse prevention or service improvement, or process it in other countries according to your account settings and their policies. The Maintainers do not control those practices. Review each recipient's terms, retention, training, security, location, and deletion settings before use. Mavéa cannot delete data retained by those providers.

For OpenAI Responses requests, the unmodified client sends `store: false` to avoid optional response-object storage. That setting does not disable all OpenAI processing or retention; provider abuse-monitoring, safety, legal, account, and feature-specific retention can still apply. Other providers and custom endpoints have their own controls. Review the current provider documentation and your account settings rather than assuming that Mavéa can guarantee zero retention.

## 7. Why information is processed

Information is processed only as needed to:

- provide the feature you request and return results;
- save state and preferences on your device;
- authenticate to providers and connected services you configure;
- perform an external action after the required confirmation;
- protect a deployment, enforce limits, diagnose failures, and prevent abuse; or
- comply with law or protect rights and safety where legally required.

The unmodified project does not sell personal information or use it for cross-context behavioral advertising. A deployment operator must separately disclose any different purpose it introduces.

## 8. Retention and deletion

Memory-only values disappear on reload. Session storage generally remains until the tab or browser session ends. Local storage and IndexedDB remain until a feature removes the item, you use an available clear, forget, or reset control, you clear site data, or the browser evicts it. Some session history is capped and expires, but many course, progress, dashboard, memory, and Ripple records have no automatic expiration. A dashboard's fetched reading history is capped per tracked item, and deleting a dashboard deletes its readings and its record of recent checks with it. Clearing all browser site data is the broadest local deletion control. Removing browser data does not delete copies already sent elsewhere.

Gateway tokens remain until disconnected or removed by the gateway operator. Server, proxy, infrastructure, and provider retention depends on the relevant operator, logs, backups, account settings, and third-party policy. Contact those parties for deletion of data they control and revoke credentials at the issuing service.

Exports, downloaded files, backups, browser sync, system backups, provider records, and recipients of anything you share must be deleted separately.

## 9. Your controls and privacy rights

You can reduce or remove data by:

- leaving Remember off and using restricted, revocable provider keys;
- using Mavéa's forget, delete, disconnect, reset, and clear controls where offered;
- clearing this site's local storage, session storage, IndexedDB, cache, and permissions;
- revoking model, search, GitHub, Google, and other connected credentials;
- turning off microphone access and avoiding voice features;
- not uploading information you do not want sent to a selected provider; and
- contacting the deployment operator or relevant provider about data they control.

Depending on where you live, you may have legal rights to access, correct, delete, restrict, object to, or obtain a copy of personal information held by a deployment operator. The Maintainers cannot retrieve browser-local or provider-held data they do not possess.

## 10. Sensitive, confidential, and regulated information

Mavéa is not designed as a system of record for health, financial, student, employment, government-identifier, biometric, trade-secret, or other regulated information. Do not submit such information unless you have authority, have assessed every recipient, and have put any legally required contracts and safeguards in place. A disclaimer does not make a deployment compliant with HIPAA, FERPA, GDPR, financial-services rules, workplace duties, or another regulatory regime.

Do not submit children's data or another person's personal, confidential, privileged, or regulated information unless you have appropriate authority and a lawful basis. Mavéa is not a confidential or privileged channel.

## 11. Security

Mavéa uses safeguards such as browser encryption for supported stored data, content sanitization, same-origin request boundaries, confirmation for connected actions, and restricted gateway token-file permissions. No safeguard is perfect. Do not treat local storage or encryption as a guarantee, and do not use Mavéa as a password manager or secret vault.

You are responsible for device security, access controls, backups, proxy configuration, least-privilege provider credentials, and connected-account security. Do not expose a local proxy, development server, or actions gateway to an untrusted network.

## 12. Children

Mavéa is intended for adults and is not directed to children. Do not allow anyone under 18 to use connected model, upload, microphone, or action features or submit personal information through Mavéa. If you believe a child's information reached a deployment or provider, contact that operator and the relevant provider promptly and revoke any affected connection.

## 13. Changes, business transfers, and contact

Material changes to this notice require an updated effective date and, where appropriate, a new in-product acceptance version. A deployment operator must provide its own identity and contact details where applicable law requires them.

If a project, deployment, or relevant assets are reorganized, financed, sold, merged, or transferred, information actually controlled by the relevant operator may be disclosed to advisers and transferred to a successor as permitted by law. Browser-local and provider-held information that the operator does not possess cannot be transferred by that operator. A successor must describe its identity and any materially different data practices.

For a hosted copy, contact the person or organization that gave you access. For the public repository, use the Mavéa GitHub issue tracker for non-sensitive questions. Do not put personal or confidential information in a public issue. Report security concerns through [SECURITY.md](./SECURITY.md).
