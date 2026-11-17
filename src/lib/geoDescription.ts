import { normalizeNigeriaState } from '../data/nigeriaLocations';
import { getStateCenter } from './osm';

export interface GeopoliticalRegionMeta {
  zone:
    | 'North-Central'
    | 'North-East'
    | 'North-West'
    | 'South-East'
    | 'South-South'
    | 'South-West';
  terrainProfile: string;
}

const STATE_REGION_META: Record<string, GeopoliticalRegionMeta> = {
  'Abia State': {
    zone: 'South-East',
    terrainProfile: 'Lowland Rainforest & Imo River Basin Commercial Belt'
  },
  'Adamawa State': {
    zone: 'North-East',
    terrainProfile: 'Upper Benue Trough & Mandara Foothills Savanna'
  },
  'Akwa Ibom State': {
    zone: 'South-South',
    terrainProfile: 'Coastal Equatorial Plain & Qua Iboe Maritime Corridor'
  },
  'Anambra State': {
    zone: 'South-East',
    terrainProfile: 'Awka–Orlu Uplands & Lower Niger Alluvial Terrace'
  },
  'Bauchi State': {
    zone: 'North-East',
    terrainProfile: 'Jos Plateau Foothills & Sudan Savanna Woodland'
  },
  'Bayelsa State': {
    zone: 'South-South',
    terrainProfile: 'Central Niger Delta Mangrove & Freshwater Alluvial Plain'
  },
  'Benue State': {
    zone: 'North-Central',
    terrainProfile: 'Middle Benue River Valley & Fertile Guinea Savanna'
  },
  'Borno State': {
    zone: 'North-East',
    terrainProfile: 'Chad Basin Sahelian Plain & Biu Volcanic Plateau'
  },
  'Cross River State': {
    zone: 'South-South',
    terrainProfile: 'Cross River Estuary & Tropical High Forest Corridor'
  },
  'Delta State': {
    zone: 'South-South',
    terrainProfile: 'Western Niger Delta Lowland & Coastal Creeks Corridor'
  },
  'Ebonyi State': {
    zone: 'South-East',
    terrainProfile: 'Cross River Plains & Abakaliki Sedimentary Lowlands'
  },
  'Edo State': {
    zone: 'South-South',
    terrainProfile: 'Benin Sand Plain & Esan Upland Transition Belt'
  },
  'Ekiti State': {
    zone: 'South-West',
    terrainProfile: 'Ekiti Crystalline Quartzite Hills & Cocoa Forest Belt'
  },
  'Enugu State': {
    zone: 'South-East',
    terrainProfile: 'Udi–Nsukka Escarpment Ridge & Eastern Coal Plateau'
  },
  'Federal Capital Territory (Abuja)': {
    zone: 'North-Central',
    terrainProfile: 'Central Federal Savannah Plateau & Gwagwa Plains'
  },
  'Gombe State': {
    zone: 'North-East',
    terrainProfile: 'Gongola River Basin & Sudan Savanna Agricultural Plain'
  },
  'Imo State': {
    zone: 'South-East',
    terrainProfile: 'Owerri–Orlu Rainforest Plain & Otamiri River Corridor'
  },
  'Jigawa State': {
    zone: 'North-West',
    terrainProfile: 'Hadejia–Jama’are Semi-Arid Riverine Floodplain'
  },
  'Kaduna State': {
    zone: 'North-West',
    terrainProfile: 'Northern Guinea Savanna & Zaria–Kaduna Highland Plain'
  },
  'Kano State': {
    zone: 'North-West',
    terrainProfile: 'Sudan Savanna Commercial Basin & Kano Crystalline Shield'
  },
  'Katsina State': {
    zone: 'North-West',
    terrainProfile: 'Sahel-Sudan Dryland Terrace & Northern Border Plains'
  },
  'Kebbi State': {
    zone: 'North-West',
    terrainProfile: 'Sokoto–Rima Alluvial Fadama & Upper Niger Valley'
  },
  'Kogi State': {
    zone: 'North-Central',
    terrainProfile: 'Niger–Benue Confluence Ridge & Derived Savanna Valley'
  },
  'Kwara State': {
    zone: 'North-Central',
    terrainProfile: 'Southern Guinea Savanna & Lower Niger Plains Corridor'
  },
  'Lagos State': {
    zone: 'South-West',
    terrainProfile: 'Atlantic Coastal Barrier Island, Lagoon & Peninsular Belt'
  },
  'Nasarawa State': {
    zone: 'North-Central',
    terrainProfile: 'Nasarawa–Keffi Crystalline Uplands & Abuja Peri-Urban Belt'
  },
  'Niger State': {
    zone: 'North-Central',
    terrainProfile: 'Middle Niger River Basin & Kaduna Foothills Savanna'
  },
  'Ogun State': {
    zone: 'South-West',
    terrainProfile: 'Abeokuta–Ota Sedimentary Belt & Lagos Industrial Corridor'
  },
  'Ondo State': {
    zone: 'South-West',
    terrainProfile: 'Idanre Granitic Highlands & Tropical Rainforest Belt'
  },
  'Osun State': {
    zone: 'South-West',
    terrainProfile: 'Osun River Rainforest & Yoruba Heartland Uplands'
  },
  'Oyo State': {
    zone: 'South-West',
    terrainProfile: 'Derived Forest–Savanna Transition & Ibadan Ridge'
  },
  'Plateau State': {
    zone: 'North-Central',
    terrainProfile: 'Jos High Crystalline Plateau (1,200m+ Temperate Uplands)'
  },
  'Rivers State': {
    zone: 'South-South',
    terrainProfile: 'Bonny Estuary Tidal Plain & Port Harcourt Maritime Delta'
  },
  'Sokoto State': {
    zone: 'North-West',
    terrainProfile: 'Sokoto Sedimentary Basin & Semi-Arid Rima Plains'
  },
  'Taraba State': {
    zone: 'North-East',
    terrainProfile: 'Middle Benue Plain & Mambilla Highland Escarpment'
  },
  'Yobe State': {
    zone: 'North-East',
    terrainProfile: 'Sahelian Sand Plain & Komadugu Yobe River Basin'
  },
  'Zamfara State': {
    zone: 'North-West',
    terrainProfile: 'Sokoto–Zamfara Savanna & Crystalline Mineral Belt'
  }
};

