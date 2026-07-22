// An ordered route on a REAL, interactive map — the same Leaflet + free CARTO/OpenStreetMap tile
// setup as GeoMap (lazy import, themed popups, identical teardown to avoid leaks), plus a polyline
// drawn through the waypoints IN ORDER with numbered markers. Location/itinerary answers (a
// walking tour, a road trip leg) render a draggable line a person can actually follow, beside the
// stop-by-stop list and a distance/elevation summary computed from the props.
//
// Leaflet is loaded via a lazy import() so it's code-split into its own chunk; its CSS rides along
// in that same chunk. The boundary to the untyped module is `any`, kept tight to this file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { MapRouteProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const tileUrl = (light: boolean): string =>
  `https://{s}.basemaps.cartocdn.com/${light ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png`;

const isLight = (): boolean =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-theme') === 'light';

const esc = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c],
  );

type Props = MapRouteProps & { delay?: number };

export function MapRoute({
  title,
  icon = 'walk',
  iconColor = 'var(--presence)',
  center,
  zoom,
  waypoints,
  distanceKm,
  elevationGainM,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.walk;
  const ref = useRef<HTMLDivElement>(null);

  // Only real, in-range coordinates (model data is untrusted).
  const stops = (waypoints || []).filter(
    (w) =>
      Number.isFinite(w.lat) &&
      Number.isFinite(w.lng) &&
      Math.abs(w.lat) <= 90 &&
      Math.abs(w.lng) <= 180,
  );
  const stopsKey = JSON.stringify(stops);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stops.length) return;
    let cancelled = false;
    let map: any = null;
    let tiles: any = null;
    let themeObs: MutationObserver | null = null;

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
      tiles = L.tileLayer(tileUrl(isLight()), {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
      }).addTo(map);

      const latlngs = stops.map((w) => [w.lat, w.lng] as [number, number]);

      // The route line, drawn through the stops in order. A soft accent so it reads under the pins.
      if (latlngs.length > 1) {
        L.polyline(latlngs, {
          color: 'var(--presence)',
          weight: 4,
          opacity: 0.85,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(map);
      }

      stops.forEach((w, i) => {
        const ic = L.divIcon({
          className: 'geo-divicon',
          html: `<span class="geo-pin mr-pin">${i + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const gmaps = `https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}`;
        const popup = `<div class="geo-pop"><b>${i + 1}. ${esc(w.label)}</b>${
          w.leg ? `<div class="geo-pop-d">${esc(w.leg)}</div>` : ''
        }<a class="geo-pop-a" href="${gmaps}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></div>`;
        L.marker([w.lat, w.lng], { icon: ic }).addTo(map).bindPopup(popup);
      });

      if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [36, 36] });
      else {
        const c = center && Number.isFinite(center[0]) ? center : latlngs[0];
        map.setView(c, zoom ?? 14);
      }

      // keep the basemap in sync with light/dark theme
      themeObs = new MutationObserver(() => tiles?.setUrl(tileUrl(isLight())));
      themeObs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    })();

    return () => {
      cancelled = true;
      themeObs?.disconnect();
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, zoom]);

  const hasSummary = distanceKm !== undefined || elevationGainM !== undefined;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {stops.length ? (
        <div ref={ref} className="geo-map mr-map" />
      ) : (
        <div className="geo-map geo-map-empty faint">No route to map.</div>
      )}

      {hasSummary && (
        <div className="mr-summary">
          {distanceKm !== undefined && Number.isFinite(distanceKm) && (
            <div className="mr-stat">
              <span className="mr-stat-v">{formatValue(distanceKm, { unit: 'km' })}</span>
              <span className="mr-stat-k">distance</span>
            </div>
          )}
          {elevationGainM !== undefined && Number.isFinite(elevationGainM) && (
            <div className="mr-stat">
              <span className="mr-stat-v">{formatValue(elevationGainM, { unit: 'm' })}</span>
              <span className="mr-stat-k">elevation gain</span>
            </div>
          )}
          <div className="mr-stat">
            <span className="mr-stat-v">{stops.length}</span>
            <span className="mr-stat-k">stop{stops.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      {stops.length > 0 && (
        <ol className="mr-list">
          {stops.map((w, i) => (
            <li key={i} className="mr-row">
              <span className="mr-row-n">{i + 1}</span>
              <div className="mr-row-body">
                <span className="mr-row-label">{w.label}</span>
                {w.leg && <span className="mr-row-leg">{w.leg}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {caption && <p className="mr-caption">{caption}</p>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
