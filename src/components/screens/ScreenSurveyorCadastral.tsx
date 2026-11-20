import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Sliders,
  Check,
  ArrowRight,
  XCircle,
  Info,
  MapPin
} from 'lucide-react';
import { ParcelRecord, SpatialVerificationResult } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';
import { OpenStreetMapWidget } from '../maps/OpenStreetMapWidget';
import { apiAnalyzeSpatial, ApiError, isBackendUnavailableError } from '../../lib/api';
import {
  findNearbyParcels,
  formatDistanceLabel,
  getParcelUtmInfo
} from '../../lib/spatialUtils';

interface Props {
  parcels: ParcelRecord[];
  onApproveSpatial: (
    parcelId: string,
    options?: { bufferMeters?: number; enforceBuffer?: boolean }
  ) => Promise<ParcelRecord> | void;
  onEmitMqtt: (topic: any, payload: any) => void;
  selectedParcelId?: string;
  onSelectParcelId?: (id: string) => void;
  onNextStep?: (parcelId: string) => void;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

function projectPolygonsToSvg(
  targetCoords: [number, number][],
  neighborPolygons: Array<{ id: string; cadastralRef: string; status: string; coords: [number, number][]; isConflict: boolean }>
): {
  targetPoints: ProjectedPoint[];
  neighbors: Array<{ id: string; cadastralRef: string; status: string; points: ProjectedPoint[]; isConflict: boolean }>;
} {
  const validTarget = targetCoords.filter(
    (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
  );

  if (validTarget.length < 3) {
    return {
      targetPoints: [
        { x: 250, y: 150 },
        { x: 400, y: 130 },
        { x: 420, y: 270 },
        { x: 270, y: 290 }
      ],
      neighbors: []
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of validTarget) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  const targetLatSpan = Math.max(maxLat - minLat, 0.0004);
  const targetLngSpan = Math.max(maxLng - minLng, 0.0004);
  const targetCenterLat = (minLat + maxLat) / 2;
  const targetCenterLng = (minLng + maxLng) / 2;

  // Include nearby neighbors that fall within ~4x the target parcel extent so map scale stays readable
  const includedNeighbors = neighborPolygons.filter((n) => {
    const valid = n.coords.filter(
      (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
    );
    if (valid.length < 3) return false;
    const nLat = valid.reduce((acc, p) => acc + p[0], 0) / valid.length;
    const nLng = valid.reduce((acc, p) => acc + p[1], 0) / valid.length;
    return (
      Math.abs(nLat - targetCenterLat) <= Math.max(targetLatSpan * 4, 0.004) &&
      Math.abs(nLng - targetCenterLng) <= Math.max(targetLngSpan * 4, 0.004)
    );
  });

  for (const n of includedNeighbors) {
    for (const [lat, lng] of n.coords) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }

  const spanLat = Math.max(maxLat - minLat, 0.0005);
  const spanLng = Math.max(maxLng - minLng, 0.0005);
  const padX = 110;
  const padY = 80;
  const width = 600 - padX * 2;
  const height = 420 - padY * 2;
  const scale = Math.min(width / spanLng, height / spanLat);
  const offsetX = (600 - spanLng * scale) / 2;
  const offsetY = (420 - spanLat * scale) / 2;

  const project = ([lat, lng]: [number, number]): ProjectedPoint => ({
    x: Number((offsetX + (lng - minLng) * scale).toFixed(1)),
    y: Number((offsetY + (maxLat - lat) * scale).toFixed(1))
  });

  return {
    targetPoints: validTarget.map(project),
    neighbors: includedNeighbors.map((n) => ({
      id: n.id,
      cadastralRef: n.cadastralRef,
      status: n.status,
      isConflict: n.isConflict,
      points: n.coords
        .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
        .map(project)
    }))
  };
}

function expandPolygonPoints(points: ProjectedPoint[], px: number): ProjectedPoint[] {
  if (points.length === 0) return [];
  const cx = points.reduce((acc, p) => acc + p.x, 0) / points.length;
  const cy = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: Number((p.x + (dx / len) * px).toFixed(1)),
      y: Number((p.y + (dy / len) * px).toFixed(1))
    };
  });
}

export const ScreenSurveyorCadastral: React.FC<Props> = ({
  parcels,
  onApproveSpatial,
  onEmitMqtt,
  selectedParcelId: externalParcelId,
  onSelectParcelId,
  onNextStep
}) => {
  const [localParcelId, setLocalParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id || '');
  const selectedParcelId = externalParcelId || localParcelId;

  const handleSelectParcelId = (id: string) => {
    setLocalParcelId(id);
    onSelectParcelId?.(id);
    setSelectedBeaconIndex(null);
  };

  const [toleranceBuffer, setToleranceBuffer] = useState<number>(0.5);
  const [enforceBuffer, setEnforceBuffer] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [spatialResult, setSpatialResult] = useState<SpatialVerificationResult | null>(null);
  const [analysisError, setAnalysisError] = useState<{
    message: string;
    kind: 'migration_required' | 'backend_unavailable' | 'auth' | 'error';
  } | null>(null);
  const [approvedNotification, setApprovedNotification] = useState<boolean>(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Interactive GIS Map Viewport & Layer Controls
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [showOsm, setShowOsm] = useState<boolean>(true);
  const [showSatellite, setShowSatellite] = useState<boolean>(true);
  const [showNeighbors, setShowNeighbors] = useState<boolean>(true);
  const [showBuffer, setShowBuffer] = useState<boolean>(true);
  const [selectedBeaconIndex, setSelectedBeaconIndex] = useState<number | null>(null);

  const activeParcel = useMemo(
    () => parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null,
    [parcels, selectedParcelId]
  );

  // Reset analysis/approval banners whenever active parcel changes
  useEffect(() => {
    setSpatialResult(null);
    setAnalysisError(null);
    setApprovedNotification(false);
    setApprovalError(null);
    setSelectedBeaconIndex(null);
  }, [activeParcel?.id]);

  const runSpatialAnalysis = useCallback(
    async (parcelId: string, bufferMeters: number, enforce: boolean) => {
      setIsVerifying(true);
      setAnalysisError(null);
      try {
        const res = await apiAnalyzeSpatial(parcelId, {
          bufferMeters,
          enforceBuffer: enforce
        });
        setSpatialResult(res.spatial);
      } catch (err) {
        setSpatialResult(null);
        if (err instanceof ApiError) {
          if (err.status === 503) {
            setAnalysisError({
              kind: 'migration_required',
              message: err.message
            });
          } else if (err.status === 401 || err.status === 403) {
            setAnalysisError({
              kind: 'auth',
              message: err.message
            });
          } else {
            setAnalysisError({
              kind: 'error',
              message: err.message
            });
          }
        } else if (isBackendUnavailableError(err)) {
          setAnalysisError({
            kind: 'backend_unavailable',
            message:
              'Authoritative PostGIS backend is currently unreachable. Start the Express API server or check connectivity before verifying.'
          });
        } else {
          setAnalysisError({
            kind: 'error',
            message: err instanceof Error ? err.message : 'PostGIS spatial analysis failed.'
          });
        }
      } finally {
        setIsVerifying(false);
      }
    },
    []
  );

  const handleRunSpatialAnalysis = () => {
    if (!activeParcel) return;
    void runSpatialAnalysis(activeParcel.id, toleranceBuffer, enforceBuffer);
  };

  const utmInfo = useMemo(
    () =>
      getParcelUtmInfo(
        activeParcel?.coordinates,
        spatialResult?.centroidLat,
        spatialResult?.centroidLng
      ),
    [activeParcel?.coordinates, spatialResult?.centroidLat, spatialResult?.centroidLng]
  );

  const nearbyParcels = useMemo(
    () => (activeParcel ? findNearbyParcels(activeParcel, parcels, 4) : []),
    [activeParcel, parcels]
  );

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    if (spatialResult) {
      for (const c of spatialResult.trueOverlaps) ids.add(c.parcelId);
      for (const c of spatialResult.bufferBreaches) ids.add(c.parcelId);
    }
    return ids;
  }, [spatialResult]);