export interface EdgeBearingSummary {
  label: string;
  lengthM: number;
  bearingDeg: number;
  cardinal: string;
}

export interface ParcelGeoDescription {
  geopoliticalZone: GeopoliticalRegionMeta['zone'];
  terrainProfile: string;
  centroid: { lat: number; lng: number };
  relativePosition: string;
  bearingDeg: number;
  cardinalCode: string;
  cardinalDirection: string;
  primaryOrientation: string;
  dimensionsLabel: string;
  areaSummary: string;
  edgeSummary: string;
  edges: EdgeBearingSummary[];
  fullDescription: string;
}

const CARDINAL_8: Array<{ code: string; name: string }> = [
  { code: 'N', name: 'North' },
  { code: 'NE', name: 'North-East' },
  { code: 'E', name: 'East' },
  { code: 'SE', name: 'South-East' },
  { code: 'S', name: 'South' },
  { code: 'SW', name: 'South-West' },
  { code: 'W', name: 'West' },
  { code: 'NW', name: 'North-West' }
];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeCompassBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const raw = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(raw) % 360;
}

export function bearingToCardinal(deg: number): { code: string; name: string } {
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return CARDINAL_8[idx];
}

function formatBearingDegrees(deg: number): string {
  return `${String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')}°`;
}

function axisLabelForBearing(deg: number): string {
  const mod180 = ((deg % 180) + 180) % 180;
  if (mod180 < 22.5 || mod180 >= 157.5) return 'N–S Axis';
  if (mod180 < 67.5) return 'NE–SW Axis';
  if (mod180 < 112.5) return 'E–W Axis';
  return 'NW–SE Axis';
}

