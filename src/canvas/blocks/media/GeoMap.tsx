// A REAL, interactive map — Leaflet + free CARTO/OpenStreetMap tiles (no API key). The model
// supplies actual coordinates (it reliably knows lat/lng for real places), so location answers
// render a draggable, zoomable map with pins + "Open in Google Maps" popups, instead of the
// stylized grid or an unreliable model-supplied photo.
//
// Leaflet is loaded via a lazy import() so it's code-split into its own chunk, fetched only when a
// map actually renders — its CSS rides along in that same chunk. The boundary to the untyped
// module is `any` — kept tight to this file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { safeCssColor } from '../../../lib/safeCssColor';
import type { GeoMapProps, GeoZone, ZoneCategory } from './types';

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const tileUrl = (light: boolean): string =>
  `https://{s}.basemaps.cartocdn.com/${light ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png`;

// Light vs dark basemap. Inside a static export figure the map should match the SKIN (the embed
// wrapper carries `data-theme-mode`), not the app's live theme — so a light document never shows a
// dark map. Live (no embed wrapper) follows the app theme as before.
const isLight = (el?: HTMLElement | null): boolean => {
  const fig = el?.closest('.figure-embed') as HTMLElement | null;
  if (fig) return fig.getAttribute('data-theme-mode') !== 'dark';
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
  );
};

const esc = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c],
  );

// zoning overlay — additive: every zone/marker/route path above is untouched when `zones` is
// omitted. One fixed color per land-use category, drawn as a filled Leaflet polygon under the
// pins, plus a legend chip row naming only the categories actually present.
const ZONE_CATEGORIES = new Set<ZoneCategory>([
  'residential',
  'commercial',
  'industrial',
  'mixed',
  'open-space',
]);
const CATEGORY_COLOR: Record<ZoneCategory, string> = {
  residential: 'var(--presence)',
  commercial: 'var(--warning)',
  industrial: 'var(--danger)',
  mixed: 'var(--presence-soft)',
  'open-space': 'var(--insight)',
};
const CATEGORY_LABEL: Record<ZoneCategory, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  mixed: 'Mixed use',
  'open-space': 'Open space',
};

interface ValidZone {
  coords: [number, number][];
  category: ZoneCategory;
  label: string;
}

/** Only zones with a real (≥3-point, in-range) polygon survive — a loose model reply is dropped
 *  rather than drawn, the same call this file already makes for a marker with a bad coordinate.
 *  An unrecognised/missing category falls back to 'mixed' rather than being dropped, since the
 *  polygon itself is still real data worth showing. */
function validZones(zones: GeoZone[] | undefined): ValidZone[] {
  if (!Array.isArray(zones)) return [];
  return zones
    .map((z): ValidZone | null => {
      const coords = (Array.isArray(z?.coords) ? z.coords : []).filter(
        (c): c is [number, number] =>
          Array.isArray(c) &&
          c.length === 2 &&
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1]) &&
          Math.abs(c[0]) <= 90 &&
          Math.abs(c[1]) <= 180,
      );
      if (coords.length < 3) return null;
      const category = ZONE_CATEGORIES.has(z?.category) ? z.category : 'mixed';
      const label =
        typeof z?.label === 'string' && z.label.trim() ? z.label.trim() : CATEGORY_LABEL[category];
      return { coords, category, label };
    })
    .filter((z): z is ValidZone => z !== null);
}

type Props = GeoMapProps & { delay?: number };

