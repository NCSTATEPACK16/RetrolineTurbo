# Third-party 3D model licences

2D source art is recorded separately in [`../LICENSES.md`](../LICENSES.md).

| Pack | Source URL | Licence | Downloaded | Attribution |
|---|---|---|---|---|
| Kenney Car Kit | https://kenney.nl/assets/car-kit | CC0 1.0 | 2026-08-11 | Not required |
| RGS_Dev Free Low Poly Vehicles | https://rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 1.0 | 2026-08-11 | Not required ("Credit is not needed") |
| Kenney Racing Kit | https://kenney.nl/assets/racing-kit | CC0 1.0 | 2026-08-11 | Not required |
| Kenney Nature Kit | https://kenney.nl/assets/nature-kit | CC0 1.0 | 2026-08-11 | Not required |

### What Spec D bakes from the two prop packs

`scripts/render_props.py` pins the exact source model per sprite name:

| Sprite | Pack | Model |
|---|---|---|
| `lamp_post` | Racing Kit | `lightPostLarge.obj` |
| `median_post` | Racing Kit | `pylon.obj` |
| `grandstand` | Racing Kit | `grandStandAwning.obj` |
| `billboard_sponsor` | Racing Kit | `billboard.obj` |
| `palm` | Nature Kit | `tree_palm.obj` |

No source texture reaches the build: every material slot is repainted from
`src/assets/palette.json` before rendering, so props clamp to the same master
palette as the cars.

## Rejected sources — do not substitute
- **Quaternius Ultimate Nature** — CC0, but distributed only through a Google
  Drive folder (quaternius.com) or itch.io, neither of which gives a stable
  scriptable URL. Kenney's Nature Kit is CC0 from a direct kenney.nl zip and
  carries the palms Spec D needed, so it was used instead. Not a licence
  objection — a reproducibility one.
- **Quaternius Cars Bundle** — CC0 on the bundle page, but some individual
  poly.pizza pages serve CC-BY 3.0. Only acceptable via the itch/OpenGameArt CC0
  listing, verified per file.
- **The Spriters Resource Top Gear / Top Gear 2 rips** — copyrighted Kemco/Gremlin
  art. Reference only, for proportions and steering-angle counts. Never in the build.
- **"KenPixel" via FontStruct / onlinewebfonts mirrors** — served CC-BY-SA. Kenney
  fonts only from kenney.nl.

## Notes on acquisition

- Kenney Car Kit was fetched directly from the resolved zip URL
  (`https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip`,
  confirmed live via `curl -IL` before download: HTTP 200, `content-type: application/zip`).
  Unzipped into `art/models/kenney_car-kit/`. License confirmed CC0 via the pack's own
  `License.txt`.
- RGS_Dev's pack is a pay-what-you-want itch.io download. The "No thanks, just take me
  to the downloads" skip-payment path required scripting itch.io's client-side purchase
  flow (not just following links) via curl with a cookie jar: fetch the game page for a
  CSRF token, POST it to `/free-low-poly-vehicles-pack/download_url` to mint a
  short-lived download-session URL, load that to reach the actual downloads page, then
  POST the listed upload's id to `/free-low-poly-vehicles-pack/file/<upload_id>` to get
  a 60-second-expiry signed Cloudflare R2 URL for the zip, fetched immediately.
  Unzipped into `art/models/rgs_dev_free-low-poly-vehicles/`. License confirmed CC0 via
  the pack's own `License.txt` ("This asset is under CC0 License... Credit is not
  required").

Both packs' model files live on disk under `art/models/` but are excluded from git via
`.gitignore` (see repo root) — only this provenance file and the licence notes are
tracked. Re-run the download steps above (or re-fetch from the source URLs) to restore
the binaries in a fresh checkout.
