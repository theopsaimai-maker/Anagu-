import React, { useState } from 'react';
import { 
  Compass, 
  Map, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  RefreshCw, 
  Terminal, 
  ShieldCheck, 
  ZoomIn, 
  ZoomOut,
  Crosshair,
  Sliders,
  Check,
  ArrowRight
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onApproveSpatial: (parcelId: string) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
  selectedParcelId?: string;
  onSelectParcelId?: (id: string) => void;
  onNextStep?: (parcelId: string) => void;
}

export const ScreenSurveyorCadastral: React.FC<Props> = ({ 
  parcels, 
  onApproveSpatial,
  onEmitMqtt,
  selectedParcelId: externalParcelId,
  onSelectParcelId,
  onNextStep
}) => {
  const [localParcelId, setLocalParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id);
  const selectedParcelId = externalParcelId || localParcelId;
  const handleSelectParcelId = (id: string) => {
    setLocalParcelId(id);
    onSelectParcelId?.(id);
    setSelectedBeaconIndex(null);
  };

  const [toleranceBuffer, setToleranceBuffer] = useState<number>(0.5); // 0.5m buffer
  const [simulateCollision, setSimulateCollision] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [sqlExecuted, setSqlExecuted] = useState<boolean>(true);
  const [approvedNotification, setApprovedNotification] = useState<boolean>(false);

  // Interactive GIS Map Viewport & Layer Controls
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [showSatellite, setShowSatellite] = useState<boolean>(true);
  const [showNeighbors, setShowNeighbors] = useState<boolean>(true);
  const [showBuffer, setShowBuffer] = useState<boolean>(true);
  const [selectedBeaconIndex, setSelectedBeaconIndex] = useState<number | null>(null);

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];
  const beaconCoords = [
    { x: 250, y: 150 },
    { x: 400, y: 130 },
    { x: 420, y: 270 },
    { x: 270, y: 290 },
  ];
  const inspectedBeacon = selectedBeaconIndex !== null ? activeParcel.beacons[selectedBeaconIndex] : null;

  const handleRunSpatialAnalysis = () => {
    setIsVerifying(true);
    setSqlExecuted(false);
    setTimeout(() => {
      setIsVerifying(false);
      setSqlExecuted(true);
    }, 500);
  };

  const handleApprove = () => {
    onApproveSpatial(activeParcel.id);
    onEmitMqtt('land/registration/status', {
      applicationId: activeParcel.id,
      status: 'spatial_verified',
      toleranceBufferM: toleranceBuffer,
      postgisValid: true,
      intersectsCollision: simulateCollision,
      timestamp: new Date().toISOString()
    });
    setApprovedNotification(true);
  };

  const hasCollision = simulateCollision;

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Main Workspace Layout */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Cadastral Map Viewport (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 flex flex-col overflow-hidden shadow-lg relative min-h-[480px]">
            {/* Map Canvas Toolbar */}
            <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-mono">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>EPSG:4326 · WGS84 Datum</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setShowSatellite(v => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showSatellite ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Satellite
                </button>
                <button
                  onClick={() => setShowNeighbors(v => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showNeighbors ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Neighbors
                </button>
                <button
                  onClick={() => setShowBuffer(v => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showBuffer ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {toleranceBuffer}m Buffer
                </button>
                <span className="font-mono text-[11px] text-slate-400 ml-1">{Math.round(mapZoom * 100)}%</span>
              </div>
            </div>

            {/* Satellite / Cadastral Vector Screen */}
            <div className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Zoomable Viewport Wrapper */}
              <div
                className="absolute inset-0 transition-transform duration-200 origin-center"
                style={{ transform: `scale(${mapZoom})` }}
              >
                {/* Satellite Background Layer */}
                {showSatellite && (
                  <div className="absolute inset-0 opacity-40">
                    <img 
                      src={ASSET_IMAGES.satelliteGrid} 
                      alt="Cadastral Map" 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Grid overlay */}
                <div className="absolute inset-0 cadastral-grid opacity-30" />

                {/* SVG Cadastral Layer */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 420">
                  {/* Existing Registered Parcels */}
                  {showNeighbors && (
                    <g opacity="0.65">
                      <polygon 
                        points="60,60 210,50 230,170 80,190" 
                        fill="rgba(51, 65, 85, 0.4)" 
                        stroke="rgba(148, 163, 184, 0.6)" 
                        strokeWidth="1.5" 
                      />
                      <text x="100" y="115" fill="#94a3b8" fontSize="11" fontFamily="JetBrains Mono">
                        PARCEL LAG-0881 [TITLED]
                      </text>
                      
                      <polygon 
                        points="420,240 560,220 580,370 440,390" 
                        fill="rgba(51, 65, 85, 0.4)" 
                        stroke="rgba(148, 163, 184, 0.6)" 
                        strokeWidth="1.5" 
                      />
                      <text x="450" y="310" fill="#94a3b8" fontSize="11" fontFamily="JetBrains Mono">
                        PARCEL LAG-0899 [TITLED]
                      </text>
                    </g>
                  )}

                  {/* Simulated Overlapping Encroachment Geometry (if simulated) */}
                  {hasCollision && (
                    <g>
                      <polygon 
                        points="200,150 360,130 380,260 220,280" 
                        fill="rgba(239, 68, 68, 0.35)" 
                        stroke="#ef4444" 
                        strokeWidth="2.5" 
                        strokeDasharray="5,5"
                      />
                      <polygon 
                        points="200,150 230,170 220,280" 
                        fill="rgba(255, 0, 0, 0.7)" 
                        stroke="#ff0000" 
                        strokeWidth="3"
                      />
                      <g transform="translate(240, 168)">
                        <path 
                          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" 
                          fill="#ef4444" 
                          stroke="#dc2626" 
                          strokeWidth="1"
                          transform="scale(0.65) translate(0, -18)"
                        />
                        <line x1="7" y1="-3" x2="7" y2="1" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
                        <circle cx="7" cy="3.5" r="0.7" fill="#ffffff" />
                      </g>
                      <text x="258" y="180" fill="#fca5a5" fontSize="12" fontWeight="bold" fontFamily="JetBrains Mono">
                        ST_Intersects Collision (14.2 m² Overlap with 0881)
                      </text>
                    </g>
                  )}

                  {!hasCollision && (
                    <g>
                      {/* Buffer Polygon Halo */}
                      {showBuffer && (
                        <polygon 
                          points="245,145 405,125 425,275 265,295" 
                          fill="rgba(16, 185, 129, 0.12)" 
                          stroke="rgba(16, 185, 129, 0.5)" 
                          strokeWidth="1.2" 
                          strokeDasharray="4,4"
                        />
                      )}

                      {/* Verified Target Parcel */}
                      <polygon 
                        points="250,150 400,130 420,270 270,290" 
                        fill="rgba(16, 185, 129, 0.3)" 
                        stroke="#10b981" 
                        strokeWidth="2.5" 
                      />

                      {/* Clickable Beacons */}
                      {beaconCoords.map((pt, idx) => {
                        const beacon = activeParcel.beacons[idx];
                        const isSelected = selectedBeaconIndex === idx;
                        return (
                          <g 
                            key={idx} 
                            onClick={() => setSelectedBeaconIndex(isSelected ? null : idx)}
                            className="cursor-pointer"
                          >
                            {isSelected && (
                              <circle cx={pt.x} cy={pt.y} r="12" fill="rgba(52, 211, 153, 0.25)" stroke="#34d399" strokeWidth="1.5" />
                            )}
                            <circle 
                              cx={pt.x} 
                              cy={pt.y} 
                              r={isSelected ? 7 : 5} 
                              fill={isSelected ? '#fbbf24' : '#34d399'} 
                              stroke="#ffffff" 
                              strokeWidth="2" 
                            />
                            <text 
                              x={pt.x + (idx === 1 || idx === 2 ? 12 : -36)} 
                              y={pt.y + (idx >= 2 ? 14 : -8)} 
                              fill={isSelected ? '#fde68a' : '#a7f3d0'} 
                              fontSize="11" 
                              fontWeight="bold" 
                              fontFamily="JetBrains Mono"
                            >
                              {beacon ? beacon.name : `LB 20${idx + 1}`}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}
                </svg>
              </div>

              {/* Map Floating HUD */}
              <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-xs border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Cadastral Reference</div>
                <div className="font-mono text-emerald-400 font-bold text-sm">{activeParcel.cadastralRef}</div>
                <div className="text-slate-300 text-[11px]">{activeParcel.district}</div>
              </div>

              {/* Inspected Beacon Floating Readout */}
              {inspectedBeacon && (
                <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur-xs border border-amber-500/50 p-3 rounded-lg text-xs space-y-1 shadow-xl">
                  <div className="text-amber-300 font-bold font-mono flex items-center justify-between gap-4">
                    <span>Beacon {inspectedBeacon.name}</span>
                    <button onClick={() => setSelectedBeaconIndex(null)} className="text-[10px] text-slate-400 hover:text-white">
                      Clear
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300">
                    WGS84: {inspectedBeacon.lat.toFixed(5)}°N, {inspectedBeacon.lng.toFixed(5)}°E
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    UTM: {inspectedBeacon.easting.toFixed(1)}E · {inspectedBeacon.northing.toFixed(1)}N · {inspectedBeacon.elevation}m
                  </div>
                </div>
              )}

              {/* Status Alert Overlay */}
              <div className="absolute top-4 right-4">
                {hasCollision ? (
                  <div className="bg-red-950/90 border border-red-500 text-red-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>OVERLAP DETECTED: REJECT APPLICATION</span>
                  </div>
                ) : (
                  <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>SPATIAL CONSTRAINTS SATISFIED</span>
                  </div>
                )}
              </div>

              {/* Working Map Controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-lg">
                <button 
                  onClick={() => setMapZoom(z => Math.min(2.0, Number((z + 0.2).toFixed(1))))}
                  className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-slate-800" 
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setMapZoom(z => Math.max(0.7, Number((z - 0.2).toFixed(1))))}
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

            {/* Simulation controls bar */}
            <div className="bg-slate-900 border-t border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300 font-medium">Buffer Tolerance:</span>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="2.0" 
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
                    checked={simulateCollision}
                    onChange={(e) => setSimulateCollision(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <span className="text-slate-300">Simulate Adversary Overlap Claim</span>
                </label>
              </div>

              <button
                onClick={handleRunSpatialAnalysis}
                disabled={isVerifying}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                Re-evaluate PostGIS
              </button>
            </div>
          </div>
        </div>

        {/* Right Inspection & Verification Engine Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4 flex flex-col">
          {/* PostGIS Execution Console */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-emerald-400" />
                PostGIS Spatial Verification Query
              </div>
              <span className="text-[11px] font-mono text-slate-500">Query Runtime: 412ms</span>
            </div>

            {/* SQL Terminal Box */}
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-1.5 border border-slate-800/80">
              <div className="text-slate-500">-- 1. Check geometry topology integrity</div>
              <div className="text-emerald-400">
                SELECT ST_IsValid(geom) AS is_valid, ST_IsValidReason(geom)
              </div>
              <div className="text-slate-500">-- 2. Detect 0.5m buffer overlap with existing parcels</div>
              <div className="text-emerald-400 leading-relaxed">
                SELECT ST_Intersects(ST_Buffer(new_parcel.geom, {toleranceBuffer}), existing.geom)<br />
                FROM parcels existing<br />
                WHERE existing.id != '{activeParcel.id}';
              </div>
            </div>

            {/* Query Output Results */}
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-400 text-[11px]">ST_IsValid Result:</div>
                <div className="text-emerald-400 font-mono font-bold mt-0.5 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  TRUE (Valid Polygon)
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">ST_Intersects Overlap:</div>
                <div className={`font-mono font-bold mt-0.5 ${hasCollision ? 'text-red-400' : 'text-emerald-400'}`}>
                  {hasCollision ? 'TRUE (COLLISION DETECTED)' : 'FALSE (0 OVERLAPS)'}
                </div>
              </div>
            </div>
          </div>

          {/* Cryptographic Spatial Hash Bindings */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs text-slate-300 font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              On-Chain Spatial Hash & Identity
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
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <span className="text-slate-300 font-semibold uppercase tracking-wider">Beacon Survey Schedule</span>
              <span className="text-[11px] font-mono text-slate-400">UTM Zone 31N</span>
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
                      className={`cursor-pointer transition-colors ${selectedBeaconIndex === idx ? 'bg-amber-950/40 text-amber-200' : 'hover:bg-slate-900/70'}`}
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
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {approvedNotification || ['spatial_verified', 'oracle_verified', 'legal_approved', 'registered'].includes(activeParcel.status) ? (
                <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Spatial Cadastre Verified!</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  {hasCollision ? 'Cannot approve: Encroachment violation.' : 'Ready for Surveyor General sign-off.'}
                </div>
              )}

              <div className="flex items-center gap-2">
                {!(activeParcel.status === 'spatial_verified' || activeParcel.status === 'oracle_verified' || activeParcel.status === 'registered') ? (
                  <button
                    onClick={handleApprove}
                    disabled={hasCollision}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Approve Spatial Cadastre
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
                    Verified & Sealed
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
