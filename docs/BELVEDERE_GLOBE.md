# Belvédère globe: geography and interaction

`apps/web/src/belvedere-globe.tsx` renders a Canvas 2D orthographic globe with an accessible country ranking. Connections and distribution use their own API country aggregates. A marker represents a country, never a person's coordinates. The distribution selection can open the activity view filtered to that destination country.

The renderer has no new runtime dependency, external requests, map API key, tracker, or idle animation. It draws when data, selection, rotation, or element dimensions change; pixel density is capped at 2. Dragging, arrow keys, Home, named rotation buttons, and the native country buttons provide equivalent navigation. Reduced motion disables inherited button transitions. On touch screens, vertical page scrolling remains available. Country counts remain readable if Canvas rendering is unavailable.

## Public-domain geographic source

Natural Earth releases its raster and vector data into the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The vendored asset is derived from the project's own [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector), pinned to commit `ca96624a56bd078437bca8184e78163e5039ad19`:

- [110m land GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_land.geojson): coastline geometry used for the land dots.
- [50m admin-0 countries GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_admin_0_countries.geojson): `ISO_A2_EH` (falling back to `ISO_A2`) and `LABEL_X` / `LABEL_Y` supply representative country label coordinates. [Dataset description](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/).

The globe shows coastlines through sampled dots, without political boundary lines. Natural Earth's country label coordinates and country coverage follow that dataset's conventions. They are representative positions, not exact centroids or inferred user locations. Microstates can have a marker even if a 110m coastline does not resolve their land. Two-letter codes absent from the source, invalid codes, and missing countries retain their volume in the ranking and the explicitly unpositioned total. No fallback city or guessed coordinate is used.

## Deterministic asset derivation

`apps/web/src/belvedere-globe-data.json` contains 8,051 land coordinates and 237 two-letter country label coordinates. The generation step is offline:

1. Generate 28,000 equally distributed Fibonacci sphere candidates, with index `i` from 0 through 27,999: `latitude = asin(1 - 2 × (i + 0.5) / 28000) × 180 / π`; `longitude = (i × 137.50776405003785) % 360 - 180`.
2. Retain candidates inside a 110m land polygon's exterior ring and outside its holes, using bounding-box rejection followed by the conventional ray-crossing point-in-polygon test. Handle every polygon in a MultiPolygon. Round retained longitude/latitude pairs to 3 decimal places, preserving candidate order.
3. For 50m countries, retain uppercase two-letter `ISO_A2_EH` values, with `ISO_A2` as a fallback when the former is unavailable. Store source `LABEL_X` / `LABEL_Y`, rounded to 4 decimals, keyed in alphabetical order. Exclude missing or invalid codes.
4. Serialize the source commit, land pairs, and country mapping as compact JSON. The app bundles this static asset; runtime data never alters it.

SHA-256 checksums:

| File                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Source `ne_110m_land.geojson`             | `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9` |
| Source `ne_50m_admin_0_countries.geojson` | `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb` |
| Vendored `belvedere-globe-data.json`      | `73c4944b54e5467a1cb59664c1e76eb2eb02e212dccba51e691b37ecbb34b805` |

Marker radius increases with the square root of count relative to the current maximum, plus a minimum readable radius. The ranking gives the exact count and percentage; the visual marker is an aid to comparison, not a precision area chart. The hemisphere clips markers and land by camera-facing depth. A selected country recentres the globe and exposes its count in both the visual callout and textual selection.

## Validation and limits

`tests/unit/belvedere-globe.test.ts` checks orthographic orientation, front/back hemisphere geometry, poles, antimeridian continuity, source coordinate bounds, small-country lookup, rejection of unknown locations, and conservation of unknown-country counts. Browser checks must additionally cover dragging, keyboard focus, country selection, data-mode changes, responsive layout, and reduced motion. Local fixture captures demonstrate rendering and interaction; they are not evidence of live customer country data.

The implementation deliberately uses static public-domain geography and Canvas 2D after considering [COBE's documented lightweight WebGL globe](https://cobe.vercel.app/). This avoids a WebGL dependency and preserves rendering control, stable country positions, and an equivalent native HTML ranking. It is a country overview, not a geographic heatmap or an assertion of precise connection locations.
