# Dolerw Park Interactive Map

A standalone HTML, CSS and JavaScript prototype for exploring Dolerw Park in Open Newtown.

## Run locally

Serve the project folder with a local HTTP server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

Do not open `index.html` directly with a `file://` URL: browsers may block loading the GeoJSON and modules.

## Technology

- HTML5 and CSS3
- JavaScript modules
- Leaflet 1.9.4
- OpenStreetMap and Esri World Imagery basemaps
- The supplied `open-newtown.geojson`

Leaflet, OpenStreetMap and Esri imagery are loaded from their public services. An internet connection is required. The map shows attribution for the active basemap; Esri imagery is provided by Esri and its listed imagery sources and is subject to Esri's terms of use.

On desktop, the map is 650px tall and is the primary interface element. On smaller screens the map height adapts to the viewport, with the selected-location panel immediately below it.

## Geographic data

The supplied GeoJSON contains:

- `Dolerw`: the polygon used for Dolerw Park.
- `Park Grounds`: a separate polygon, creating a boundary ambiguity with `Dolerw`.
- `Trehafren Hill`, `Mochdre`, `Trehafren` and `Vaynor`: optional named overlays.
- Six empty polygons.

The application uses the feature whose exact name is `Dolerw`, fits the map to that boundary and rejects points outside it using a polygon point-in-containment check. The original GeoJSON is not modified.

The `Park Grounds` polygon is retained as an optional overlay rather than silently substituted for `Dolerw`. This avoids assuming whether it is a park sub-area or the complete park boundary.

Empty and invalid features are ignored and reported. The UI will show an error if no valid Dolerw feature is found or if multiple exact-name Dolerw matches make the selection ambiguous.

## Location selection

Click inside the blue Dolerw boundary to place or update the marker. Latitude and longitude are shown to six decimal places. At zoom level 18 or higher, the what3words grid loads for the visible part of Dolerw Park. Click a square to look up its official address; the returned square bounds are highlighted. The copy and clear buttons operate on the current selection.

The GeoJSON polygon ring check also includes hole handling for future Polygon data.

Use the map's layer selector to switch between OpenStreetMap and Esri satellite imagery. The separate geographic-layer selector controls the park boundary and optional GeoJSON overlays.

## what3words

The grid-section and convert-to-3wa calls use the official what3words API through a same-origin Cloudflare Pages Function. The browser never receives the API key. Grid requests are only made at zoom 18 or higher and are clipped to the current viewport and the Dolerw feature's bounding extent. The server validates both operations and enforces the API's 4 km grid-section request limit.

**Find on what3words** opens the official map in a new tab and copies the selected six-decimal coordinates to the clipboard. **Copy what3words** copies the official address returned by the API after a square is selected.

## Local API testing

The Cloudflare Pages Function is required for real what3words calls. Install Node.js, then create a `.dev.vars` file in the project root (this filename is ignored by Git):

```text
W3W_API_KEY=your_what3words_api_key
```

Run the app and function locally with Wrangler:

```powershell
npx wrangler pages dev . --port 8788
```

Open `http://localhost:8788/`, zoom to 18 or higher, wait for the grid, then select a square. Do not use a static file server for API tests; it will not execute Pages Functions. Never put the key in `script.js`, HTML, or a committed file.

## Cloudflare Pages setup

1. Deploy this project folder as a Cloudflare Pages project using its Git integration or `npx wrangler pages deploy . --project-name=<project-name>`. Keep the `functions/` directory at the project root.
2. In the Cloudflare dashboard, open the Pages project **Settings → Variables and Secrets** and add `W3W_API_KEY` as a **Secret** for Production. Add it separately for Preview if preview deployments need API access.
3. Alternatively, add the secret with Wrangler: `npx wrangler pages secret put W3W_API_KEY --project-name=<project-name>`.
4. Redeploy after setting or rotating the secret. The function returns an explicit configuration error if the secret is missing.

The Cloudflare Function at `functions/api/what3words.js` accepts only `grid` and `convert` operations, validates coordinates against the Dolerw feature extent and calls fixed what3words API endpoints. The client also checks point containment against the actual Dolerw polygon before requesting a conversion.

Check the current what3words API terms and pricing before enabling paid lookups.

## WordPress conversion

For a native plugin:

1. Wrap the HTML in a shortcode such as `[open_newtown_park_map]`.
2. Enqueue `styles.css`, Leaflet and the JavaScript modules only on pages containing the shortcode.
3. Expose GeoJSON through a plugin-owned, public read endpoint or enqueue it through WordPress.
4. Add a secure REST endpoint for what3words lookups.
5. Store credentials with the WordPress Options API or server environment configuration.
6. Prefix CSS and JavaScript identifiers and test against common themes and plugins.
7. Use capability checks and nonces for administration-only actions; REST read operations should remain appropriately public.
8. Add future custom post types or data models for event areas and bookings.

Do not modify the live Open Newtown website or WordPress installation during standalone development.

## Known limitations

- Live what3words requests require a configured API key and network access to the what3words API.
- No event, booking or administration features are implemented.
- Map data and optional layers depend on the supplied static GeoJSON.
- Geographic feature names must be available in their `properties.name` field.
