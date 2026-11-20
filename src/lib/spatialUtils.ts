import { ParcelRecord } from '../types/anagu';

export interface ParcelUtmInfo {
  zoneNumber: number;
  hemisphere: 'N' | 'S';
  zoneCode: string;
  epsgCode: string;
  label: string;
  isNigeriaZone: boolean;
  storageCrs: 'EPSG:4326';
  centroidLat: number | null;
  centroidLng: number | null;
}

export interface NearbyParcelSummary {
  parcel: ParcelRecord;
  distanceMeters: number;
}

const EARTH_RADIUS_M = 6371008.8;

/**
 * Computes the arithmetic centroid of a `[lat, lng][]` coordinate array.
 */
export function computeCoordinateCentroid(
  coordinates: [number, number][] | undefined | null
): { lat: number; lng: number } | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  for (const pt of coordinates) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    latSum += lat;
    lngSum += lng;
    count += 1;
  }

  if (count === 0) return null;
  return {
    lat: latSum / count,
    lng: lngSum / count
  };
}

/**
 * Computes the applicable WGS 84 UTM zone from parcel longitude/latitude
 * (including Nigeria's three UTM zones: 31N < 6°E, 32N 6°E–12°E, 33N >= 12°E)
 * while explicitly documenting that canonical geometry remains stored in EPSG:4326.
 */
export function getParcelUtmInfo(
  coordinates: [number, number][] | undefined | null,
  overrideLat?: number | null,
  overrideLng?: number | null
): ParcelUtmInfo {
  const fallbackCentroid = computeCoordinateCentroid(coordinates);
  const lat =
    typeof overrideLat === 'number' && Number.isFinite(overrideLat)
      ? overrideLat
      : fallbackCentroid?.lat ?? null;
  const lng =
    typeof overrideLng === 'number' && Number.isFinite(overrideLng)
      ? overrideLng
      : fallbackCentroid?.lng ?? null;

  if (lat === null || lng === null) {
    return {
      zoneNumber: 32,
      hemisphere: 'N',
      zoneCode: '32N',
      epsgCode: 'EPSG:32632',
      label: 'UTM Zone 32N (Default)',
      isNigeriaZone: true,
      storageCrs: 'EPSG:4326',
      centroidLat: null,
      centroidLng: null
    };
  }

  const clampedLng = Math.max(-180, Math.min(179.999999, lng));
  const zoneNumber = Math.floor((clampedLng + 180) / 6) + 1;
  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  const zoneCode = `${zoneNumber}${hemisphere}`;
  const epsgCode = `EPSG:${hemisphere === 'N' ? 32600 + zoneNumber : 32700 + zoneNumber}`;
  const isNigeriaZone =
    hemisphere === 'N' &&
    (zoneNumber === 31 || zoneNumber === 32 || zoneNumber === 33) &&
    lat >= 4 &&
    lat <= 14.5 &&
    lng >= 2.5 &&
    lng <= 15;

  return {
    zoneNumber,
    hemisphere,
    zoneCode,
    epsgCode,
    label: `UTM Zone ${zoneCode}`,
    isNigeriaZone,
    storageCrs: 'EPSG:4326',
    centroidLat: lat,
    centroidLng: lng
  };
}

/**
 * Great-circle Haversine distance in meters between two WGS 84 points.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_M * c;
}

/**
 * Returns real neighboring parcels from the registry sorted by geodesic distance
 * from the active parcel's centroid (excluding the active parcel itself).
 */
export function findNearbyParcels(
  activeParcel: ParcelRecord,
  allParcels: ParcelRecord[],
  limit = 5
): NearbyParcelSummary[] {
  const origin = computeCoordinateCentroid(activeParcel.coordinates);
  if (!origin) return [];

  const summaries: NearbyParcelSummary[] = [];
  for (const candidate of allParcels) {
    if (!candidate || candidate.id === activeParcel.id) continue;
    const center = computeCoordinateCentroid(candidate.coordinates);
    if (!center) continue;
    const distanceMeters = haversineDistanceMeters(
      origin.lat,
      origin.lng,
      center.lat,
      center.lng
    );
    summaries.push({ parcel: candidate, distanceMeters });
  }

  summaries.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return summaries.slice(0, Math.max(0, limit));
}

export function formatDistanceLabel(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters)) return '—';
  if (distanceMeters < 1000) {
    return `${distanceMeters.toFixed(1)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}
