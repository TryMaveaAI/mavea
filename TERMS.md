# Mavéa Terms of Use

Effective: September 3, 2026

These Terms of Use (the **Terms**) govern your use of the Mavéa application, command-line package, demos, documentation, and related materials (collectively, the **Service**). **Licensor** means each applicable copyright holder offering software under the PolyForm license. **Maintainers** means the people who publish or contribute to Mavéa; a Maintainer is not necessarily a Licensor. **Deployment operator** means the person or organization hosting the copy you use. **Responsible Party** means the applicable Licensor, Maintainer, or deployment operator responsible for a statement, obligation, service, or claim. In these Terms, **we**, **us**, or **our** means the relevant Responsible Party or Parties in context. A separately operated deployment remains independent from the Licensors and Maintainers unless the same person or organization serves both roles.

The [PolyForm Noncommercial License 1.0.0](./LICENSE) separately governs copyright and patent permission for the software source and distributions. If these Terms conflict with that license about rights in the software, the license controls.

## 1. Acceptance and eligibility

By downloading, installing, accessing, or using the Service, by selecting the in-product acceptance checkbox, or by submitting an issue, a discussion post, a message to a published Mavéa contact address, or any other feedback through a Mavéa project channel, you agree to these Terms and the PolyForm license and acknowledge the [Privacy Notice](./PRIVACY.md) and [Disclaimer](./DISCLAIMER.md). Submitting feedback is enough on its own: Section 9 is written to bind whoever sends it, including someone who has never installed or run Mavéa. If you use Mavéa for an organization, you represent that you have authority to accept these Terms for it. If you do not agree, do not use the Service.

You must be at least 18 years old, legally capable of entering this agreement, and permitted to use the Service under applicable law. The Service is not directed to children. A parent or guardian should not provide a child access to connected model, upload, microphone, or action features.

## 2. Noncommercial software permission

Mavéa is source-available under the PolyForm Noncommercial License 1.0.0. It is not distributed under an Open Source Initiative-approved open-source license. The license permits only the purposes it defines as noncommercial. Commercial use requires separate written permission or a separate license from the applicable Licensor. No statement, issue response, demonstration, or failure to enforce creates a commercial license or any permission beyond a written license.

The noncommercial restriction applies to recipients of the PolyForm license. It does not prevent a Licensor from commercializing Mavéa, offering paid or commercial licenses, licensing it under different terms, or assigning or transferring rights it owns or controls in a financing, merger, acquisition, asset sale, or other transaction.

The license does not grant rights in the Mavéa name, logos, trade dress, domains, or other brand features. See the [Trademark Policy](./TRADEMARKS.md).

## 3. Local and self-hosted operation

The current Service is designed for local or self-hosted operation. The Licensors and Maintainers do not currently provide a Mavéa-hosted account, cloud storage, telemetry, analytics, or conversation-retention service. They do not receive your prompts or browser-local data merely because you install or run Mavéa. A separate deployment operator is responsible for its deployment, notices, access controls, security, data practices, and legal compliance.

You are responsible for selecting, configuring, operating, and securing your device, browser, network, reverse proxy, deployment, credentials, backups, and connected accounts. Do not expose a development server, local proxy, or actions gateway to an untrusted network.

## 4. AI output and no professional advice

The Service uses probabilistic artificial-intelligence systems. Outputs, citations, calculations, classifications, summaries, transcriptions, translations, confidence labels, and visualizations may be false, fabricated, inaccurate, incomplete, misleading, biased, offensive, unsafe, or outdated. A polished presentation, citation, calculation, validation check, or natural voice does not guarantee accuracy, originality, legality, quality, or fitness for a particular purpose.

Output quality depends on the model, provider, and settings you select, and those are your choices. Models differ in whether they retrieve live information at all, whether the Service can compel them to, whether they disclose what they used, and how current their training data is; a smaller or cheaper model may answer from memory rather than searching, and may not say so. Features that display tracked, refreshed, or "live" values are therefore best-effort only: a value may be stale, incomplete, absent, or wrong, a check may be delayed, skipped, or silently unsuccessful, a figure obtained from a genuine live search may already be out of date at its source, and a source shown beside a figure does not establish that the figure came from that source or is accurate. Alert and notification features are likewise best-effort; no alert is guaranteed to fire or to be delivered. Scheduled checks run on credentials you supply and can incur third-party charges at whatever cadence you configure. Do not treat any displayed value as real-time, authoritative, monitored, or verified, and do not rely on tracking or alerts as your means of watching anything consequential.

