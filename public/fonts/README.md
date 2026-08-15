# Self-hosted fonts

These are **variable** woff2 files — one file covers the whole `100–700` weight
range, so there is no per-weight fan-out. Faces are declared in
[`src/fonts.css`](../../src/fonts.css).

Only `ibm-plex-sans-latin.woff2` is preloaded from `index.html`. Space Grotesk
is not: a walk of every rendered element on the landing page found **zero** that
resolve to it (it is reachable only via Tailwind's `font-display` class, which
the landing page never uses), so preloading it would only add contention to the
LCP page.

| File | Family | Axis | Subset | Size |
|---|---|---|---|---|
| `space-grotesk-latin.woff2` | Space Grotesk | `wght 300–700` | latin | 22 kB |
| `space-grotesk-latin-ext.woff2` | Space Grotesk | `wght 300–700` | latin-ext | 19 kB |
| `ibm-plex-sans-latin.woff2` | IBM Plex Sans | `wght 100–700` | latin | 45 kB |
| `ibm-plex-sans-latin-ext.woff2` | IBM Plex Sans | `wght 100–700` | latin-ext | 30 kB |

The `latin-ext` files are gated by `unicode-range`, so a normal visit fetches
only the two `latin` files (**68 kB total**).

## Provenance

Copied verbatim from the Fontsource packages, which repackage the Google Fonts
originals:

```
@fontsource-variable/space-grotesk@5.3.0  files/space-grotesk-{latin,latin-ext}-wght-normal.woff2
@fontsource-variable/ibm-plex-sans@5.3.0  files/ibm-plex-sans-{latin,latin-ext}-wght-normal.woff2
```

The packages are **not** a dependency — they were installed once, the four files
were copied out, and they were removed again. To refresh:

```bash
npm i --no-save @fontsource-variable/space-grotesk @fontsource-variable/ibm-plex-sans
cp node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2 public/fonts/space-grotesk-latin.woff2
# ...and the other three, then:
npm remove @fontsource-variable/space-grotesk @fontsource-variable/ibm-plex-sans
```

## Licence

Both families are under the SIL Open Font License 1.1 — see
`LICENSE-space-grotesk.txt` and `LICENSE-ibm-plex-sans.txt`, which the OFL
requires to be distributed alongside the fonts. Keep them here; they are served
as static files but never fetched by the app.

## Dropped families

`Fira Sans`, `Inter` and `DM Serif Display` used to be fetched from Google Fonts
and are deliberately gone — see Stage 4.11 / BUG-066 in
[`docs/Improvement_Roadmap.md`](../../docs/Improvement_Roadmap.md).