  const projected = useMemo(() => {
    if (!activeParcel) {
      return { targetPoints: [], neighbors: [] };
    }
    const candidateNeighborPolys = nearbyParcels.map(({ parcel }) => ({
      id: parcel.id,
      cadastralRef: parcel.cadastralRef,
      status: parcel.status,
      coords: parcel.coordinates,
      isConflict: conflictIds.has(parcel.id)
    }));
    return projectPolygonsToSvg(activeParcel.coordinates, candidateNeighborPolys);
  }, [activeParcel, nearbyParcels, conflictIds]);

  const bufferPoints = useMemo(
    () => expandPolygonPoints(projected.targetPoints, Math.max(4, Math.min(18, toleranceBuffer * 7))),
    [projected.targetPoints, toleranceBuffer]
  );

  if (!activeParcel) {
    return (
      <div className="w-full h-full bg-slate-900 text-slate-100 flex items-center justify-center p-8">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 max-w-md text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
          <div className="text-sm font-semibold">No parcels available for spatial verification</div>
          <p className="text-xs text-slate-400">
            Submit a new land parcel in the Citizen Portal to inspect its geometry with PostGIS.
          </p>
        </div>
      </div>
    );
  }

  const inspectedBeacon =
    selectedBeaconIndex !== null ? activeParcel.beacons[selectedBeaconIndex] : null;