You must independently review and verify important output against qualified professionals and original sources before relying on, publishing, sharing, or acting on it. The Service is not a substitute for qualified professional judgment and does not provide medical, legal, financial, tax, accounting, safety, engineering, mental-health, or other professional advice. Do not use it for emergencies or as the sole basis for decisions that may affect a person's rights, health, safety, finances, employment, education, housing, insurance, or access to essential services. You remain responsible for deciding whether and how to use every output.

## 5. Third-party services, credentials, and costs

Mavéa can communicate with model, search, speech, media, hosting, OAuth, and action providers that you select. Those services are independent third parties and are governed by their own contracts, privacy policies, acceptable-use rules, retention practices, availability, and pricing.

Connecting a code host or other content account authorizes Mavéa to read what that credential can reach and to include the relevant parts in requests to the provider you select. This applies to private repositories exactly as it does to public ones: if the scope you grant can read private source, internal documentation, diffs, or issues, that material can be sent to a third party under that party's own terms. You are responsible for having the right to disclose it, for granting the narrowest scope that works, and for revoking connections you no longer use.

You provide and control your own accounts, API keys, OAuth grants, and other credentials. Requests send relevant credentials and content through the deployment's same-origin proxy before reaching the selected third party. The proxy operator can access that material in transit. You must use a deployment operator you trust.

All costs of using the Service are your responsibility, including hardware, electricity, network access, hosting, domains, model tokens, search requests, speech services, storage, OAuth applications, connected-account activity, taxes, and any other third-party charges. Labels such as "fast", "balanced", or "thorough" are relative product descriptions, not price quotes or spending limits. Any token counts or usage figures the Service displays are informational only: they report what a provider stated for the current session in this browser, are not a billing record, and may be incomplete, unavailable, or wrong — your provider's own account is the authoritative measure of what you were charged. You are responsible for provider budgets, quotas, and billing alerts.

The repository's container definitions can be used with compatible container engines, but the engine or desktop application you choose is separate software. In particular, Docker Desktop is not free for every commercial organization under Docker's current subscription terms. You are responsible for selecting and licensing your development, build, hosting, and container tools; Mavéa does not grant rights in them.

The default map style uses OpenFreeMap's public service, which is currently offered without request fees under its own terms and requires attribution. That service has no Mavéa-backed service-level commitment and may change, restrict access, or stop. Preserve all map and data attribution in screen views and exports, or configure a properly licensed alternative.

We do not control and are not responsible for third-party services, content, security, billing, downtime, changes, or data practices. Links and integrations do not imply endorsement.

Provider, service, and model names (for example Google Gemini, Anthropic Claude, OpenAI GPT, xAI Grok, and OpenRouter) are trademarks of their respective owners. Mavéa uses them only to identify the third-party services you can connect; no affiliation with, sponsorship by, or endorsement from those owners is implied.

Mavéa's recording paths are configured to request only the project's reviewed open-media codec allowlist and not H.264, H.265, or AAC. Codec source licenses and published patent commitments can reduce risk but do not prove that no third party will assert a patent in every country, product category, or implementation. No Responsible Party gives a patent-clearance opinion for your deployment or commercial use. Obtain qualified patent advice when your use requires that assurance.

## 6. User content and sensitive information

You retain any rights you have in prompts, files, audio, credentials, account data, and other material you provide (**User Content**). You give the deployment operator and selected providers only the permission reasonably needed to receive, transmit, process, display, and return User Content for features you request. You are responsible for User Content and must have all rights, notices, consents, workplace approvals, permissions, and lawful bases needed to process it with the Service and your selected third parties.

Do not provide secrets or sensitive, regulated, confidential, privileged, export-controlled, or personal information unless you have assessed the deployment and every recipient and have a lawful basis to do so. Do not submit information about children or third parties without appropriate authority. Mavéa is not a confidential or privileged channel. Whatever you upload or connect — including work documents, an employer's or client's private code, and other people's information — is sent to the providers you select and handled under their terms, which may include retention and use for training; the Responsible Parties do not control that and accept no liability for it. The Responsible Parties do not acquire ownership of User Content merely because you use the software.

