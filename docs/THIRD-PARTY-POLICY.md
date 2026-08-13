# Third-party commercial-use policy

What Mavéa bundles, generates, and talks to, and the terms each of those carries. Summarised in
the README; the detail lives here so the front page stays readable.

Generated videos stay inside an explicit open-media allowlist — AV1 video with Opus audio in an
MP4 container where the browser can encode them, WebM (VP9/VP8 + Opus) otherwise. Mavéa does
not generate H.264, H.265, or AAC files or silently fall back to them. Published source licences
and patent commitments reduce risk but are not a universal patent-clearance opinion. Conversation and Reel direction, rendering, and
encoding stay local; opening Reel never calls a configured model provider. Narration uses the local
Kokoro service. Document and presentation exports use bundled permissively licensed libraries and
self-hosted SIL OFL fonts. Maps use BSD-licensed MapLibre with
OpenFreeMap, whose public service terms reviewed August 11, 2026 currently permit commercial use
without request fees; the required map attribution
stays visible. The Kokoro weights and wrapper are Apache-2.0; the separately pulled service image
also contains GPL-3.0-or-later eSpeak NG, whose license permits commercial use. Mavéa communicates
with that separate process over HTTP and does not bundle or link its code. whisper.cpp and its
selected model are MIT. The Kokoro image is pinned by immutable digest; the speech source archive
and model are revision-pinned and checksum-verified before execution. The npm package does not
contain either model or a container image: the user's container runtime fetches/builds those
artifacts directly. Podman is Apache-2.0 and recommended; Docker Desktop is not universally free
for commercial organizations, so users who choose it must confirm its terms.

`pnpm check:licenses` scans the installed dependency graph and fails on unapproved, noncommercial,
or strong-copyleft licenses. The same gate rejects generated-media codecs outside the reviewed allowlist,
provider-directed Reel generation, restricted tile-service fallbacks, and bundled
MP4/M4A/AAC/MP3/MOV files. `pnpm verify` and package publication both run this gate. Permissive
licenses can still require copyright notices or
attribution; those are preserved in [`THIRD-PARTY.txt`](THIRD-PARTY.txt) and
[`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt).

This automated gate is an engineering control, not a legal opinion: it cannot eliminate patent,
training-data, ownership-chain, provider-terms, or other third-party-claim risk. A commercial launch
that needs formal assurance should have counsel review the release artifact, notices, provider
terms, and the rights held by every Mavéa rights holder. Anyone who redistributes the Kokoro image
itself must also satisfy the GPL obligations carried by eSpeak NG inside that image.
