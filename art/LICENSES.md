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

## Rejected sources — do not substitute

- **GrumpyDiamond "Parallax Mountain Background"**
  (https://opengameart.org/content/parallax-mountain-background) — the OGA page
  metadata says CC0, but the licence file inside `mountain_background.zip` says
  **CC-BY-3.0** and asks for credit plus a profile link. A page/file mismatch is not
  something to resolve in our favour; the FabinhoSC pack above is unambiguously CC0
  in both places and covers the same need. Not downloaded into the tree.