Listening features turn nearby speech into text. Recording and eavesdropping laws differ by place — some require every participant's consent, not just yours — so when you use a listening mode where other people can be heard, you are responsible for telling them and obtaining whatever consent your jurisdiction requires.

If you export a backup of your data, the resulting file is plain, unencrypted content under your sole control — you are responsible for storing, transmitting, and deleting it safely, and for only importing backups you trust. Backups exclude your provider and search keys.

## 7. Connected actions

Some features can propose actions in connected accounts, such as drafting or sending content, creating calendar entries, or opening a draft pull request. An action is intended to run only after confirmation, but software, providers, networks, and account permissions can fail.

Before confirming, review the target, recipients, arguments, permissions, charges, facts, confidential information, intellectual-property rights, accessibility, and likely consequences. You are solely responsible for actions you authorize, including irreversible changes, repository changes, generated messages, exports, presentations, shared reels, external communications, account activity, publishing, and third-party fees. A preview, confirmation screen, or successful provider response does not guarantee the intended result. Use sandbox or test accounts where possible and keep independent backups.

## 8. Acceptable use

You may not use the Service to:

- violate law or another person's rights;
- violate export-control or economic-sanctions laws;
- evade the PolyForm Noncommercial License or remove required notices;
- gain unauthorized access to systems, credentials, accounts, or data;
- distribute malware, exploit vulnerabilities, or interfere with services;
- impersonate others or deceptively present AI output as verified fact;
- make fully automated high-impact decisions about people without lawful authority, qualified review, and appropriate safeguards; or
- use the Service in an emergency, weapons system, life-support system, or other environment where failure could foreseeably cause death, personal injury, or severe property or environmental harm.

## 9. Ownership and feedback

Except for third-party materials and User Content, rights in Mavéa and its associated intellectual property remain with their applicable rights holders. No rights are granted except those expressly stated in the PolyForm license and these Terms.

As between you and the Responsible Parties, the Responsible Parties do not claim ownership of output generated for you. That does not mean output is copyrightable, unique, accurate, original, lawful, or free of third-party rights. Similar output may be produced for others. You are responsible for clearance, attribution, review, and compliance before commercial or public use.

Bundled and linked third-party materials can carry copyright licences, attribution requirements, personality or publicity rights, privacy interests, trademark rights, property restrictions, or other limitations. A copyright licence or public-domain label does not necessarily clear every depicted person, place, object, logo, or use. Preserve the notices in `THIRD-PARTY.txt` and `public/demo-assets/CREDITS.md`, follow their source terms, and obtain any additional releases or permissions your use requires.

You may submit issue reports and feature suggestions without including code, patches, documentation changes, confidential information, or trade secrets. Mavéa does not accept external code: material of that kind posted in any channel is not reviewed, not incorporated, and creates no contribution, no authorship, and no rights in Mavéa. The only authorized code maintainers are named in [CONTRIBUTING.md](./CONTRIBUTING.md).

You grant the applicable Licensors and Maintainers, and their successors and assigns, a worldwide, perpetual, irrevocable, transferable, sublicensable, royalty-free right to use, modify, publish, and commercialize ideas and feedback you voluntarily submit, without restriction, attribution, accounting, or compensation. This grant applies however the feedback reaches us — an issue, a discussion, an email, or any other project channel — and whether or not you have installed, accessed, or used the Service. It survives any assignment or transfer of these Terms and runs to the benefit of a successor in a financing, merger, acquisition, or sale of assets, on the same terms.

Feedback is not confidential and creates no confidential or fiduciary relationship. We may already be working on, or may independently develop, anything your feedback describes, and nothing in it obliges us to use it, keep it, respond to it, or refrain from developing something similar. To the maximum extent permitted by law, you waive any moral rights and any right to be identified in relation to feedback you submit. You represent that you are entitled to submit what you send and that it infringes no one else's rights.

This does not transfer ownership of inventions or copyrighted materials that are not included in your feedback.

## 10. Availability, changes, and support

