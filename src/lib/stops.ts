/**
 * OC Transpo's stops, and the nearest one to a point.
 *
 * The realtime feed gives coordinates and, usually, the id of the stop the
 * bus is running to. OC Transpo's own stop names are already the thing an
 * operator would say out loud - "BANK / SLATER", "KATIMAVIK / CASTLEFRANK" -
 * so the whole list is shipped with the site and the answer comes from it.
 *
 * That is worth doing rather than asking a geocoder every time: it is exact
 * rather than approximate, it names intersections rather than roads, it costs
 * no network call once loaded, and it cannot be rate-limited or blocked. The
 * geocoder is left as a fallback for the rare bus nowhere near a stop.
 *
 * Data: City of Ottawa open data, extracted from the GTFS feed. It carries
 * its own validity dates - see `stopsExpiry` - because a booking change
 * reissues the feed and moves stops around.
 */

interface StopsFile {
  source: string;
  version: string;
  /** yyyymmdd. */
  start: string;
  end: string;
  names: string[];
  /** [stopId, index into names, latitude, longitude] */
  stops: [string, number, number, number][];
}

export interface NearbyStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Straight-line metres from the point asked about. */
  metres: number;
}

let cache: Promise<StopsFile> | null = null;

export function loadStops(): Promise<StopsFile> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  cache ??= fetch(`${basePath}/oc-stops.json`).then((res) => {
    if (!res.ok) throw new Error(`Could not load the stop list (${res.status}).`);
    return res.json() as Promise<StopsFile>;
  });
  return cache;
}

/**
 * Metres between two points.
 *
 * Ottawa spans about 60 km, so the curvature that a full great-circle formula
 * accounts for is worth nothing here: flattening the degrees and scaling
 * longitude by the latitude is accurate to a metre or so at this size, and is
 * a great deal cheaper across eleven thousand stops.
 */
function metresBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = mPerDegLat * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * mPerDegLat;
  const dx = (lon2 - lon1) * mPerDegLon;
  return Math.sqrt(dx * dx + dy * dy);
}

/** The stop with this id, if the feed named one. */
export async function stopById(id: string): Promise<NearbyStop | null> {
  const file = await loadStops();
  const found = file.stops.find((s) => s[0] === id);
  if (!found) return null;
  return {
    id: found[0],
    name: file.names[found[1]],
    lat: found[2],
    lon: found[3],
    metres: 0,
  };
}

/**
 * The closest stop to a point.
 *
 * A straight scan of the whole list. Eleven thousand distance calculations is
 * under a millisecond, and a spatial index would be more code to get wrong
 * for no gain a person could notice.
 */
export async function nearestStop(
  lat: number,
  lon: number,
): Promise<NearbyStop | null> {
  const file = await loadStops();

  let best: StopsFile["stops"][number] | null = null;
  let bestMetres = Infinity;
  for (const stop of file.stops) {
    const metres = metresBetween(lat, lon, stop[2], stop[3]);
    if (metres < bestMetres) {
      bestMetres = metres;
      best = stop;
    }
  }
  if (!best) return null;

  return {
    id: best[0],
    name: file.names[best[1]],
    lat: best[2],
    lon: best[3],
    metres: Math.round(bestMetres),
  };
}

/** When the shipped stop list stops being trustworthy. */
export async function stopsExpiry(): Promise<string> {
  const { end } = await loadStops();
  return `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`;
}
