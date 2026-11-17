import { normalizeNigeriaState } from '../data/nigeriaLocations';

export const STATE_COORDINATES: Record<string, [number, number]> = {
  'Abia State': [5.5320, 7.4860],
  'Adamawa State': [9.2094, 12.4818],
  'Akwa Ibom State': [5.0377, 7.9128],
  'Anambra State': [6.2100, 7.0741],
  'Bauchi State': [10.3158, 9.8442],
  'Bayelsa State': [4.9267, 6.2676],
  'Benue State': [7.7336, 8.5214],
  'Borno State': [11.8333, 13.1500],
  'Cross River State': [4.9757, 8.3417],
  'Delta State': [6.1982, 6.7319],
  'Ebonyi State': [6.3249, 8.1137],
  'Edo State': [6.3350, 5.6037],
  'Ekiti State': [7.6211, 5.2214],
  'Enugu State': [6.4584, 7.5464],
  'Federal Capital Territory (Abuja)': [9.0765, 7.3986],
  'Gombe State': [10.2897, 11.1673],
  'Imo State': [5.4891, 7.0176],
  'Jigawa State': [11.7591, 9.3389],
  'Kaduna State': [10.5105, 7.4165],
  'Kano State': [12.0022, 8.5920],
  'Katsina State': [12.9894, 7.6006],
  'Kebbi State': [12.4539, 4.1975],
  'Kogi State': [7.7969, 6.7405],
  'Kwara State': [8.4966, 4.5421],
  'Lagos State': [6.4541, 3.3947],
  'Nasarawa State': [8.4939, 8.5153],
  'Niger State': [9.6152, 6.5478],
  'Ogun State': [7.1475, 3.3619],
  'Ondo State': [7.2571, 5.2058],
  'Osun State': [7.7827, 4.5418],
  'Oyo State': [7.3775, 3.9470],
  'Plateau State': [9.8965, 8.8583],
  'Rivers State': [4.8156, 7.0498],
  'Sokoto State': [13.0059, 5.2476],
  'Taraba State': [8.8937, 11.3596],
  'Yobe State': [11.7470, 11.9608],
  'Zamfara State': [12.1628, 6.6614]
};

export function getStateCenter(stateName: string): [number, number] {
  const normalized = normalizeNigeriaState(stateName);
  return STATE_COORDINATES[normalized] || [9.0765, 7.3986];
}

export function buildPolygonJsonFromCenter(
  lat: number,
  lng: number,
  halfSpanDeg = 0.00055
): string {
  const minLng = Number((lng - halfSpanDeg).toFixed(5));
  const maxLng = Number((lng + halfSpanDeg).toFixed(5));
  const minLat = Number((lat - halfSpanDeg * 0.85).toFixed(5));
  const maxLat = Number((lat + halfSpanDeg * 0.85).toFixed(5));
  return JSON.stringify([
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat]
    ]
  ]);
}

export interface GeocodeSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  name: string;
  type: string;
}

function cleanStateForNominatim(state: string): string {
  const normalized = normalizeNigeriaState(state);
  if (normalized.toLowerCase().includes('federal capital territory')) {
    return 'Abuja';
  }
  return normalized.replace(/\s+state$/i, '').trim();
}

function stripPlotPrefix(text: string): string {
  return text
    .replace(/^(plot|no\.?|number|house|flat|block|suite|lot)\s+[a-z0-9-/]+\s*,?\s*/i, '')
    .trim();
}