export function describeParcelGeography(input: {
  state: string;
  lga?: string;
  district?: string;
  coordinates: [number, number][];
  areaSqm?: number;
}): ParcelGeoDescription {
  const normalizedState = normalizeNigeriaState(input.state);
  const regionMeta = STATE_REGION_META[normalizedState] || {
    zone: 'North-Central',
    terrainProfile: 'Federal Cadastral Survey Corridor'
  };
  const [stateLat, stateLng] = getStateCenter(normalizedState);

  const validCoords = Array.isArray(input.coordinates)
    ? input.coordinates.filter(
        (c) =>
          Array.isArray(c) &&
          c.length >= 2 &&
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1])
      )
    : [];

  const points: [number, number][] =
    validCoords.length >= 3
      ? validCoords
      : [
          [stateLat - 0.00045, stateLng - 0.00055],
          [stateLat - 0.00045, stateLng + 0.00055],
          [stateLat + 0.00045, stateLng + 0.00055],
          [stateLat + 0.00045, stateLng - 0.00055]
        ];

  const centroidLat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const centroidLng = points.reduce((s, p) => s + p[1], 0) / points.length;

  // Distance & direction relative to state capital/center
  const distFromCenterM = haversineMeters(stateLat, stateLng, centroidLat, centroidLng);
  const bearingFromCenter = computeCompassBearing(stateLat, stateLng, centroidLat, centroidLng);
  const cardinalFromCenter = bearingToCardinal(bearingFromCenter);

  const shortStateName = normalizedState
    .replace('Federal Capital Territory (Abuja)', 'Abuja')
    .replace(/\s+State$/i, '');

  const relativePosition =
    distFromCenterM < 450
      ? `Central Core Sector of ${shortStateName}`
      : `${(distFromCenterM / 1000).toFixed(1)} km ${cardinalFromCenter.name} (${cardinalFromCenter.code}) of ${shortStateName} Center`;

  // Polygon bounding box spans (meters)
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const widthM = Math.max(10, Math.round(haversineMeters(centroidLat, minLng, centroidLat, maxLng)));
  const depthM = Math.max(10, Math.round(haversineMeters(minLat, centroidLng, maxLat, centroidLng)));
  const dimensionsLabel = `${widthM} m (E–W) × ${depthM} m (N–S)`;

  // Edge bearings & lengths
  const edges: EdgeBearingSummary[] = [];
  let longestEdge = { lengthM: 0, bearingDeg: 90 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const lengthM = Math.max(1, Math.round(haversineMeters(a[0], a[1], b[0], b[1])));
    const bearingDeg = computeCompassBearing(a[0], a[1], b[0], b[1]);
    const card = bearingToCardinal(bearingDeg);
    edges.push({
      label: `PB${i + 1}→PB${((i + 1) % points.length) + 1}`,
      lengthM,
      bearingDeg,
      cardinal: card.code
    });
    if (lengthM >= longestEdge.lengthM) {
      longestEdge = { lengthM, bearingDeg };
    }
  }

  // Primary frontage orientation (perpendicular outward face of primary edge, or frontage axis)
  const frontageFacingDeg = (longestEdge.bearingDeg + 270) % 360;
  const facingCard = bearingToCardinal(frontageFacingDeg);
  const axisLabel = axisLabelForBearing(longestEdge.bearingDeg);
  const primaryOrientation = `${formatBearingDegrees(frontageFacingDeg)} ${facingCard.name} Facing · ${axisLabel}`;

  const cleanArea = Math.round(
    input.areaSqm && input.areaSqm > 0 ? input.areaSqm : widthM * depthM
  );
  const plotsCount = (cleanArea / 650).toFixed(1);
  const areaSummary = `${regionMeta.zone} Zone · ${regionMeta.terrainProfile}`;
  const edgeSummary = edges
    .slice(0, 4)
    .map((e) => `${e.label}: ${e.lengthM}m ${e.cardinal} (${formatBearingDegrees(e.bearingDeg)})`)
    .join(' · ');

  const locName = [input.district?.trim(), input.lga?.trim(), normalizedState]
    .filter(Boolean)
    .join(', ');

  const fullDescription = `Situated in ${locName || normalizedState} (${regionMeta.zone} — ${regionMeta.terrainProfile}), positioned ${relativePosition.toLowerCase()}. Parcel geometry spans ${dimensionsLabel} (${cleanArea.toLocaleString()} m², ~${plotsCount} plots) with ${primaryOrientation.toLowerCase()}.`;

  return {
    geopoliticalZone: regionMeta.zone,
    terrainProfile: regionMeta.terrainProfile,
    centroid: { lat: centroidLat, lng: centroidLng },
    relativePosition,
    bearingDeg: frontageFacingDeg,
    cardinalCode: facingCard.code,
    cardinalDirection: facingCard.name,
    primaryOrientation,
    dimensionsLabel,
    areaSummary,
    edgeSummary,
    edges,
    fullDescription
  };
}
