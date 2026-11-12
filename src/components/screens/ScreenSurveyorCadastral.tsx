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
  Check
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onApproveSpatial: (parcelId: string) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
}

export const ScreenSurveyorCadastral: React.FC<Props> = ({ 
  parcels, 
  onApproveSpatial,
  onEmitMqtt 
}) => {
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id);
  const [toleranceBuffer, setToleranceBuffer] = useState<number>(0.5); // 0.5m buffer
  const [simulateCollision, setSimulateCollision] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [sqlExecuted, setSqlExecuted] = useState<boolean>(true);
  const [approvedNotification, setApprovedNotification] = useState<boolean>(false);

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];

  const handleRunSpatialAnalysis = () => {
    setIsVerifying(true);
    setSqlExecuted(false);
    setTimeout(() => {
      setIsVerifying(false);
      setSqlExecuted(true);
    }, 600);
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
    setTimeout(() => setApprovedNotification(false), 3000);
  };

  const hasCollision = simulateCollision;

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Header Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-8 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              Cadastral Spatial Verification Console
              <span className="text-xs font-mono font-normal text-emerald-400">PostGIS 3.4 / GEOS 3.12</span>
            </div>
            <div className="text-xs text-slate-400">
              Surveyor General Directorate · Spatial Invariant Engine
            </div>
          </div>
        </div>

        {/* Selected Parcel Switcher */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium hidden sm:block">Active Inspection Dossier:</label>
          <select 
            value={selectedParcelId}
            onChange={(e) => setSelectedParcelId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-emerald-500"
          >
            {parcels.map(p => (
              <option key={p.id} value={p.id}>
                {p.cadastralRef} ({p.applicantName.split(' ')[0]}) - {p.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Cadastral Map Viewport (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 flex flex-col overflow-hidden shadow-lg relative min-h-[480px]">
            {/* Map Canvas Toolbar */}
            <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-mono">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>EPSG:4326 · WGS84 Datum (Minna Datum Transformation)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Tolerance Buffer:</span>
                <span className="font-mono text-emerald-400 font-bold">{toleranceBuffer}m</span>
              </div>
            </div>

            {/* Satellite / Cadastral Vector Screen */}
            <div className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Satellite Background Layer */}
              <div className="absolute inset-0 opacity-40">
                <img 
                  src={ASSET_IMAGES.satelliteGrid} 
                  alt="Cadastral Map" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Grid overlay */}
              <div className="absolute inset-0 cadastral-grid opacity-30" />

              {/* SVG Cadastral Layer */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 420">
                {/* Existing Registered Parcels */}
                <g opacity="0.6">
                  {/* Parcel 1 */}
                  <polygon 
                    points="60,60 210,50 230,170 80,190" 
                    fill="rgba(51, 65, 85, 0.4)" 
                    stroke="rgba(148, 163, 184, 0.6)" 
                    strokeWidth="1.5" 
                  />
                  <text x="100" y="115" fill="#94a3b8" fontSize="11" fontFamily="JetBrains Mono">
                    PARCEL LAG-0881 [TITLED]
                  </text>
                  
                  {/* Parcel 2 (Right) */}
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
                    {/* Overlap intersection zone highlight */}
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
                    {/* 0.5m Buffer Polygon Halo */}
                    <polygon 
                      points="245,145 405,125 425,275 265,295" 
                      fill="rgba(16, 185, 129, 0.12)" 
                      stroke="rgba(16, 185, 129, 0.5)" 
                      strokeWidth="1.2" 
                      strokeDasharray="4,4"
                    />

                    {/* Verified Target Parcel */}
                    <polygon 
                      points="250,150 400,130 420,270 270,290" 
                      fill="rgba(16, 185, 129, 0.3)" 
                      stroke="#10b981" 
                      strokeWidth="2.5" 
                    />

                    {/* Beacons and Lines */}
                    <circle cx="250" cy="150" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="2" />
                    <text x="220" y="145" fill="#a7f3d0" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">LB 201</text>

                    <circle cx="400" cy="130" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="2" />
                    <text x="410" y="125" fill="#a7f3d0" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">LB 202</text>

                    <circle cx="420" cy="270" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="2" />
                    <text x="430" y="280" fill="#a7f3d0" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">LB 203</text>

                    <circle cx="270" cy="290" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="2" />
                    <text x="240" y="305" fill="#a7f3d0" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">LB 204</text>
                  </g>
                )}
              </svg>

              {/* Map Floating HUD */}
              <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-xs border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Cadastral Reference</div>
                <div className="font-mono text-emerald-400 font-bold text-sm">{activeParcel.cadastralRef}</div>
                <div className="text-slate-300 text-[11px]">{activeParcel.district}</div>
              </div>

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

              {/* Map Controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-lg">
                <button className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800" title="Zoom In">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800" title="Zoom Out">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800" title="Recenter">
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
                  {activeParcel.beacons.map((b) => (
                    <tr key={b.id}>
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
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              {approvedNotification ? (
                <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Approved & Dispatched via MQTT!
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  {hasCollision ? 'Cannot approve: Encroachment violation.' : 'Ready for Surveyor General sign-off.'}
                </div>
              )}

              <button
                onClick={handleApprove}
                disabled={hasCollision || activeParcel.status === 'spatial_verified' || activeParcel.status === 'registered'}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Approve Spatial Cadastre
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
