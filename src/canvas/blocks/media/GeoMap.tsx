// A real, interactive vector map backed by OpenFreeMap. Its public-service terms were reviewed on
// 2026-08-11; MapLibre is BSD-3-Clause and is loaded only when a map renders.
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { Icon } from '../../../icons/icons';
import { safeCssColor } from '../../../lib/safeCssColor';
import { disposeMap, loadMapLibre } from './maplibreRuntime';
import { MapAttribution } from './MapAttribution';
import type { GeoMapProps, GeoZone, ZoneCategory } from './types';

const styleUrl = (light: boolean): string =>
  `https://tiles.openfreemap.org/styles/${light ? 'positron' : 'dark'}`;

// Inside a static export the fixed figure theme wins; live maps follow the app theme.
const isLight = (el?: HTMLElement | null): boolean => {
  const fig = el?.closest('.figure-embed') as HTMLElement | null;
  if (fig) return fig.getAttribute('data-theme-mode') !== 'dark';
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
  );
};

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

function resolvedColor(el: HTMLElement, value: string): string {
  const token = /^var\((--[^)]+)\)$/.exec(value)?.[1];
  return token ? getComputedStyle(el).getPropertyValue(token).trim() || 'transparent' : value;
}

/**
 * Whether a string will actually PAINT. `name` is required by GeoMarker, but a model fills it, and
 * a blank — or a run of zero-width/format characters, which survives every trim — would render a
 * numbered row with nothing beside it: a pin the reader can see and cannot identify.
 *
 * The stripped copy is only the TEST. What renders is the original, because U+200D joins the parts
 * of an emoji and removing it would corrupt a name that was fine.
 */
function paints(text: string | undefined): text is string {
  return !!text && text.replace(/[\p{Cf}\p{Cc}]/gu, '').trim().length > 0;
}

