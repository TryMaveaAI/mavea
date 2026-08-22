# Demo asset credits & licenses

Every third-party file bundled here is **CC0 or public domain** — free for commercial and
non-commercial use, with no conditions and nothing to comply with. Licences that merely _permit_
commercial use while attaching conditions (Pexels, Unsplash, Pixabay, and every CC-BY / CC-BY-SA
variant) are deliberately out of scope for bundled media: these files sit in a public repository as
individually downloadable originals, so anything short of an unconditional dedication would leave a
grey area for whoever forks it. Sources and creators are recorded below even though CC0 requires no
attribution — someone made these, and provenance is the point of this file. This review does not
grant or warrant separate publicity, privacy, trademark, property, or other depicted-subject
rights; avoid implying endorsement and review the intended use.

## Images — Wikimedia Commons, CC0 1.0 (public-domain dedication)

Nine photographs from a São Miguel set of 1,100 CC0 images by **Jan Helebrant**, plus one
derivative and one video still. Commons licenses per file, never per uploader, so each file was
verified individually against the Commons API rather than a search result. The query and the two
fields that decide it:

```text
https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata|size&format=json&titles=File:NAME

  "LicenseShortName":    { "value": "CC0" }
  "UsageTerms":          { "value": "Creative Commons Zero, Public Domain Dedication" }
  "AttributionRequired": { "value": "false" }
  "LicenseUrl":          { "value": "http://creativecommons.org/publicdomain/zero/1.0/deed.en" }
  "Artist":              { "value": "Jan Helebrant" }
```

All nine returned exactly that on 2026-08-17; none of the source pages requests credit as a
courtesy, so nothing here is owed and nothing was asked. The photographer's own site,
<https://www.juhele.blogspot.com>, is named in each file's Commons description.

