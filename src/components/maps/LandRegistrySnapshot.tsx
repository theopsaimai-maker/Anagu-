import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass } from 'lucide-react';
import { describeParcelGeography } from '../../lib/geoDescription';

interface LandRegistrySnapshotProps {
  coordinates: [number, number][];
  cadastralRef: string;
  areaSqm: number;
  stateName?: string;
  title?: string;
  snapshotUrl?: string;
  compact?: boolean;
  className?: string;
}

const snapshotCache = new Map<string, string>();

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function latLngToWorldPixels(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const siny = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function computeFit(
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
    if (spanX <= width * 0.48 && spanY <= height * 0.48) {
      chosenZoom = z;
      break;
    }
    chosenZoom = z;
  }

  return { centerLat, centerLng, zoom: chosenZoom };
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 2600);
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

function drawRegistryOverlay(
  ctx: CanvasRenderingContext2D,
  coordinates: [number, number][],
  cadastralRef: string,
  areaSqm: number,
  width: number,
  height: number,
  topLeftWorldX: number,
  topLeftWorldY: number,
  zoom: number,
  hasTiles: boolean,
  compact: boolean
): void {
  if (!hasTiles) {
    // Crisp architectural cadastral survey grid when tiles are unavailable
    ctx.fillStyle = '#0c1524';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    // Subtle dark-slate survey tone so emerald plot lines read with crisp contrast
    ctx.fillStyle = 'rgba(9, 16, 29, 0.24)';
    ctx.fillRect(0, 0, width, height);
  }

  // Fine cadastral survey coordinate crosshairs
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  for (let x = width * 0.25; x < width; x += width * 0.25) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = height * 0.25; y < height; y += height * 0.25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Project surveyed parcel boundary polygon
  if (coordinates.length >= 3) {
    const pts = coordinates.map(([lat, lng]) => {
      const w = latLngToWorldPixels(lat, lng, zoom);
      return { x: w.x - topLeftWorldX, y: w.y - topLeftWorldY };
    });

    // Outer glow halo
    ctx.save();
    ctx.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.55)';
    ctx.shadowBlur = compact ? 8 : 18;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
    ctx.fill();
    ctx.restore();

    // Crisp outer dark border + inner emerald surveyor line
    ctx.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.lineWidth = compact ? 3.5 : 5;
    ctx.strokeStyle = '#064e3b';
    ctx.stroke();

    ctx.lineWidth = compact ? 2 : 2.5;
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    if (!compact) {
      // Centroid parcel stamp
      const cx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
      const cy = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;

      ctx.fillStyle = 'rgba(7, 11, 18, 0.86)';
      const tag = `${areaSqm.toLocaleString()} m²`;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      const tagW = ctx.measureText(tag).width + 20;
      drawRoundedRect(ctx, cx - tagW / 2, cy - 13, tagW, 26, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#ecfdf5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Corner survey beacon monuments
    pts.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, compact ? 3.5 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (!compact && pts.length <= 6) {
        const label = `PB${idx + 1}`;
        ctx.font = '700 10px "JetBrains Mono", monospace';
        const lw = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
        drawRoundedRect(ctx, pt.x + 8, pt.y - 16, lw, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#a7f3d0';
        ctx.fillText(label, pt.x + 12, pt.y - 5);
      }
    });
  }

  // Clean subtle edge vignette
  const edgeGrad = ctx.createLinearGradient(0, height * 0.72, 0, height);
  edgeGrad.addColorStop(0, 'rgba(7, 11, 18, 0)');
  edgeGrad.addColorStop(1, 'rgba(7, 11, 18, 0.72)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, height * 0.72, width, height * 0.28);

  if (!compact) {
    // Bottom-left Survey Plan Cadastral Stamp
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
    ctx.fillText(`SURVEY SNAPSHOT · ${cadastralRef}`, 16, height - 16);
  }
}

export const LandRegistrySnapshot: React.FC<LandRegistrySnapshotProps> = ({
  coordinates,
  cadastralRef,
  areaSqm,
  stateName = 'Federal Capital Territory (Abuja)',
  title,
  snapshotUrl,
  compact = false,
  className = ''
}) => {
  const usableSnapshotUrl =
    typeof snapshotUrl === 'string' &&
    /^(data:image\/(png|jpeg|jpg|webp);base64,|https:\/\/|\/)/i.test(snapshotUrl.trim())
      ? snapshotUrl.trim()
      : '';

  const [snapshotBroken, setSnapshotBroken] = useState(false);
  const [renderedSrc, setRenderedSrc] = useState<string>(usableSnapshotUrl);
  const [tileFailed, setTileFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setSnapshotBroken(false);
    setTileFailed(false);
    if (usableSnapshotUrl) {
      setRenderedSrc(usableSnapshotUrl);
    }
  }, [usableSnapshotUrl]);

  const geoInfo = useMemo(
    () =>
      describeParcelGeography({
        state: stateName,
        coordinates,
        areaSqm
      }),
    [stateName, coordinates, areaSqm]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (usableSnapshotUrl && !snapshotBroken) {
      setRenderedSrc(usableSnapshotUrl);
      return;
    }

    const cacheKey = `${cadastralRef}:${compact ? 'sm' : 'lg'}:${JSON.stringify(coordinates)}`;
    const existing = snapshotCache.get(cacheKey);
    if (existing) {
      setRenderedSrc(existing);
      return;
    }

    const width = compact ? 320 : 800;
    const height = compact ? 220 : 600;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { centerLat, centerLng, zoom } = computeFit(coordinates, width, height);
    const centerWorld = latLngToWorldPixels(centerLat, centerLng, zoom);
    const topLeftWorldX = centerWorld.x - width / 2;
    const topLeftWorldY = centerWorld.y - height / 2;

    // Immediately paint crisp blueprint snapshot before street tiles complete
    drawRegistryOverlay(
      ctx,
      coordinates,
      cadastralRef,
      areaSqm,
      width,
      height,
      topLeftWorldX,
      topLeftWorldY,
      zoom,
      false,
      compact
    );
    if (mountedRef.current) {
      setRenderedSrc(canvas.toDataURL('image/png'));
    }

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
          loadTile(`/api/osm-tile/${zoom}/${tx}/${ty}.png`).then((img) => ({ dx, dy, img }))
        );
      }
    }

    void Promise.all(tilePromises).then((tiles) => {
      if (!mountedRef.current) return;
      let loadedCount = 0;
      ctx.fillStyle = '#0c1524';
      ctx.fillRect(0, 0, width, height);

      for (const tile of tiles) {
        if (tile.img) {
          ctx.drawImage(tile.img, tile.dx, tile.dy, 256, 256);
          loadedCount++;
        }
      }

      if (loadedCount === 0) {
        setTileFailed(true);
      }

      drawRegistryOverlay(
        ctx,
        coordinates,
        cadastralRef,
        areaSqm,
        width,
        height,
        topLeftWorldX,
        topLeftWorldY,
        zoom,
        loadedCount > 0,
        compact
      );

      const finalDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      snapshotCache.set(cacheKey, finalDataUrl);
      setRenderedSrc(finalDataUrl);
    });
  }, [coordinates, cadastralRef, areaSqm, usableSnapshotUrl, snapshotBroken, compact]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-slate-950 select-none ${className}`}>
      {renderedSrc ? (
        <img
          src={renderedSrc}
          alt={title ? `Land registry survey snapshot for ${title}` : `Land registry snapshot ${cadastralRef}`}
          referrerPolicy="no-referrer"
          onError={() => {
            if (usableSnapshotUrl && !snapshotBroken) {
              setSnapshotBroken(true);
            } else {
              setTileFailed(true);
            }
          }}
          className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="w-full h-full bg-slate-900 flex items-center justify-center text-xs text-slate-400 font-mono">
          {cadastralRef}
        </div>
      )}

      {!compact && (
        <>
          {/* Clean Coordinate & Directional Compass Overlays */}
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-xs border border-slate-700/80 px-2.5 py-1 rounded-md text-[10px] font-mono text-emerald-300 tabular-nums max-w-[60%] truncate">
            <span className="truncate">
              {geoInfo.centroid.lat.toFixed(4)}°N, {geoInfo.centroid.lng.toFixed(4)}°E
            </span>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 bg-slate-950/90 border border-slate-700/80 px-2 py-1 rounded-md text-[10px] font-mono font-bold text-slate-200 tabular-nums"
          >
            <Compass className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>
              {String(geoInfo.bearingDeg).padStart(3, '0')}° {geoInfo.cardinalCode}
            </span>
          </div>
        </>
      )}

      {tileFailed && !renderedSrc && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-xs text-slate-400 font-mono">
          {cadastralRef}
        </div>
      )}
    </div>
  );
};