function popupContent(title: string, detail?: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'geo-pop';
  const strong = document.createElement('b');
  strong.textContent = title;
  root.append(strong);
  if (detail) {
    const copy = document.createElement('div');
    copy.className = 'geo-pop-d';
    copy.textContent = detail;
    root.append(copy);
  }
  return root;
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
  const [tilesReady, setTilesReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const pins = useMemo(
    () =>
      (markers || []).filter(
        (m) =>
          Number.isFinite(m.lat) &&
          Number.isFinite(m.lng) &&
          Math.abs(m.lat) <= 90 &&
          Math.abs(m.lng) <= 180,
      ),
    [markers],
  );
  const zonesValid = useMemo(() => validZones(zones), [zones]);
  const legendCategories = zonesValid.reduce<ZoneCategory[]>((acc, z) => {
    if (!acc.includes(z.category)) acc.push(z.category);
    return acc;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pins.length) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let mapMarkers: MapLibreMarker[] = [];
    let themeObs: MutationObserver | null = null;
    setTilesReady(false);
    let unveilCap = 0;
    const unveil = () => {
      window.clearTimeout(unveilCap);
      unveilCap = 0;
      if (!cancelled) setTilesReady(true);
    };
    unveilCap = window.setTimeout(unveil, 8000);

    void (async () => {
      const ml = await loadMapLibre();
      if (cancelled || !ref.current) return;
      if (!ml) {
        // Nothing will ever paint, so waiting out the cap would only shimmer for 8s and then
        // fade to an empty slab — say so now instead.
        window.clearTimeout(unveilCap);
        setMapFailed(true);
        return;
      }
      map = new ml.Map({
        container: ref.current,
        style: styleUrl(isLight(ref.current)),
        center: [pins[0].lng, pins[0].lat],
        zoom: zoom ?? 13,
        // The always-expanded control shows the style's own OpenFreeMap/OpenMapTiles/OSM credit;
        // a customAttribution copy of the same text would render the line twice.
        attributionControl: { compact: false },
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 0,
        maxTileCacheSize: 48,
        canvasContextAttributes: { preserveDrawingBuffer: true, powerPreference: 'low-power' },
      });

      const addZones = () => {
        if (!map || !ref.current || !map.isStyleLoaded() || map.getSource('mavea-zones')) return;
        const features = zonesValid.map((zone, index) => ({
          type: 'Feature' as const,
          id: index,
          properties: {
            label: zone.label,
            category: CATEGORY_LABEL[zone.category],
            color: resolvedColor(ref.current!, CATEGORY_COLOR[zone.category]),
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                ...zone.coords.map(([lat, lng]) => [lng, lat]),
                [zone.coords[0][1], zone.coords[0][0]],
              ],
            ],
          },
        }));
        map.addSource('mavea-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
        map.addLayer({
          id: 'mavea-zones-fill',
          type: 'fill',
          source: 'mavea-zones',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
        });
        map.addLayer({
          id: 'mavea-zones-line',
          type: 'line',
          source: 'mavea-zones',
          paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
        });
      };

      map.on('styledata', addZones);
      map.on('idle', unveil);

      mapMarkers = pins.map((marker, index) => {
        const pin = document.createElement('span');
        pin.className = 'geo-pin';
        pin.style.setProperty('--geo-c', safeCssColor(marker.color));
        pin.textContent = String(index + 1);
        // setPopup makes the pin focusable and Space/Enter-operable; a name and a role are all
        // it still needs so a screen reader announces the place, not a bare number.
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-label', marker.name);
        const popup = popupContent(marker.name, marker.detail);
        const link = document.createElement('a');
        link.className = 'geo-pop-a';
        link.href = `https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lng}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open in Google Maps ↗';
        popup.append(link);
        // The pin is a tail-less circle, so its centre — MapLibre's default anchor — is what
        // sits on the coordinate; bottom-anchoring would float it half a badge north.
        return new ml.Marker({ element: pin })
          .setLngLat([marker.lng, marker.lat])
          .setPopup(new ml.Popup({ offset: 18 }).setDOMContent(popup))
          .addTo(map!);
      });

      const bounds = new ml.LngLatBounds();
      for (const marker of pins) bounds.extend([marker.lng, marker.lat]);
      for (const zone of zonesValid) {
        for (const [lat, lng] of zone.coords) bounds.extend([lng, lat]);
      }
      if (pins.length + zonesValid.flatMap((zone) => zone.coords).length > 1) {
        map.fitBounds(bounds, { padding: 34, duration: 0 });
      }

      let currentStyle = styleUrl(isLight(ref.current));
      themeObs = new MutationObserver(() => {
        const nextStyle = styleUrl(isLight(ref.current));
        if (!map || nextStyle === currentStyle) return;
        currentStyle = nextStyle;
        setTilesReady(false);
        // Re-veiling needs the cap re-armed (the first one already fired), or a style that never
        // loads shimmers forever; clear first, since the theme can flip twice inside the window.
        window.clearTimeout(unveilCap);
        unveilCap = window.setTimeout(unveil, 8000);
        map.setStyle(nextStyle);
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
      disposeMap(map, mapMarkers);
      mapMarkers = [];
    };
  }, [pins, zonesValid, zoom]);

  // Nothing on the card may describe a map that isn't on screen: no legend for zones that were
  // never drawn, no "drag to explore" under an empty slab.
  const mapShown = pins.length > 0 && !mapFailed;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {mapFailed ? (
        <div className="geo-map geo-map-empty faint">Map couldn’t load.</div>
      ) : pins.length ? (
        <div
          ref={ref}
          className="geo-map"
          data-tiles={tilesReady ? 'ready' : 'loading'}
          aria-busy={!tilesReady}
        />
      ) : (
        <div className="geo-map geo-map-empty faint">No locations to map.</div>
      )}
      {mapShown && <MapAttribution />}
      {mapShown && legendCategories.length > 0 && (
        <div className="geo-zone-legend">
          {legendCategories.map((cat) => (
            <span className="geo-zone-chip" key={cat}>
              <span className="geo-zone-swatch" style={{ background: CATEGORY_COLOR[cat] }} />
              {CATEGORY_LABEL[cat]}
            </span>
          ))}
        </div>
      )}
      {/* The places, named. A pin paints its NUMBER and nothing else — the name reaches the reader
          only through a popup that costs a click — so a map of five bars was five anonymous circles
          and the name had to be asked for again in words. Numbered from `pins`, the same validated
          array the markers are built from, so a marker dropped for bad coordinates can never slide
          the list out of step with the map. Gated on the pins rather than on `mapShown`: these are
          the card's CONTENT, not a description of the map, so they survive a map that never loaded
          — the same contract MapRoute keeps for its stops. */}
      {pins.length > 0 && (
        <ol className="geo-list">
          {pins.map((marker, index) => (
            <li className="geo-row" key={index}>
              <span
                className="geo-row-n"
                style={{ ['--geo-c' as string]: safeCssColor(marker.color) } as CSSProperties}
                // The number is the tie to the circle on the map, which a screen reader cannot see
                // anyway; the list already conveys position, so announcing it again is noise.
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="geo-row-body">
                <span className="geo-row-label">
                  {paints(marker.name) ? marker.name.trim() : 'Unnamed place'}
                </span>
                {paints(marker.detail) && (
                  <span className="geo-row-detail">{marker.detail.trim()}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {(footer || mapShown) && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer || (
            <span className="faint">
              Real map · {pins.length} location{pins.length === 1 ? '' : 's'} · drag to explore
            </span>
          )}
        </div>
      )}
    </div>
  );
}