export function GeoMap({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  markers,
  zoom,
  zones,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const ref = useRef<HTMLDivElement>(null);
  // Drives the shimmer veil (styles.css): the pane sits behind it until the basemap has actually
  // painted, so a slow tile CDN shows a deliberate loading state instead of a grey void.
  const [tilesReady, setTilesReady] = useState(false);

  // Only real, in-range coordinates (model data is untrusted).
  const pins = (markers || []).filter(
    (m) =>
      Number.isFinite(m.lat) &&
      Number.isFinite(m.lng) &&
      Math.abs(m.lat) <= 90 &&
      Math.abs(m.lng) <= 180,
  );
  const pinsKey = JSON.stringify(pins);
  const zonesValid = validZones(zones);
  const zonesKey = JSON.stringify(zonesValid);
  // Only the categories actually present, in a stable first-seen order, for the legend row.
  const legendCategories = zonesValid.reduce<ZoneCategory[]>((acc, z) => {
    if (!acc.includes(z.category)) acc.push(z.category);
    return acc;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pins.length) return;
    let cancelled = false;
    let map: any = null;
    let tiles: any = null;
    let themeObs: MutationObserver | null = null;

    // Re-veil on every rebuild (new pins/zoom = a fresh blank pane), then drop the veil on the
    // first complete tile load. The 8s cap is the honest-degrade path: if the CDN crawls (or the
    // 'load' event never comes), show whatever tiles have arrived rather than shimmer forever.
    setTilesReady(false);
    const unveil = () => {
      if (!cancelled) setTilesReady(true);
    };
    const unveilCap = window.setTimeout(unveil, 8000);

    void (async () => {
      // leaflet ships no type declarations, so the import boundary stays `any`.
      // @ts-expect-error — no declaration file for 'leaflet'
      const mod: any = await import('leaflet').catch(() => null);
      const L = mod?.default ?? mod;
      if (cancelled || !ref.current || !L?.map) return;

      // Instant zoom (no CSS transition): the animated zoom waits on a transitionend that never
      // arrives if the tab hides mid-animation, leaving the +/− controls permanently dead.
      map = L.map(ref.current, {
        scrollWheelZoom: false,
        attributionControl: true,
        zoomAnimation: false,
      });
      tiles = L.tileLayer(tileUrl(isLight(ref.current)), {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
        // The tiles set `Access-Control-Allow-Origin: *`; requesting them anonymously lets the
        // export rasterizer read the canvas without tainting it, so a real map survives into the PDF.
        crossOrigin: 'anonymous',
      }).addTo(map);
      tiles.once('load', unveil);
      // If the CARTO basemap is blocked or unreachable, the panel would otherwise sit blank/grey.
      // Fall back ONCE to OpenStreetMap so the user still gets real streets under the pins.
      let fellBack = false;
      tiles.on('tileerror', () => {
        if (fellBack || cancelled || !map) return;
        fellBack = true;
        map.removeLayer(tiles);
        tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          subdomains: 'abc',
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          crossOrigin: 'anonymous',
        }).addTo(map);
        // the swap threw away the CARTO layer's pending 'load' — re-arm on the replacement
        tiles.once('load', unveil);
      });

      // zoning overlay, drawn under the pins so a marker never hides behind a zone fill
      zonesValid.forEach((z) => {
        const color = CATEGORY_COLOR[z.category];
        const poly = L.polygon(z.coords, {
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.22,
        }).addTo(map);
        poly.bindPopup(
          `<div class="geo-pop"><b>${esc(z.label)}</b><div class="geo-pop-d">${esc(CATEGORY_LABEL[z.category])}</div></div>`,
        );
      });

      pins.forEach((m, i) => {
        // The marker colour is model-supplied and lands in a live `style` attribute, so it has to
        // clear the CSS gate — not the HTML one. `esc()` escapes &<>" and nothing else, which is
        // exactly right for text between tags and useless inside a declaration: a value like
        // `red;background:url(...)` carries no HTML metacharacters at all, survives escaping intact,
        // and closes out --geo-c to inject a second declaration. safeCssColor is the gate every
        // other colour-bearing block already uses.
        const color = safeCssColor(m.color);
        const ic = L.divIcon({
          className: 'geo-divicon',
          html: `<span class="geo-pin" style="--geo-c:${esc(color)}">${i + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const gmaps = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`;
        const popup = `<div class="geo-pop"><b>${esc(m.name)}</b>${
          m.detail ? `<div class="geo-pop-d">${esc(m.detail)}</div>` : ''
        }<a class="geo-pop-a" href="${gmaps}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></div>`;
        L.marker([m.lat, m.lng], { icon: ic }).addTo(map).bindPopup(popup);
      });

      // Fit to every pin AND every zone vertex when zones are present, so the whole overlay is
      // in frame — identical to the pin-only framing below when `zones` is omitted.
      const boundsPts: [number, number][] = pins.map((m) => [m.lat, m.lng] as [number, number]);
      for (const z of zonesValid) boundsPts.push(...z.coords);
      if (boundsPts.length > 1) map.fitBounds(boundsPts, { padding: [34, 34] });
      else map.setView([pins[0].lat, pins[0].lng], zoom ?? 13);

      // keep the live basemap in sync with light/dark theme (a no-op inside a fixed-theme export,
      // and skipped once we've fallen back to OSM, which has no light/dark variant to swap to)
      themeObs = new MutationObserver(() => {
        if (!fellBack) tiles?.setUrl(tileUrl(isLight(ref.current)));
      });
      themeObs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(unveilCap);
      themeObs?.disconnect();
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, zonesKey, zoom]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {pins.length ? (
        <div
          ref={ref}
          className="geo-map"
          data-tiles={tilesReady ? 'ready' : 'loading'}
          aria-busy={!tilesReady}
        />
      ) : (
        <div className="geo-map geo-map-empty faint">No locations to map.</div>
      )}
      {legendCategories.length > 0 && (
        <div className="geo-zone-legend">
          {legendCategories.map((cat) => (
            <span className="geo-zone-chip" key={cat}>
              <span className="geo-zone-swatch" style={{ background: CATEGORY_COLOR[cat] }} />
              {CATEGORY_LABEL[cat]}
            </span>
          ))}
        </div>
      )}
      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer || (
          <span className="faint">
            Real map · {pins.length} location{pins.length === 1 ? '' : 's'} · drag to explore
          </span>
        )}
      </div>
    </div>
  );
}
