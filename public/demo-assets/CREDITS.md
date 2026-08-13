# Demo asset credits & licenses

The copyright licences or public-domain status reviewed for these files permit their use in a
commercial product, subject to the linked terms. Source links are recorded even where attribution
is optional. This review does not grant or warrant separate publicity, privacy, trademark, property,
or other depicted-subject rights; avoid implying endorsement and review the intended use.

## Images — Pexels License (free for commercial use, no attribution required)

<https://www.pexels.com/license/> · each ID below links to the exact source page. Pexels says credit
is optional but encouraged; these links preserve source provenance even though the original import
did not retain the creator names.

| File                          | Pexels photo ID                                    | Subject                                      |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `images/sete-cidades.jpg`     | [20500286](https://www.pexels.com/photo/20500286/) | Sete Cidades twin crater lakes, São Miguel   |
| `images/furnas-lake.jpg`      | [26890903](https://www.pexels.com/photo/26890903/) | Furnas crater lake with hydrangeas           |
| `images/green-coast.jpg`      | [20500273](https://www.pexels.com/photo/20500273/) | Green coast and hydrangeas, São Miguel       |
| `images/patchwork-fields.jpg` | [33557780](https://www.pexels.com/photo/33557780/) | Aerial patchwork fields under a volcano      |
| `images/cliff-fields.jpg`     | [33557773](https://www.pexels.com/photo/33557773/) | Clifftop fields meeting the Atlantic         |
| `images/basalt-cliffs.jpg`    | [33515018](https://www.pexels.com/photo/33515018/) | Basalt sea cliffs                            |
| `images/crater-panorama.jpg`  | [26772400](https://www.pexels.com/photo/26772400/) | Crater landscape panorama with lakes         |
| `images/capelinhos.jpg`       | [27288120](https://www.pexels.com/photo/27288120/) | Capelinhos lighthouse on volcanic ash, Faial |
| `images/overcast-coast.jpg`   | [30548370](https://www.pexels.com/photo/30548370/) | Moody overcast coastline                     |
| `images/ponta-delgada.jpg`    | [20738549](https://www.pexels.com/photo/20738549/) | Portas da Cidade arches, Ponta Delgada       |
| `images/village-street.jpg`   | [27426091](https://www.pexels.com/photo/27426091/) | Hillside village street                      |

## Video — Pexels License (free for commercial use, no attribution required)

| File                     | Pexels video ID                                    | Subject                                              |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| `video/azores-film.webm` | [11600665](https://www.pexels.com/video/11600665/) | Coastal drone footage, Azores (SD 640×360; VP9/Opus) |

## PDF — Public domain (work of the U.S. Government)

| File                 | Source                                                                                                              | Notes                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pdf/cfd-primer.pdf` | NASA NTRS, document ID 19950004435 — _"Computational Fluid Dynamics Uses in Fluid Dynamics/Aerodynamics Education"_ | Four-page excerpt from a U.S. Government work; NASA records it as "Public Use Permitted." <https://ntrs.nasa.gov/citations/19950004435> |

## First-party — original Mavéa assets (no external source)

Drawn in-repo for Mavéa, so no third-party license applies.

| File                                 | Subject                                         |
| ------------------------------------ | ----------------------------------------------- |
| `images/slide-placeholder.svg`       | Gradient placeholder tile, slide-lab fixtures   |
| `images/slide-placeholder-light.svg` | Light-theme variant of the placeholder gradient |

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

The JPEGs and PDF entered the repository on July 21, 2026. The WebM is the reviewed open-codec
replacement for the original Pexels download. The hashes below pin the exact bytes covered by this
record; replacing a file requires a new source and licence review.

```text
fd101a07ae5ae9123c39f80b26023c5c8c6b5ff2984ad17105019d980a5699b6  images/basalt-cliffs.jpg
fd813b07dd13d65cd5a86e68d7829788d61e5b620d2fbc676a928d2db0247cea  images/capelinhos.jpg
c92cf97105b82d2c5f1dd8d6d775f37b75f852133c239b6e72bde57c65cc4ad6  images/cliff-fields.jpg
3eb0d7fb01cb5ca2978edac95806a536a32d7b5876666b29494468c4f0572f57  images/crater-panorama.jpg
094315f1f59a1cb107cdf38d25cf022168e28eec854ac5304591d9f79650f9e6  images/furnas-lake.jpg
a02161080c956edc361ba3065d633317067909685df638a3e27fc9acc07385fb  images/green-coast.jpg
dbe1d9ae483ae7ff1e01b533ec4c76c04639c4463b0190c5de5c02c323b436d7  images/overcast-coast.jpg
1c382a563eaba7182f5ff26bf45d5768a59ebc0dc6ea3175cf6b33dde8575cba  images/patchwork-fields.jpg
4301abe0d6856c60abdbb970aa2fefef802a7d6a1eec67fab027147ec8814247  images/ponta-delgada.jpg
b0581aec85088ab0782c12c18130aee5ed5767444631edc4274bd40ef2ab0d94  images/sete-cidades.jpg
71c10a7bc14be45f34e07cec3681ac94b308a34b70c40b56f4678d078ad33ca6  images/village-street.jpg
76a89237e8243457bee4239146525a07ce0a38086cf5d3087d576ea0faf6f9c9  video/azores-film.webm
036b352582b28ca11ef6e9bb430d85c9c7ec5669d9a6a157784456494f355c67  pdf/cfd-primer.pdf
2f129598caae4154e2bf4e9396ebe375aac5412a0af4c525f9af4a0c1019095a  images/slide-placeholder-light.svg
4eb299f59439acfdd6ebc4ed30dbfe8a65428215cec661b131e420e964ce6d59  images/slide-placeholder.svg
```

## Where they're used

- **`creative`** (the Azores photo-story) — images across the moodboard, carousel, lightbox, before/after,
  image-callouts and the `photo` frame; `azores-film.webm` in the videoembed.
- **`compsci`** (the simulation run) — `cfd-primer.pdf` embedded in the `pdfreader` as the real reference.
