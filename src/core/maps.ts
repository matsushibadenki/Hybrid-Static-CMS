import { config } from "./config";
import { escapeHtml } from "./content";
import { sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type MapProvider = "openstreetmap" | "google";
export type MapDisplayMode = "marker" | "route";
export type MapTravelMode = "driving" | "walking" | "bicycling" | "transit";
export type MapStatus = "draft" | "published";

export type MapEmbed = {
  id: number;
  title: string;
  slug: string;
  provider: MapProvider;
  displayMode: MapDisplayMode;
  startLat: number;
  startLng: number;
  startLabel: string;
  endLat: number | null;
  endLng: number | null;
  endLabel: string;
  travelMode: MapTravelMode;
  zoom: number;
  height: number;
  status: MapStatus;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MapEmbedInput = Omit<MapEmbed, "id" | "createdBy" | "createdAt" | "updatedAt">;

function normalize(row: Record<string, unknown>): MapEmbed {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    provider: row.provider as MapProvider,
    displayMode: row.display_mode as MapDisplayMode,
    startLat: Number(row.start_lat),
    startLng: Number(row.start_lng),
    startLabel: String(row.start_label ?? ""),
    endLat: row.end_lat == null ? null : Number(row.end_lat),
    endLng: row.end_lng == null ? null : Number(row.end_lng),
    endLabel: String(row.end_label ?? ""),
    travelMode: row.travel_mode as MapTravelMode,
    zoom: Number(row.zoom),
    height: Number(row.height),
    status: row.status as MapStatus,
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function coordinate(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new AppValidationError(`${label} must be between ${min} and ${max}.`);
}

function validateInput(input: MapEmbedInput) {
  requireNonEmpty(input.title, "Title");
  if (input.title.trim().length > 200) throw new AppValidationError("Map title must be 200 characters or fewer.");
  if (input.startLabel.trim().length > 300 || input.endLabel.trim().length > 300) throw new AppValidationError("Map labels must be 300 characters or fewer.");
  validateSlug(input.slug);
  if (!(["openstreetmap", "google"] as string[]).includes(input.provider)) throw new AppValidationError("Select a valid map provider.");
  if (!(["marker", "route"] as string[]).includes(input.displayMode)) throw new AppValidationError("Select a valid map display mode.");
  if (!(["driving", "walking", "bicycling", "transit"] as string[]).includes(input.travelMode)) throw new AppValidationError("Select a valid travel mode.");
  if (input.provider === "openstreetmap" && input.displayMode === "route" && input.travelMode === "transit") {
    throw new AppValidationError("Transit routes require Google Maps.");
  }
  if (!(["draft", "published"] as string[]).includes(input.status)) throw new AppValidationError("Status must be draft or published.");
  coordinate(input.startLat, -90, 90, "Start latitude");
  coordinate(input.startLng, -180, 180, "Start longitude");
  if (input.displayMode === "route") {
    coordinate(input.endLat ?? Number.NaN, -90, 90, "Destination latitude");
    coordinate(input.endLng ?? Number.NaN, -180, 180, "Destination longitude");
  }
  if (!Number.isInteger(input.zoom) || input.zoom < 0 || input.zoom > 21) throw new AppValidationError("Zoom must be between 0 and 21.");
  if (!Number.isInteger(input.height) || input.height < 200 || input.height > 1000) throw new AppValidationError("Map height must be between 200 and 1000 pixels.");
}

export async function listMaps(status: MapStatus | "any" = "any") {
  const rows = status === "any"
    ? await sql`select * from map_embeds order by updated_at desc, id desc`
    : await sql`select * from map_embeds where status = ${status} order by updated_at desc, id desc`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function getMapById(id: number) {
  const rows = await sql`select * from map_embeds where id = ${id} limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function getPublishedMapBySlug(slug: string) {
  const rows = await sql`select * from map_embeds where slug = ${slug} and status = 'published' limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function createMap(input: MapEmbedInput, createdBy: number) {
  validateInput(input);
  try {
    const rows = await sql`
      insert into map_embeds (
        title, slug, provider, display_mode, start_lat, start_lng, start_label,
        end_lat, end_lng, end_label, travel_mode, zoom, height, status, created_by
      ) values (
        ${input.title.trim()}, ${input.slug}, ${input.provider}, ${input.displayMode}, ${input.startLat}, ${input.startLng}, ${input.startLabel.trim()},
        ${input.displayMode === "route" ? input.endLat : null}, ${input.displayMode === "route" ? input.endLng : null}, ${input.endLabel.trim()},
        ${input.travelMode}, ${input.zoom}, ${input.height}, ${input.status}, ${createdBy}
      ) returning id
    `;
    return getMapById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateMap(id: number, input: MapEmbedInput) {
  validateInput(input);
  try {
    await sql`
      update map_embeds set
        title = ${input.title.trim()}, slug = ${input.slug}, provider = ${input.provider}, display_mode = ${input.displayMode},
        start_lat = ${input.startLat}, start_lng = ${input.startLng}, start_label = ${input.startLabel.trim()},
        end_lat = ${input.displayMode === "route" ? input.endLat : null}, end_lng = ${input.displayMode === "route" ? input.endLng : null},
        end_label = ${input.endLabel.trim()}, travel_mode = ${input.travelMode}, zoom = ${input.zoom}, height = ${input.height},
        status = ${input.status}, updated_at = now()
      where id = ${id}
    `;
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
  return getMapById(id);
}

export async function deleteMap(id: number) {
  await sql`delete from map_embeds where id = ${id}`;
}

export function mapGoogleUrl(map: MapEmbed) {
  const params = new URLSearchParams({ api: "1" });
  if (map.displayMode === "route" && map.endLat != null && map.endLng != null) {
    params.set("origin", `${map.startLat},${map.startLng}`);
    params.set("destination", `${map.endLat},${map.endLng}`);
    params.set("travelmode", map.travelMode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  params.set("query", `${map.startLat},${map.startLng}`);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function renderMapPlaceholder(map: MapEmbed) {
  const label = map.startLabel || map.title;
  return `<figure class="hsc-map-figure"><div class="hsc-map-embed" data-hsc-map="${escapeHtml(map.slug)}" style="min-height:${map.height}px" aria-label="${escapeHtml(map.title)}"></div><noscript><a href="${escapeHtml(mapGoogleUrl(map))}" rel="noopener noreferrer">${escapeHtml(label)}</a></noscript></figure>`;
}

export async function expandPublishedMaps(bodyHtml: string) {
  const matches = [...bodyHtml.matchAll(/\[\[map:([a-z0-9-]+)\]\]/g)];
  if (!matches.length) return bodyHtml;
  const replacements = new Map<string, string>();
  for (const match of matches) {
    const slug = match[1];
    if (replacements.has(slug)) continue;
    const map = await getPublishedMapBySlug(slug);
    replacements.set(slug, map ? renderMapPlaceholder(map) : `<span class="hsc-map-missing">${escapeHtml(`Missing map: ${slug}`)}</span>`);
  }
  const expanded = bodyHtml.replace(/\[\[map:([a-z0-9-]+)\]\]/g, (_, slug: string) => replacements.get(slug) ?? "");
  return `${expanded}<script src="/cms/maps.js" defer></script>`;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderMapsClientScript(maps: MapEmbed[]) {
  const definitions = Object.fromEntries(maps.map((map) => [map.slug, {
    title: map.title, provider: map.provider, mode: map.displayMode,
    start: { lat: map.startLat, lng: map.startLng, label: escapeHtml(map.startLabel || map.title) },
    end: map.endLat == null || map.endLng == null ? null : { lat: map.endLat, lng: map.endLng, label: escapeHtml(map.endLabel || "Destination") },
    travelMode: map.travelMode, zoom: map.zoom, height: map.height, googleUrl: mapGoogleUrl(map),
  }]));
  const runtime = {
    definitions,
    googleKey: config.googleMapsEmbedApiKey,
    tileUrl: config.openStreetMapTileUrl,
    routingUrl: config.openStreetMapRoutingUrl,
  };
  return `(()=>{
  const settings=${safeJson(runtime)};
  const leafletCss="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const leafletJs="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  let leafletPromise;
  function loadLeaflet(){if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{if(!document.querySelector('link[data-hsc-leaflet]')){const link=document.createElement('link');link.rel='stylesheet';link.href=leafletCss;link.dataset.hscLeaflet='true';document.head.appendChild(link);}const existing=document.querySelector('script[data-hsc-leaflet]');if(existing){existing.addEventListener('load',()=>resolve(window.L),{once:true});existing.addEventListener('error',reject,{once:true});return;}const script=document.createElement('script');script.src=leafletJs;script.dataset.hscLeaflet='true';script.onload=()=>resolve(window.L);script.onerror=reject;document.head.appendChild(script);});return leafletPromise;}
  function addStyles(){if(document.getElementById('hsc-map-styles'))return;const style=document.createElement('style');style.id='hsc-map-styles';style.textContent='.hsc-map-figure{margin:1.5rem 0}.hsc-map-embed{width:100%;background:#f3f5f4;position:relative}.hsc-map-embed iframe,.hsc-map-canvas{display:block;width:100%;height:100%;border:0}.hsc-map-link{display:inline-flex;margin-top:.65rem;color:inherit}.hsc-map-message{display:grid;place-items:center;min-height:200px;padding:24px;text-align:center;border:1px solid #d8ddda}';document.head.appendChild(style);}
  function googleEmbed(def){if(!settings.googleKey)return '';const base='https://www.google.com/maps/embed/v1/';const params=new URLSearchParams({key:settings.googleKey});if(def.mode==='route'&&def.end){params.set('origin',def.start.lat+','+def.start.lng);params.set('destination',def.end.lat+','+def.end.lng);params.set('mode',def.travelMode);return base+'directions?'+params;}params.set('q',def.start.lat+','+def.start.lng);params.set('zoom',String(def.zoom));return base+'place?'+params;}
  function routeProfile(mode){return mode==='walking'?'foot':mode==='bicycling'?'bike':'driving';}
  function externalLink(url,label){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;return link;}
  function message(root,label,url){const box=document.createElement('div');box.className='hsc-map-message';if(url)box.appendChild(externalLink(url,label));else box.textContent=label;root.replaceChildren(box);}
  async function renderOsm(root,def){
    const L=await loadLeaflet();const canvas=document.createElement('div');canvas.className='hsc-map-canvas';canvas.style.height=def.height+'px';root.replaceChildren(canvas);
    const map=L.map(canvas).setView([def.start.lat,def.start.lng],def.zoom);L.tileLayer(settings.tileUrl,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    L.marker([def.start.lat,def.start.lng]).addTo(map).bindPopup(def.start.label);
    if(def.mode==='route'&&def.end){L.marker([def.end.lat,def.end.lng]).addTo(map).bindPopup(def.end.label);let layer;try{const coords=def.start.lng+','+def.start.lat+';'+def.end.lng+','+def.end.lat;const routingBase=settings.routingUrl.endsWith('/')?settings.routingUrl.slice(0,-1):settings.routingUrl;const url=routingBase+'/route/v1/'+routeProfile(def.travelMode)+'/'+coords+'?overview=full&geometries=geojson';const response=await fetch(url);if(!response.ok)throw new Error('Route service '+response.status);const data=await response.json();if(data.code!=='Ok'||!data.routes?.length)throw new Error('Route unavailable');layer=L.geoJSON(data.routes[0].geometry,{style:{weight:6,opacity:.85}}).addTo(map);}catch(error){console.warn('[Hybrid-Static-CMS maps]',error);layer=L.polyline([[def.start.lat,def.start.lng],[def.end.lat,def.end.lng]],{dashArray:'7 8'}).addTo(map);}map.fitBounds(layer.getBounds(),{padding:[30,30]});}
    const link=externalLink(def.googleUrl,'Open in Google Maps');link.className='hsc-map-link';root.insertAdjacentElement('afterend',link);setTimeout(()=>map.invalidateSize(),0);
  }
  function renderGoogle(root,def){const src=googleEmbed(def);if(!src){message(root,'Open '+def.title+' in Google Maps',def.googleUrl);return;}const iframe=document.createElement('iframe');iframe.src=src;iframe.title=def.title;iframe.loading='lazy';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.style.height=def.height+'px';root.replaceChildren(iframe);}
  async function render(root){if(root.dataset.hscMapReady)return;const def=settings.definitions[root.dataset.hscMap||''];if(!def){message(root,'Map is unavailable.');return;}root.dataset.hscMapReady='true';root.style.minHeight=def.height+'px';try{if(def.provider==='google')renderGoogle(root,def);else await renderOsm(root,def);}catch(error){console.error('[Hybrid-Static-CMS maps]',error);message(root,'Open map',def.googleUrl);}}
  function renderAll(scope=document){addStyles();scope.querySelectorAll('[data-hsc-map]').forEach(render);}
  window.HybridStaticCMSMaps={render:renderAll,definitions:settings.definitions};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>renderAll(),{once:true});else renderAll();
})();`;
}