  const isAlreadyBackendVerified = [
    'spatial_verified',
    'oracle_verified',
    'legal_approved',
    'registered'
  ].includes(activeParcel.status);

  const hasTrueOverlap = Boolean(spatialResult?.hasTrueOverlap);
  const hasInvalidGeometry = spatialResult !== null && !spatialResult.isValid;
  const hasBlockingBufferBreach =
    spatialResult !== null &&
    spatialResult.enforceBuffer &&
    spatialResult.bufferBreachCount > 0;
  const analysisFailed = spatialResult !== null && !spatialResult.passed;
  const analysisPassed = spatialResult !== null && spatialResult.passed;

  const polygonStrokeColor = analysisFailed
    ? '#ef4444'
    : analysisPassed
      ? '#10b981'
      : '#38bdf8';
  const polygonFillColor = analysisFailed
    ? 'rgba(239, 68, 68, 0.28)'
    : analysisPassed
      ? 'rgba(16, 185, 129, 0.28)'
      : 'rgba(56, 189, 248, 0.22)';

  const handleApprove = async () => {
    setApprovalError(null);
    setApprovedNotification(false);
    setIsApproving(true);
    try {
      await onApproveSpatial(activeParcel.id, {
        bufferMeters: toleranceBuffer,
        enforceBuffer
      });
      onEmitMqtt('land/registration/status', {
        applicationId: activeParcel.id,
        status: 'spatial_verified',
        toleranceBufferM: toleranceBuffer,
        enforceBuffer,
        postgisValid: true,
        intersectsCollision: false,
        timestamp: new Date().toISOString()
      });
      setApprovedNotification(true);
    } catch (err) {
      setApprovalError(
        err instanceof Error ? err.message : 'Backend spatial verification failed.'
      );
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Main Workspace Layout */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Cadastral Map Viewport (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 flex flex-col overflow-hidden shadow-lg relative min-h-[480px]">
            {/* Map Canvas Toolbar */}
            <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>Stored in {utmInfo.storageCrs}</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-300">
                  {utmInfo.label} ({utmInfo.epsgCode})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {parcels.length > 1 && (
                  <select
                    value={activeParcel.id}
                    onChange={(e) => handleSelectParcelId(e.target.value)}
                    aria-label="Select parcel for GIS inspection"
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-mono rounded px-2 py-1 outline-none"
                  >
                    {parcels.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.cadastralRef} ({p.status})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setShowOsm((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showOsm
                      ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  OpenStreetMap
                </button>
                <button
                  onClick={() => setShowSatellite((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showSatellite
                      ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Satellite
                </button>
                <button
                  onClick={() => setShowNeighbors((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showNeighbors
                      ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Neighbors
                </button>
                <button
                  onClick={() => setShowBuffer((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showBuffer
                      ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {toleranceBuffer.toFixed(1)}m Buffer
                </button>
                <span className="font-mono text-[11px] text-slate-400 ml-1">
                  {Math.round(mapZoom * 100)}%
                </span>
              </div>
            </div>

            {/* Satellite / OpenStreetMap / Cadastral Vector Screen */}
            <div className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Zoomable Viewport Wrapper */}
              <div
                className="absolute inset-0 transition-transform duration-200 origin-center"
                style={{ transform: `scale(${mapZoom})` }}
              >
                {/* Live OpenStreetMap Base Layer */}
                {showOsm ? (
                  <div className="absolute inset-0 opacity-60">
                    <OpenStreetMapWidget
                      coordinates={activeParcel.coordinates}
                      heightClassName="h-full border-0 rounded-none"
                      interactive={false}
                      polygonColor={polygonStrokeColor}
                    />
                  </div>
                ) : showSatellite ? (
                  <div className="absolute inset-0 opacity-40">
                    <img
                      src={ASSET_IMAGES.satelliteGrid}
                      alt="Cadastral Map"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : null}

                {/* Grid overlay */}
                <div className="absolute inset-0 cadastral-grid opacity-30 pointer-events-none" />

                {/* Real Projected SVG Cadastral Layer */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 420">
                  {/* Real Neighboring Registry Parcels within local extent */}
                  {showNeighbors &&
                    projected.neighbors.map((n) => {
                      const pts = n.points.map((p) => `${p.x},${p.y}`).join(' ');
                      const cx =
                        n.points.reduce((acc, p) => acc + p.x, 0) / Math.max(1, n.points.length);
                      const cy =
                        n.points.reduce((acc, p) => acc + p.y, 0) / Math.max(1, n.points.length);
                      return (
                        <g key={n.id} opacity={n.isConflict ? '0.9' : '0.7'}>
                          <polygon
                            points={pts}
                            fill={
                              n.isConflict
                                ? 'rgba(239, 68, 68, 0.35)'
                                : 'rgba(51, 65, 85, 0.45)'
                            }
                            stroke={n.isConflict ? '#ef4444' : 'rgba(148, 163, 184, 0.7)'}
                            strokeWidth={n.isConflict ? '2.2' : '1.4'}
                            strokeDasharray={n.isConflict ? '4,3' : undefined}
                          />
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            fill={n.isConflict ? '#fca5a5' : '#cbd5e1'}
                            fontSize="10"
                            fontWeight={n.isConflict ? 'bold' : 'normal'}
                            fontFamily="JetBrains Mono"
                          >
                            {n.cadastralRef}
                          </text>
                        </g>
                      );
                    })}

                  {/* Buffer Polygon Halo */}
                  {showBuffer && bufferPoints.length >= 3 && (
                    <polygon
                      points={bufferPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={
                        analysisFailed
                          ? 'rgba(239, 68, 68, 0.10)'
                          : analysisPassed
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(56, 189, 248, 0.10)'
                      }
                      stroke={polygonStrokeColor}
                      strokeOpacity="0.55"
                      strokeWidth="1.2"
                      strokeDasharray="4,4"
                    />
                  )}

                  {/* Active Target Parcel Polygon */}
                  {projected.targetPoints.length >= 3 && (
                    <polygon
                      points={projected.targetPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={polygonFillColor}
                      stroke={polygonStrokeColor}
                      strokeWidth="2.5"
                    />
                  )}

                  {/* Clickable Beacons */}
                  {projected.targetPoints.map((pt, idx) => {
                    const beacon = activeParcel.beacons[idx];
                    const isSelected = selectedBeaconIndex === idx;
                    return (
                      <g
                        key={idx}
                        onClick={() => setSelectedBeaconIndex(isSelected ? null : idx)}
                        className="cursor-pointer"
                      >
                        {isSelected && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="12"
                            fill="rgba(251, 191, 36, 0.25)"
                            stroke="#fbbf24"
                            strokeWidth="1.5"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 7 : 5}
                          fill={
                            isSelected
                              ? '#fbbf24'
                              : analysisFailed
                                ? '#f87171'
                                : analysisPassed
                                  ? '#34d399'
                                  : '#38bdf8'
                          }
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x={pt.x + 10}
                          y={pt.y - 8}
                          fill={isSelected ? '#fde68a' : '#e2e8f0'}
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="JetBrains Mono"
                        >
                          {beacon ? beacon.name : `V${idx + 1}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Map Floating HUD */}
              <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-xs border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                  Cadastral Reference
                </div>
                <div className="font-mono text-emerald-400 font-bold text-sm">
                  {activeParcel.cadastralRef}
                </div>
                <div className="text-slate-300 text-[11px]">
                  {activeParcel.district}, {activeParcel.state}
                </div>
              </div>

              {/* Inspected Beacon Floating Readout */}
              {inspectedBeacon && (
                <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur-xs border border-amber-500/50 p-3 rounded-lg text-xs space-y-1 shadow-xl">
                  <div className="text-amber-300 font-bold font-mono flex items-center justify-between gap-4">
                    <span>Beacon {inspectedBeacon.name}</span>
                    <button
                      onClick={() => setSelectedBeaconIndex(null)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300">
                    WGS84: {inspectedBeacon.lat.toFixed(5)}°, {inspectedBeacon.lng.toFixed(5)}°
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {utmInfo.label}: {inspectedBeacon.easting.toFixed(1)}E ·{' '}
                    {inspectedBeacon.northing.toFixed(1)}N · {inspectedBeacon.elevation}m
                  </div>
                </div>
              )}

              {/* Backend-Driven Status Alert Overlay (never shows success before backend confirms) */}
              <div className="absolute top-4 right-4 max-w-xs">
                {isVerifying ? (
                  <div className="bg-slate-900/95 border border-sky-500/60 text-sky-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                    <span>RUNNING POSTGIS ANALYSIS...</span>
                  </div>
                ) : analysisError ? (
                  <div className="bg-amber-950/95 border border-amber-500 text-amber-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {analysisError.kind === 'migration_required'
                        ? 'POSTGIS MIGRATION REQUIRED'
                        : analysisError.kind === 'backend_unavailable'
                          ? 'BACKEND UNREACHABLE'
                          : 'ANALYSIS ERROR'}
                    </span>
                  </div>
                ) : !spatialResult ? (
                  <div className="bg-slate-900/90 border border-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <Info className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>AWAITING POSTGIS EVALUATION</span>
                  </div>
                ) : hasInvalidGeometry ? (
                  <div className="bg-red-950/90 border border-red-500 text-red-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>INVALID GEOMETRY DETECTED</span>
                  </div>
                ) : hasTrueOverlap ? (
                  <div className="bg-red-950/90 border border-red-500 text-red-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      OVERLAP DETECTED ({spatialResult.trueOverlapCount}{' '}
                      {spatialResult.trueOverlapCount === 1 ? 'CONFLICT' : 'CONFLICTS'})
                    </span>
                  </div>
                ) : hasBlockingBufferBreach ? (
                  <div className="bg-amber-950/90 border border-amber-500 text-amber-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>BUFFER BREACH ({spatialResult.bufferBreachCount})</span>
                  </div>
                ) : (
                  <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>POSTGIS CONSTRAINTS SATISFIED</span>
                  </div>
                )}
              </div>

              {/* Working Map Controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setMapZoom((z) => Math.min(2.0, Number((z + 0.2).toFixed(1))))}
                  className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMapZoom((z) => Math.max(0.7, Number((z - 0.2).toFixed(1))))}
                  className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMapZoom(1);
                    setSelectedBeaconIndex(null);
                  }}
                  className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                  title="Recenter Map"
                >
                  <Compass className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Real PostGIS Analysis Controls Bar */}
            <div className="bg-slate-900 border-t border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300 font-medium">Buffer Tolerance:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={toleranceBuffer}
                    onChange={(e) => setToleranceBuffer(parseFloat(e.target.value))}
                    className="w-24 accent-emerald-500"
                  />
                  <span className="font-mono text-emerald-400">{toleranceBuffer.toFixed(1)}m</span>
                </div>

                <div className="h-4 w-px bg-slate-800" />

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforceBuffer}
                    onChange={(e) => setEnforceBuffer(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <span className="text-slate-300">Enforce Buffer Clearance</span>
                </label>
              </div>

              <button
                onClick={handleRunSpatialAnalysis}
                disabled={isVerifying}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded font-medium flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                {isVerifying ? 'Evaluating PostGIS...' : 'Re-evaluate PostGIS'}
              </button>
            </div>
          </div>

          {/* Real Nearby & Conflict Parcels Panel */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Spatial Conflicts &amp; Nearby Registry Parcels
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {spatialResult
                  ? `${spatialResult.trueOverlapCount} overlaps · ${spatialResult.boundaryContactCount} shared edges · ${spatialResult.bufferBreachCount} buffer`
                  : `${nearbyParcels.length} nearby in registry`}
              </span>
            </div>

            {spatialResult &&
              (spatialResult.trueOverlaps.length > 0 ||
                spatialResult.bufferBreaches.length > 0 ||
                spatialResult.boundaryContacts.length > 0) && (
                <div className="space-y-2 text-xs">
                  {spatialResult.trueOverlaps.map((c) => (
                    <div
                      key={`ov-${c.parcelId}`}
                      className="p-2.5 rounded-lg bg-red-950/60 border border-red-700/60 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 text-red-200">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="font-mono font-bold">{c.cadastralRef}</span>
                        <span className="text-[11px] text-red-300">({c.status})</span>
                      </div>
                      <span className="font-mono text-red-300 text-[11px]">
                        True Overlap: {c.overlapAreaSqm.toFixed(2)} m²
                      </span>
                    </div>
                  ))}

                  {spatialResult.bufferBreaches.map((c) => (
                    <div
                      key={`buf-${c.parcelId}`}
                      className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-700/60 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-mono font-bold">{c.cadastralRef}</span>
                        <span className="text-[11px] text-amber-300">({c.status})</span>
                      </div>
                      <span className="font-mono text-amber-300 text-[11px]">
                        Buffer Breach: {c.distanceMeters.toFixed(2)} m away
                      </span>
                    </div>
                  ))}

                  {spatialResult.boundaryContacts.map((c) => (
                    <div
                      key={`edge-${c.parcelId}`}
                      className="p-2.5 rounded-lg bg-sky-950/40 border border-sky-700/50 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 text-sky-200">
                        <Info className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="font-mono font-bold">{c.cadastralRef}</span>
                        <span className="text-[11px] text-sky-300">({c.status})</span>
                      </div>
                      <span className="font-mono text-sky-300 text-[11px]">
                        Shared Boundary (Non-blocking)
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {nearbyParcels.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {nearbyParcels.map(({ parcel, distanceMeters }) => {
                  const isConflict = conflictIds.has(parcel.id);
                  return (
                    <div
                      key={parcel.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                        isConflict
                          ? 'bg-red-950/40 border-red-700/60'
                          : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-slate-200 truncate">
                          {parcel.cadastralRef}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {parcel.district}, {parcel.state} · {parcel.status}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-slate-300 shrink-0">
                        {formatDistanceLabel(distanceMeters)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                No other registry parcels available for proximity comparison.
              </div>
            )}
          </div>
        </div>

        {/* Right Inspection & Verification Engine Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4 flex flex-col">
          {/* PostGIS Execution Console */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-emerald-400" />
                PostGIS Spatial Verification
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {spatialResult
                  ? `${spatialResult.engine.toUpperCase()} · ${spatialResult.queryDurationMs}ms`
                  : isVerifying
                    ? 'Executing...'
                    : 'Not yet evaluated'}
              </span>
            </div>

            {/* RPC Call Preview */}
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-1.5 border border-slate-800/80">
              <div className="text-slate-500">-- Authoritative PostGIS RPC (WGS 84 EPSG:4326)</div>
              <div className="text-emerald-400 leading-relaxed break-all">
                SELECT public.anagu_verify_parcel_spatial(
                <br />
                &nbsp;&nbsp;p_parcel_id =&gt; '{activeParcel.id}',
                <br />
                &nbsp;&nbsp;p_buffer_meters =&gt; {toleranceBuffer.toFixed(1)},
                <br />
                &nbsp;&nbsp;p_enforce_buffer =&gt; {enforceBuffer ? 'TRUE' : 'FALSE'}
                <br />);
              </div>
            </div>

            {analysisError && (
              <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    {analysisError.kind === 'migration_required'
                      ? 'PostGIS Migration Not Yet Executed'
                      : analysisError.kind === 'backend_unavailable'
                        ? 'Backend Unavailable'
                        : 'Spatial Analysis Failed'}
                  </div>
                  <p className="text-amber-200/90 leading-relaxed">{analysisError.message}</p>
                </div>
              </div>
            )}

            {/* Real Backend Query Output Results */}
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-400 text-[11px]">ST_IsValid Result:</div>
                {spatialResult ? (
                  <div
                    className={`font-mono font-bold mt-0.5 flex items-center gap-1 ${
                      spatialResult.isValid ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {spatialResult.isValid ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate" title={spatialResult.validReason}>
                      {spatialResult.isValid ? 'TRUE (Valid)' : `FALSE (${spatialResult.validReason})`}
                    </span>
                  </div>
                ) : (
                  <div className="font-mono text-slate-500 mt-0.5">
                    {isVerifying ? 'Checking...' : 'Run Re-evaluate PostGIS'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">Interior Overlap Check:</div>
                {spatialResult ? (
                  <div
                    className={`font-mono font-bold mt-0.5 ${
                      spatialResult.hasTrueOverlap ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {spatialResult.hasTrueOverlap
                      ? `CONFLICT (${spatialResult.trueOverlapCount})`
                      : 'CLEAR (0 OVERLAPS)'}
                  </div>
                ) : (
                  <div className="font-mono text-slate-500 mt-0.5">
                    {isVerifying ? 'Checking...' : 'Pending backend check'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">Computed Geodesic Area:</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  {spatialResult?.computedAreaSqm != null
                    ? `${spatialResult.computedAreaSqm.toLocaleString()} m²`
                    : `${activeParcel.areaSqm.toLocaleString()} m² (declared)`}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">Computed Perimeter:</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  {spatialResult?.computedPerimeterM != null
                    ? `${spatialResult.computedPerimeterM.toLocaleString()} m`
                    : `${activeParcel.perimeterM.toLocaleString()} m (declared)`}
                </div>
              </div>
            </div>
          </div>

          {/* Cryptographic Spatial Hash Bindings */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs text-slate-300 font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              On-Chain Spatial Hash &amp; Identity
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-slate-400 text-[11px]">Spatial Geometry Hash (keccak256):</div>
                <div className="font-mono text-emerald-400 bg-slate-900 p-2 rounded border border-slate-800 break-all text-[11px] mt-1">
                  {activeParcel.spatialHash}
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[11px]">Survey Plan Hash (SHA-256):</div>
                <div className="font-mono text-slate-300 bg-slate-900 p-2 rounded border border-slate-800 break-all text-[11px] mt-1">
                  {activeParcel.documentHash}
                </div>
              </div>
            </div>
          </div>

          {/* Beacons Northing/Easting UTM Cadastral Table */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm flex-1 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 text-xs">
              <span className="text-slate-300 font-semibold uppercase tracking-wider">
                Beacon Survey Schedule
              </span>
              <span className="text-[11px] font-mono text-emerald-300">
                {utmInfo.label} · Stored in {utmInfo.storageCrs}
              </span>
            </div>

            <div className="overflow-x-auto mt-2 flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-mono text-[11px]">
                    <th className="py-2">Beacon</th>
                    <th className="py-2">Easting (m)</th>
                    <th className="py-2">Northing (m)</th>
                    <th className="py-2">Elev (m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300 tabular-nums">
                  {activeParcel.beacons.map((b, idx) => (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBeaconIndex(selectedBeaconIndex === idx ? null : idx)}
                      className={`cursor-pointer transition-colors ${
                        selectedBeaconIndex === idx
                          ? 'bg-amber-950/40 text-amber-200'
                          : 'hover:bg-slate-900/70'
                      }`}
                    >
                      <td className="py-2 font-semibold text-emerald-400">{b.name}</td>
                      <td className="py-2">{b.easting.toFixed(1)}</td>
                      <td className="py-2">{b.northing.toFixed(1)}</td>
                      <td className="py-2 text-slate-400">{b.elevation.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Approval Decision Call to Action */}
            {approvalError && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-950/70 border border-red-700/60 text-red-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{approvalError}</span>
              </div>
            )}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {approvedNotification || isAlreadyBackendVerified ? (
                <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Spatial Cadastre Verified!</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  {analysisFailed
                    ? 'Cannot approve: PostGIS spatial validation did not pass.'
                    : analysisPassed
                      ? 'PostGIS check passed — ready for Surveyor General sign-off.'
                      : 'Run Re-evaluate PostGIS or submit for authoritative backend verification.'}
                </div>
              )}

              <div className="flex items-center gap-2">
                {!isAlreadyBackendVerified ? (
                  <button
                    onClick={() => void handleApprove()}
                    disabled={analysisFailed || isApproving || isVerifying}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {isApproving ? 'Verifying Spatial Cadastre...' : 'Approve Spatial Cadastre'}
                  </button>
                ) : onNextStep ? (
                  <button
                    onClick={() => onNextStep(activeParcel.id)}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <span>Proceed to Step 4: Community Oracle</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-xs font-mono text-emerald-400 px-3 py-1.5 bg-emerald-950/60 border border-emerald-700/50 rounded-lg">
                    Verified &amp; Sealed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