The Service may contain bugs, security defects, incomplete features, generated examples, or breaking changes and may be modified, interrupted, or discontinued without notice. We have no obligation to maintain, update, support, secure, or continue any feature or version. There is no promise of uptime, compatibility, preservation of data, or continued availability. Keep independent copies of anything important. Any support is provided at the Maintainers' discretion under the [Support Policy](./SUPPORT.md).

We may update these Terms by changing the effective date and the acceptance version shipped with the Service. Continued use after an updated version is presented and accepted is governed by the updated Terms.

## 11. Disclaimers

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED **AS IS** AND **AS AVAILABLE**, WITH ALL FAULTS AND WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY. WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, SECURITY, AVAILABILITY, QUIET ENJOYMENT, AND THAT THE SERVICE OR OUTPUT WILL BE ERROR-FREE, COMPLETE, CURRENT, OR SUITABLE FOR YOUR NEEDS.

YOU ASSUME ALL RISK ARISING FROM INSTALLATION, CONFIGURATION, ACCESS, USE, OUTPUT, CONNECTED ACCOUNTS, AND THIRD-PARTY SERVICES. THE [DISCLAIMER](./DISCLAIMER.md) PROVIDES A PLAIN-LANGUAGE SUMMARY BUT DOES NOT LIMIT THIS SECTION.

Some jurisdictions do not allow certain disclaimers, so parts of this section may not apply to you.

## 12. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR AFFILIATES, SUCCESSORS, LICENSORS, SERVICE PROVIDERS, AND REPRESENTATIVES WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, CONSEQUENTIAL, OR PUNITIVE DAMAGES; LOSS OF PROFITS, REVENUE, SAVINGS, BUSINESS, OPPORTUNITY, GOODWILL, USE, OR DATA; BUSINESS INTERRUPTION; COST OF SUBSTITUTE SERVICES; THIRD-PARTY CLAIMS; OR DAMAGES ARISING FROM AI OUTPUT, SECURITY INCIDENTS, CONNECTED ACTIONS, OR THIRD-PARTY SERVICES, UNDER ANY THEORY OF LIABILITY, EVEN IF ADVISED OF THE POSSIBILITY.

TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US DIRECTLY FOR THE SERVICE DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR (B) US$100.

These limitations do not exclude liability that cannot legally be excluded or limited.

## 13. Indemnity

To the maximum extent permitted by law, you will defend, indemnify, and hold us and our affiliates, successors, representatives, and service providers harmless from claims, demands, losses, liabilities, damages, judgments, costs, and reasonable legal fees arising from your User Content, deployment, credentials, connected accounts, confirmed actions, violation of these Terms or law, infringement of another person's rights, or commercial or otherwise unlicensed use of Mavéa.

This section does not apply where prohibited by law.

## 14. Suspension and termination

Your software license ends as described in the PolyForm license. We may also stop providing access to any service we operate if we reasonably believe you violated these Terms or created risk or legal exposure. Sections that by their nature should survive termination—including ownership, disclaimers, liability limits, indemnity, and this paragraph—will survive.

## 15. General terms

These Terms, the PolyForm license, and the policies linked here are the entire agreement about the Service and replace prior statements on that subject. If a provision is unenforceable, it will be enforced to the maximum extent permitted and the remaining provisions will remain effective. A waiver must be in writing and is not a continuing waiver. You may not assign these Terms without written consent from the relevant party. An applicable rights holder or deployment operator may assign these Terms and transfer rights it owns or controls in connection with a reorganization, financing, merger, acquisition, sale of assets or intellectual property, or similar transaction.

No governing-law, arbitration, venue, or class-action-waiver clause is included in this version. Applicable law determines those questions unless and until a later version, reviewed for the relevant owners and jurisdictions, states otherwise.

## 16. Contact

For a hosted copy, contact the person or organization that gave you access. For the public repository, use the Mavéa GitHub issue tracker for non-sensitive questions. Do not put confidential information in a public issue. Security reports must follow [SECURITY.md](./SECURITY.md). Commercial licensing, trademark permission, and other business inquiries may be sent to trymavea@gmail.com. Correspondence does not create a license, warranty, support obligation, or commercial right; see Section 2.
