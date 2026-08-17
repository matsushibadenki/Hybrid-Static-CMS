# Maps and reusable snippets

Hybrid-Static-CMS manages reusable pinpoint and route maps under
`/control-panel/maps`. Published map definitions are compiled into
`public_html/cms/maps.js`, so they work in CMS-generated pages and hand-written
HTML or PHP without exposing the control panel.

## CMS shortcode

Add the following to a post or fixed-page Body HTML field:

```text
[[map:tokyo-route]]
```

The static renderer replaces the shortcode with a map container and loads the
generated map runtime. Draft or missing definitions are not exposed.

## Existing HTML and PHP

Place this markup in any browser-rendered HTML or PHP template under
`public_html`:

```html
<div data-hsc-map="tokyo-route"></div>
<script src="/cms/maps.js" defer></script>
```

The PHP server does not need to call the CMS API. Regenerate public output after
publishing or changing a map so `maps.js` contains the latest definitions.
JavaScript applications that add containers later can call
`window.HybridStaticCMSMaps.render()`.

## OpenStreetMap

OpenStreetMap maps use Leaflet 1.9.4 in the browser. Marker mode places one
pin. Route mode places the start and destination pins, requests GeoJSON from an
OSRM-compatible service, and fits the route into view. If routing fails, a
dashed straight line is shown and the Google Maps directions link remains
available.

The defaults are suitable for development and modest interactive viewing:

```dotenv
OPENSTREETMAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
OPENSTREETMAP_ROUTING_URL=https://router.project-osrm.org
```

The OpenStreetMap Foundation states that its map data is open but its standard
tile servers have limited donated capacity. Keep visible attribution, do not
prefetch or bulk-download tiles, preserve browser referrers and caching, and
configure a suitable hosted or self-hosted tile service for production traffic
that cannot comply with the standard tile policy:
<https://operations.osmfoundation.org/policies/tiles/>.

The public OSRM endpoint is a demonstration service. Production sites should
configure an OSRM-compatible provider or self-hosted router with the capacity
and travel profiles they require. Walking and bicycle profiles depend on that
service; a failed profile request uses the straight-line fallback.

## Google Maps

Google provider maps use the official Maps Embed API for `place` and
`directions` modes. Configure a browser-exposed Embed API key:

```dotenv
GOOGLE_MAPS_EMBED_API_KEY=your-restricted-browser-key
```

Restrict the key to the Maps Embed API and the production HTTP referrers. The
generated iframe uses `strict-origin-when-cross-origin`, which allows Google to
validate the site's origin without receiving the complete page path. Google
requires embedded maps to be at least 200 by 200 pixels; the CMS enforces a
minimum height of 200 pixels. Official setup details:
<https://developers.google.com/maps/documentation/embed/embedding-map>.

When the key is absent, the page displays a link using the key-free official
Google Maps URL format. OpenStreetMap maps also include this link for opening a
point or route in the Google Maps website or application:
<https://developers.google.com/maps/documentation/urls/get-started>.

## Privacy and security

- Coordinates, labels, and published map settings are public information.
- Do not use private addresses or confidential routes in published maps.
- Google API keys embedded in browser requests are not secrets; API and
  referrer restrictions are mandatory.
- Third-party map, tile, routing, and CDN requests disclose the visitor's IP
  address to those providers. Mention them in the site's privacy notice where
  required.
- Only owners and administrators can delete maps. Editors can create and update
  them, and viewers can inspect definitions in the control panel.
