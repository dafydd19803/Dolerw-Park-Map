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

Click inside the blue Dolerw boundary to place or update the marker. Latitude and longitude are shown to six decimal places. The copy and clear buttons operate on the current selection.

The GeoJSON polygon ring check also includes hole handling for future Polygon data.

Use the map's layer selector to switch between OpenStreetMap and Esri satellite imagery. The separate geographic-layer selector controls the park boundary and optional GeoJSON overlays.

## what3words

The prototype does not request or invent what3words addresses. It shows `what3words lookup not configured`.

After selecting a point, **Find on what3words** opens the official map in a new tab and copies the selected six-decimal coordinates to the clipboard. Paste them into what3words' search field to find that location. Testing showed coordinate-only map URLs display the same default three-word label for different coordinates instead of resolving a precise address. The official coordinates-to-three-word conversion API requires an API key, so the prototype does not place coordinates in a URL that could show an unrelated address, calculate addresses, or display unverified results.

Future integration belongs in `modules/what3words.js`. Set `W3W_ENDPOINT` in `script.js` to a secure WordPress REST endpoint. The endpoint should accept `lat` and `lng`, call the official what3words API from the server, and return JSON containing an `address` property. API credentials must remain in WordPress server configuration.

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

- what3words is not connected.
- No event, booking or administration features are implemented.
- Map data and optional layers depend on the supplied static GeoJSON.
- Geographic feature names must be available in their `properties.name` field.
