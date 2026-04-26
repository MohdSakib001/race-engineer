# Track SVG assets

These SVG files are vendored from
[julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg)
(detailed / white style), licensed under **CC-BY-4.0**. Each file contains a
single racing-line `<path>` plus small marker paths for the start/finish
line and a direction arrow.

Filename convention: `{f1-25 track id}.svg` — see
`scripts/fetch-track-svgs.mjs` for the id → upstream-filename mapping.

To refresh from upstream:

```sh
node scripts/fetch-track-svgs.mjs
```

The TrackMap page loads each SVG via Vite's `?raw` import in
`src/renderer/lib/track-svg-loader.ts`. Pit lanes are not part of the
upstream SVGs — they are synthesised per-track using
`PIT_LANE_CONFIG` from `src/renderer/lib/corner-data.ts`.
