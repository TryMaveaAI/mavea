const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/** MapLibre's control remains interactive; this in-flow copy also survives raster exports. */
export function MapAttribution() {
  return (
    <p className="geo-map-credit" aria-label="Map attribution">
      Map:{' '}
      <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
        OpenFreeMap
      </a>{' '}
      · ©{' '}
      <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">
        OpenMapTiles
      </a>{' '}
      · Data © OpenStreetMap contributors (ODbL) ·{' '}
      <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
        {OSM_COPYRIGHT_URL}
      </a>
    </p>
  );
}