| File                              | Commons source                                                                                                                 | Creator       | License | Subject                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------- | ----------------------------------------------------------------------- |
| `images/sete-cidades.avif`        | [2019-05-25 12-42-52](https://commons.wikimedia.org/wiki/File:2019-05-25_12-42-52_PT_Sao_Miguel_JHe_K70_%2854538191001%29.jpg) | Jan Helebrant | CC0     | Lagoa das Sete Cidades from the Vista do Rei viewpoint                  |
| `images/furnas-lake.avif`         | [2019-05-19 13-39-35](https://commons.wikimedia.org/wiki/File:2019-05-19_13-39-35_PT_Sao_Miguel_JHe_K70_%2854397682824%29.jpg) | Jan Helebrant | CC0     | Lagoa das Furnas from the Pico do Ferro walk                            |
| `images/green-coast.avif`         | [2019-05-22 16-43-56](https://commons.wikimedia.org/wiki/File:2019-05-22_16-43-56_PT_Sao_Miguel_JHe_K70_%2854461960435%29.jpg) | Jan Helebrant | CC0     | Hydrangeas along the rail at the Ponta do Sossego viewpoint             |
| `images/green-coast-raw.avif`     | derivative of `images/green-coast.avif` — same frame, see the note below                                                       | Jan Helebrant | CC0     | The same hydrangea frame, flattened and cooled                          |
| `images/tea-terraces.avif`        | [2019-05-26 17-16-10](https://commons.wikimedia.org/wiki/File:2019-05-26_17-16-10_PT_Sao_Miguel_JHe_K70_%2854585544624%29.jpg) | Jan Helebrant | CC0     | Chá Gorreana tea plantation, Ribeira Grande                             |
| `images/cliff-fields.avif`        | [2019-05-22 17-24-41](https://commons.wikimedia.org/wiki/File:2019-05-22_17-24-41_PT_Sao_Miguel_JHe_K70_%2854453890482%29.jpg) | Jan Helebrant | CC0     | Sea cliff with fields on the rim, on the walk to Farol do Arnel         |
| `images/sea-cliffs.avif`          | [2019-05-22 17-30-04](https://commons.wikimedia.org/wiki/File:2019-05-22_17-30-04_PT_Sao_Miguel_JHe_K70_%2854454747141%29.jpg) | Jan Helebrant | CC0     | Sea cliff and waterfall, on the walk to Farol do Arnel                  |
| `images/crater-panorama.avif`     | [2019-05-23 16-27-26](https://commons.wikimedia.org/wiki/File:2019-05-23_16-27-26_PT_Sao_Miguel_JHe_K70_%2854488051545%29.jpg) | Jan Helebrant | CC0     | Lagoa do Fogo, the caldera lake                                         |
| `images/arnel-lighthouse.avif`    | [2019-05-22 17-27-37](https://commons.wikimedia.org/wiki/File:2019-05-22_17-27-37_PT_Sao_Miguel_JHe_K70_%2854454928979%29.jpg) | Jan Helebrant | CC0     | The red lantern of Farol do Arnel above the sea (cropped to 16:10)      |
| `images/nordeste-town.avif`       | [2019-05-22 18-08-34](https://commons.wikimedia.org/wiki/File:2019-05-22_18-08-34_PT_Sao_Miguel_JHe_K70_%2854452142621%29.jpg) | Jan Helebrant | CC0     | Nordeste, the church and the street under a grey sky                    |
| `images/island-coast-poster.avif` | still frame from `video/island-coast.webm` (row below)                                                                         | Blervis       | CC0     | The video's own poster frame, so the poster shows the actual first shot |

**The derived RAW half.** `green-coast-raw.avif` is not a second photograph. It is
`green-coast.avif` — the identical CC0 frame — put through a deterministic flatten-and-cool pass
(55% luminance mix toward grey, contrast × 0.82 about mid-grey, channel gains R 0.94 / G 0.99 /
B 1.09, then × 0.93 + 14 to lift the blacks) so the `beforeafter` block genuinely shows one scene
ungraded beside itself graded, instead of two unrelated photographs pretending to be a grade. CC0
permits derivatives without condition; the transform is recorded here so a future reader does not
mistake it for another source.

## Video — Wikimedia Commons, CC0 1.0 (public-domain dedication)

There is no CC0 or public-domain video of the Azores at usable quality — every Azores clip on
Commons is CC-BY or CC-BY-SA, and the only public-domain ones are NOAA satellite weather loops. So
the film plate is honest about being a coastal plate and claims no location: a remote-island
shoreline that carries the same register as the story, with the demo's own labels rewritten so
nothing asserts it is São Miguel.

| File                      | Commons source                                                                                  | Creator | License | Subject                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `video/island-coast.webm` | [Santa Rosa Island Waves](https://commons.wikimedia.org/wiki/File:Santa_Rosa_Island_Waves.webm) | Blervis | CC0     | Sea cliffs and surf near Lobo Canyon, Santa Rosa Island, Channel Islands National Park, California, 2023 |

Verified the same way, on 2026-08-17: `LicenseShortName: CC0`, `UsageTerms: Creative Commons Zero,
Public Domain Dedication`, `AttributionRequired: false`. The Commons original is a 21-minute
1920×1080 locked-off shot (386 MB); what ships is a 20.2-second cut of it, re-encoded to 854×480
VP9/Opus (1.43 MB) — smaller than the file it replaces at a higher resolution.

## PDF — Public domain (work of the U.S. Government)

| File                 | Source                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pdf/cfd-primer.pdf` | NASA NTRS, document ID 19950004435 — _"Computational Fluid Dynamics Uses in Fluid Dynamics/Aerodynamics Education"_ (NASA TM 108834, Terry L. Holst, Ames, July 1994) | The **complete** 14-page U.S. Government work, references included; NASA records it as "Public Use Permitted." <https://ntrs.nasa.gov/citations/19950004435> — used factually, with no implication of NASA endorsement. It ships complete on purpose: NASA warns that its documents can embed third-party material its own use does not license onward, and the reference list is what lets a reader check that. Checked 2026-08-17 — the figures are the author's own renderings of published DATA ("approximated from"/"taken from" refs 1-8, three of which are Holst's own papers), and the document carries no "reprinted with permission", "courtesy of", or copyright line anywhere, which AIAA and IEEE both require when a paper reproduces someone else's figure. |

## First-party — original Mavéa assets (no external source)

Drawn in-repo for Mavéa, so no third-party license applies.

| File                                 | Subject                                         |
| ------------------------------------ | ----------------------------------------------- |
| `images/slide-placeholder.svg`       | Gradient placeholder tile, slide-lab fixtures   |
| `images/slide-placeholder-light.svg` | Light-theme variant of the placeholder gradient |

## `docs/media` — first-party captures of Mavéa itself

These ship in the npm package (`package.json` `files` lists `docs/media`) and illustrate the
README. They are screenshots of this application rendering its own demo fixtures, plus the mascot
mark, so no third-party licence attaches to the images themselves. They were reviewed on
2026-08-22 and are gated by `tests/credits-completeness.test.ts` from here on, because a screenshot
is the one asset that can quietly acquire third-party content later.

**What a new capture must be checked for**, since the file itself carries no licence metadata:

- **A map.** Tiles are OpenFreeMap / OpenMapTiles over OpenStreetMap data, and ODbL attribution is
  MANDATORY — unlike everything else in this file. `canvas/blocks/media/MapAttribution.tsx` renders
  it in-flow precisely so it survives a raster capture; confirm the credit line is legible in the
  image before committing it (`trip-plan.jpg` is the worked example).
- **A document, photograph, or source file that is not ours.** Demo fixtures are fiction and the
  bundled photos are CC0, so a capture of the app is clean by default — but a screenshot taken
  against a real PDF, a real repository, or a personal account would carry that content's rights
  into a distributed artifact.

| File                | Subject                                                        |
| ------------------- | -------------------------------------------------------------- |
| `answer-ink.jpg`    | An answer in the Ink template                                  |
| `canvas-view.jpg`   | The canvas view of a conversation                              |
| `course-lesson.jpg` | A generated course lesson                                      |
| `deck-export.jpg`   | The export studio previewing a slide                           |
| `deep-zoom.jpg`     | Deep Zoom on a canvas                                          |
| `doc-export.jpg`    | The export studio previewing a document page                   |
| `doc-prism.jpg`     | Prism reading the bundled public-domain NASA memorandum        |
| `living-answer.jpg` | The living world over an answer                                |
| `repo-course.jpg`   | Ripple on the fictional `acme/auth-service` worked example     |
| `think-map.jpg`     | Watch Me Think's live map                                      |
| `trip-plan.jpg`     | A trip itinerary — **contains a map; carries its ODbL credit** |
| `voice-scrub.jpg`   | The voice scrubber over an answer                              |
| `mascot-dark.svg`   | The Mavéa mark, dark                                           |
| `mascot-light.svg`  | The Mavéa mark, light                                          |

## Hotlinked tour imagery — Wikimedia Commons, CC0 (not bundled)

The recorded tour replays reference three photos by URL from Wikimedia Commons; the files
themselves are never bundled in this repo or the npm package. Commons licenses per file, so each
was individually verified as **CC0 (public-domain dedication — free for commercial use, no
attribution required)** via the Commons API. The license gate (`scripts/check-licenses.mjs`)
fails on any baked remote media URL that has not been reviewed and listed there.

| Hotlinked file (Commons)                                                                                           | Creator                | License | Subject                            |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------- | ---------------------------------- |
| [Shibuya crossing at night](https://commons.wikimedia.org/wiki/File:Shibuya_crossing_at_night.jpg)                 | Syced                  | CC0     | Shibuya scramble crossing at night |
| [Lantern of Kaminarimon Gate](https://commons.wikimedia.org/wiki/File:Lantern_of_Kaminarimon_Gate.JPG)             | Tokumeigakarinoaoshima | CC0     | Kaminarimon gate lantern, Asakusa  |
| [View of Mount Fuji from Lake Ashi](https://commons.wikimedia.org/wiki/File:View_of_Mount_Fuji_from_Lake_Ashi.jpg) | Quercus acuta          | CC0     | Mt. Fuji across Lake Ashi          |

## Integrity manifest

On August 17, 2026 every bundled photo and the video were replaced: the originals were licensed
under terms that permit commercial use but attach conditions, and the repository is public, so the
files were swapped for CC0/public-domain equivalents verified from the primary source. Photos come
from the Commons original at width 1600, downscaled to 1200 px on the long edge (`sips -Z 1200`)
and encoded with `sips -s format avif -s formatOptions 60` — the project's method, unchanged. Bundled
media went from 3,065,049 to 3,698,811 bytes (+21%), the growth being detail the previous
already-compressed sources had lost. The hashes below pin the exact bytes covered by this record;
replacing a file requires a new source and licence review.

```text
2c2870ababb88cdf18174ec4c5dce03aef0d75d7a0ca17f5ce8e6d55142891a6  images/arnel-lighthouse.avif
53a7c9b71f15367a74d594a9552d52a82ad1b8e60cc3023f149b9976812180ef  images/cliff-fields.avif
c4bb8246c82b068c94b6821e8a67f28259803d3ca4c3bcc29423377d4ea60936  images/crater-panorama.avif
250a54851df3801e2f54ff706b401322b1429c61afb1f60d3b56735325aad528  images/furnas-lake.avif
0579b86656498168b393be28802b729ad3d2ef2616471f24302cb19f83a7da60  images/green-coast.avif
2a3273675b9eb8b4dad745ecbbc48c00247914b6af89e8b113c1891ec3dd63dd  images/green-coast-raw.avif
fab83506e2ecffb4a60383025712ededa4cb5753c2d2491ea9c37263fa5bcb65  images/island-coast-poster.avif
1e94bbe07b13cb279576f8ec295cc35eee5c9f6a211ef92667e1f864cb90cdae  images/nordeste-town.avif
15206126ee42dc60308145a5ac915f20b57d42ac819e6c8ff7f06db1a01497ba  images/sea-cliffs.avif
13969f02ba364eed8c33f8010b32b6022cf07a3db21618dd2ccd180e2d43d4d3  images/sete-cidades.avif
f25be18c5016bc54968b3f7789a3e0ef1cbb3da76c211e13aa8efd43860a8e95  images/tea-terraces.avif
6d86f3f74ea247a3ce4c322fe986f2ad43a177cf345b00b5a999f22019b53f08  video/island-coast.webm
525ef1dc7f681f1d423731da9221244fdc7ecc8822a404f3ab4f272a002501a5  pdf/cfd-primer.pdf
2f129598caae4154e2bf4e9396ebe375aac5412a0af4c525f9af4a0c1019095a  images/slide-placeholder-light.svg
4eb299f59439acfdd6ebc4ed30dbfe8a65428215cec661b131e420e964ce6d59  images/slide-placeholder.svg
```

## Where they're used

- **`creative`** (the Azores photo-story) — images across the moodboard, carousel, lightbox, before/after,
  image-callouts and the `photo` frame; `island-coast.webm` in the videoembed.
- **`compsci`** (the simulation run) — `cfd-primer.pdf` embedded in the `pdfreader` as the real reference.
