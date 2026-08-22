// An ordered route on a real OpenFreeMap vector map. MapLibre is loaded only for cards that need it,
// and the route data stays in a separate source so a light/dark style swap cannot lose it.
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import { formatValue } from '../../lib/format';
import { disposeMap, loadMapLibre } from './maplibreRuntime';
import { MapAttribution } from './MapAttribution';
import type { MapRouteProps } from './types';

const styleUrl = (light: boolean): string =>
  `https://tiles.openfreemap.org/styles/${light ? 'positron' : 'dark'}`;
const isLight = (el?: HTMLElement | null): boolean => {
  const fig = el?.closest('.figure-embed') as HTMLElement | null;
  if (fig) return fig.getAttribute('data-theme-mode') !== 'dark';
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
  );
};

function popupContent(index: number, label: string, leg?: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'geo-pop';
  const strong = document.createElement('b');
  strong.textContent = `${index + 1}. ${label}`;
  root.append(strong);
  if (leg) {
    const copy = document.createElement('div');
    copy.className = 'geo-pop-d';
    copy.textContent = leg;
    root.append(copy);
  }
  return root;
}

function tokenColor(el: HTMLElement, token: string): string {
  return getComputedStyle(el).getPropertyValue(token).trim() || 'transparent';
}

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
  const [tilesReady, setTilesReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const stops = useMemo(
    () =>
      (waypoints || []).filter(
        (w) =>
          Number.isFinite(w.lat) &&
          Number.isFinite(w.lng) &&
          Math.abs(w.lat) <= 90 &&
          Math.abs(w.lng) <= 180,
      ),
    [waypoints],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !stops.length) return;
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
      const initial =
        center &&
        Number.isFinite(center[0]) &&
        Number.isFinite(center[1]) &&
        Math.abs(center[0]) <= 90 &&
        Math.abs(center[1]) <= 180
          ? center
          : ([stops[0].lat, stops[0].lng] as const);
      map = new ml.Map({
        container: ref.current,
        style: styleUrl(isLight(ref.current)),
        center: [initial[1], initial[0]],
        zoom: zoom ?? 14,
        // Style-supplied credit only — a customAttribution duplicate would render the line twice.
        attributionControl: { compact: false },
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 0,
        maxTileCacheSize: 48,
        canvasContextAttributes: { preserveDrawingBuffer: true, powerPreference: 'low-power' },
      });

      const routeData = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: stops.map((stop) => [stop.lng, stop.lat]),
        },
      };
      const addRoute = () => {
        if (
          !map ||
          !ref.current ||
          stops.length < 2 ||
          !map.isStyleLoaded() ||
          map.getSource('mavea-route')
        ) {
          return;
        }
        map.addSource('mavea-route', { type: 'geojson', data: routeData });
        map.addLayer({
          id: 'mavea-route-line',
          type: 'line',
          source: 'mavea-route',
          paint: {
            'line-color': tokenColor(ref.current, '--presence'),
            'line-width': 4,
            'line-opacity': 0.85,
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
        });
      };
      map.on('styledata', addRoute);
      map.on('idle', unveil);

      mapMarkers = stops.map((stop, index) => {
        const pin = document.createElement('span');
        pin.className = 'geo-pin mr-pin';
        pin.textContent = String(index + 1);
        // setPopup makes the pin focusable and Space/Enter-operable; a name and a role are all
        // it still needs so a screen reader announces the stop, not a bare number.
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-label', `Stop ${index + 1}: ${stop.label}`);
        const popup = popupContent(index, stop.label, stop.leg);
        const link = document.createElement('a');
        link.className = 'geo-pop-a';
        link.href = `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open in Google Maps ↗';
        popup.append(link);
        // The pin is a tail-less circle, so its centre — MapLibre's default anchor — is what
        // sits on the coordinate; bottom-anchoring would float it half a badge north.
        return new ml.Marker({ element: pin })
          .setLngLat([stop.lng, stop.lat])
          .setPopup(new ml.Popup({ offset: 18 }).setDOMContent(popup))
          .addTo(map!);
      });

      if (stops.length > 1) {
        const bounds = new ml.LngLatBounds();
        for (const stop of stops) bounds.extend([stop.lng, stop.lat]);
        map.fitBounds(bounds, { padding: 36, duration: 0 });
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
  }, [stops, zoom, center]);

  const hasSummary = distanceKm !== undefined || elevationGainM !== undefined;
  const mapShown = stops.length > 0 && !mapFailed;

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

      {mapFailed ? (
        <div className="geo-map geo-map-empty faint">Map couldn’t load.</div>
      ) : stops.length ? (
        <div
          ref={ref}
          className="geo-map mr-map"
          data-tiles={tilesReady ? 'ready' : 'loading'}
          aria-busy={!tilesReady}
        />
      ) : (
        <div className="geo-map geo-map-empty faint">No route to map.</div>
      )}
      {mapShown && <MapAttribution />}

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
