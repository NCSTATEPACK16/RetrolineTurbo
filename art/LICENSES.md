# Third-party 2D art licences

3D model packs are recorded separately in [`models/LICENSES.md`](models/LICENSES.md).

| Asset | Source URL | Licence | Downloaded | Attribution |
|---|---|---|---|---|
| FabinhoSC **Background Clouds & Mountains Parallax** | https://opengameart.org/content/background-clouds-and-mountains-parallax | CC0 1.0 | 2026-08-11 | Not required |

## What ships from it

Only the **alpha masks** of `BackgroundMountain_01.png` and `BackgroundMuntain02.png`
reach the build. `scripts/prep_backgrounds.py` throws the source colours away and
refills the silhouette from tones sampled out of the plate the ridge sits on, so the
near layer cannot clash with a city night, a hot-pink coastal sunset and a desert
canyon in turn. Those two layers live in `art/source/parallax_near/` alongside the
pack's own licence note (`LICENCE-FabinhoSC.txt`); the pack's cloud and sky layers are
unused and were not kept. Re-download from the URL above to restore them.

## Music

| Asset | Source URL | Licence | Downloaded | Attribution |
|---|---|---|---|---|
| Never Sleep **Eyeless (Retrowave)** | https://opengameart.org/content/eyeless-retrowave | **CC0 1.0** | 2026-08-24 | Not required |

The OGA page offers the track under CC-BY 4.0 / CC-BY 3.0 / **CC0**; it is taken here
under the **CC0** grant, so no attribution is required and the credits screen owes it
nothing. Both the page metadata and the offered grants were checked on 2026-08-24 — the
same page-vs-file check that rejected the GrumpyDiamond pack below.

### What ships from it

The 18 MB source FLAC (`art/music/eyeless.flac`, git-ignored) is transcoded by
`scripts/bake_music.py` into `public/assets/music/eyeless.{ogg,mp3}` — 3.2 MB each,
211 seconds. Both encodings ship because no single one plays everywhere: Safari cannot
open an Ogg container, and MP3 is the universal fallback. Only one is ever fetched, and
it streams through an `<audio>` element rather than preloading, so the soundtrack does
not count against `plan.md` §12's initial-payload budget.

Re-download from the URL above and run `npm run bake:music` to reproduce.

### Considered, not taken

- **Retro Synthwave Music Pack** (https://swarajthegreat.itch.io/retro-synthwave-music-pack)
  — CC0 per its itch.io page, and a legitimate source. Not in the tree because itch.io
  gates even free downloads behind an interactive click-through that no script here can
  drive. It needs a human to download the pack into `art/music/` and re-run the bake;
  the pipeline handles multiple tracks already and needs no change to accept it.

## Rejected sources — do not substitute

- **GrumpyDiamond "Parallax Mountain Background"**
  (https://opengameart.org/content/parallax-mountain-background) — the OGA page
  metadata says CC0, but the licence file inside `mountain_background.zip` says
  **CC-BY-3.0** and asks for credit plus a profile link. A page/file mismatch is not
  something to resolve in our favour; the FabinhoSC pack above is unambiguously CC0
  in both places and covers the same need. Not downloaded into the tree.