export async function searchNigerianLandmarks(
  locationText: string,
  state: string
): Promise<GeocodeSuggestion[]> {
  const trimmed = stripPlotPrefix(locationText.trim()) || locationText.trim();
  if (trimmed.length < 2) return [];
  const cleanState = cleanStateForNominatim(state);

  const queries = [`${trimmed}, ${cleanState}, Nigeria`, `${trimmed}, Nigeria`];
  for (const q of queries) {
    try {
      const res = await fetch(`/api/geocode-search?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: GeocodeSuggestion[] };
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    } catch {
      // Try next query
    }
  }
  return [];
}

async function queryGeocodeApi(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(5500)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: number; lng?: number; displayName?: string };
    if (typeof data.lat === 'number' && typeof data.lng === 'number' && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      return {
        lat: data.lat,
        lng: data.lng,
        displayName: data.displayName || query
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function geocodeNigerianLocation(
  locationText: string,
  lga: string,
  state: string
): Promise<{ lat: number; lng: number; displayName: string; exactMatch: boolean }> {
  const normalizedState = normalizeNigeriaState(state);
  const cleanStateLabel = cleanStateForNominatim(normalizedState);
  const trimmedLoc = locationText.trim();
  const trimmedLga = lga.replace(/\s*\(AMAC\)/i, '').trim();

  if (trimmedLoc) {
    const strippedLoc = stripPlotPrefix(trimmedLoc);
    const segments = strippedLoc
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    const candidates = Array.from(
      new Set([
        `${trimmedLoc}, ${cleanStateLabel}, Nigeria`,
        ...(strippedLoc && strippedLoc !== trimmedLoc
          ? [`${strippedLoc}, ${cleanStateLabel}, Nigeria`, `${strippedLoc}, Nigeria`]
          : []),
        ...segments.map((seg) => `${seg}, ${cleanStateLabel}, Nigeria`),
        `${trimmedLoc}, Nigeria`,
        ...segments.map((seg) => `${seg}, Nigeria`)
      ])
    );

    for (const candidate of candidates) {
      const hit = await queryGeocodeApi(candidate);
      if (hit) {
        return { ...hit, exactMatch: true };
      }
    }
  }

  if (trimmedLga) {
    const lgaQuery = `${trimmedLga}, ${cleanStateLabel}, Nigeria`;
    const byLga = await queryGeocodeApi(lgaQuery);
    if (byLga) {
      return { ...byLga, exactMatch: Boolean(!trimmedLoc) };
    }
  }

  const [fallbackLat, fallbackLng] = getStateCenter(normalizedState);
  return {
    lat: fallbackLat,
    lng: fallbackLng,
    displayName: `${trimmedLga ? `${trimmedLga}, ` : ''}${normalizedState}`,
    exactMatch: false
  };
}

function latLngToWorldPixels(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const siny = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function computePolygonCenterAndZoom(
  coordinates: [number, number][],
  width: number,
  height: number
): { centerLat: number; centerLng: number; zoom: number } {
  if (!coordinates.length) {
    return { centerLat: 9.0765, centerLng: 7.3986, zoom: 15 };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of coordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  let chosenZoom = 16;
  for (let z = 17; z >= 12; z--) {
    const sw = latLngToWorldPixels(minLat, minLng, z);
    const ne = latLngToWorldPixels(maxLat, maxLng, z);
    const spanX = Math.abs(ne.x - sw.x);
    const spanY = Math.abs(sw.y - ne.y);
    if (spanX <= width * 0.58 && spanY <= height * 0.58) {
      chosenZoom = z;
      break;
    }
    chosenZoom = z;
  }

  return { centerLat, centerLng, zoom: chosenZoom };
}

function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 4500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export async function captureOsmMapSnapshot(
  coordinates: [number, number][],
  locationLabel?: string
): Promise<string> {
  const width = 640;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base cartographic background in case any tile times out
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  const { centerLat, centerLng, zoom } = computePolygonCenterAndZoom(coordinates, width, height);
  const centerWorld = latLngToWorldPixels(centerLat, centerLng, zoom);
  const topLeftWorldX = centerWorld.x - width / 2;
  const topLeftWorldY = centerWorld.y - height / 2;

  const maxTileIdx = Math.pow(2, zoom) - 1;
  const startTileX = Math.floor(topLeftWorldX / 256);
  const endTileX = Math.floor((topLeftWorldX + width) / 256);
  const startTileY = Math.floor(topLeftWorldY / 256);
  const endTileY = Math.floor((topLeftWorldY + height) / 256);

  const tilePromises: Array<Promise<{ dx: number; dy: number; img: HTMLImageElement | null }>> = [];
  for (let tx = startTileX; tx <= endTileX; tx++) {
    for (let ty = startTileY; ty <= endTileY; ty++) {
      if (tx < 0 || ty < 0 || tx > maxTileIdx || ty > maxTileIdx) continue;
      const dx = Math.round(tx * 256 - topLeftWorldX);
      const dy = Math.round(ty * 256 - topLeftWorldY);
      tilePromises.push(
        loadTileImage(`/api/osm-tile/${zoom}/${tx}/${ty}.png`).then((img) => ({ dx, dy, img }))
      );
    }
  }

  const tiles = await Promise.all(tilePromises);
  let loadedCount = 0;
  for (const tile of tiles) {
    if (tile.img) {
      ctx.drawImage(tile.img, tile.dx, tile.dy, 256, 256);
      loadedCount++;
    } else {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tile.dx, tile.dy, 256, 256);
    }
  }

  // If offline and no tiles loaded, draw crisp cadastral grid lines
  if (loadedCount === 0) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= width; gx += 32) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 0; gy <= height; gy += 32) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }
  }

  // Subtle bottom gradient for card text legibility
  const grad = ctx.createLinearGradient(0, height * 0.58, 0, height);
  grad.addColorStop(0, 'rgba(7, 11, 18, 0)');
  grad.addColorStop(1, 'rgba(7, 11, 18, 0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, height * 0.58, width, height * 0.42);

  // Project parcel polygon onto the OSM map
  if (coordinates.length >= 3) {
    const points = coordinates.map(([lat, lng]) => {
      const world = latLngToWorldPixels(lat, lng, zoom);
      return {
        x: world.x - topLeftWorldX,
        y: world.y - topLeftWorldY
      };
    });

    ctx.save();
    ctx.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.30)';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#059669';
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    // Draw corner beacons
    points.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();
  }

  // Top-left cadastral coordinate stamp
  const coordText = `${centerLat.toFixed(4)}°N, ${centerLng.toFixed(4)}°E`;
  ctx.font = '600 12px "JetBrains Mono", monospace';
  const coordWidth = ctx.measureText(coordText).width + 20;
  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.beginPath();
  ctx.roundRect(14, 14, coordWidth, 26, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText(coordText, 24, 31);

  // Top-right land registry stamp
  const attrText = locationLabel ? locationLabel.slice(0, 28) : 'ANAGU LAND REGISTRY';
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  const attrWidth = ctx.measureText(attrText).width + 16;
  ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
  ctx.beginPath();
  ctx.roundRect(width - attrWidth - 14, 14, attrWidth, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(attrText, width - attrWidth - 6, 30);

  return canvas.toDataURL('image/jpeg', 0.86);
}
