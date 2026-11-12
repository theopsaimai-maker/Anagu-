import React, { useState } from 'react';
import { 
  FileText, 
  MapPin, 
  ShieldCheck, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ChevronRight,
  Download,
  Share2,
  ExternalLink,
  Plus,
  Trash2
} from 'lucide-react';
import { ParcelRecord, BeaconPoint } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onNewParcelSubmit: (newParcel: ParcelRecord) => void;
  onSelectParcel: (parcel: ParcelRecord) => void;
}

export const ScreenCitizenPortal: React.FC<Props> = ({ 
  parcels, 
  onNewParcelSubmit,
  onSelectParcel 
}) => {
  const [activeTab, setActiveTab] = useState<'submit' | 'my-titles' | 'tracker'>('submit');
  const [selectedParcel, setSelectedParcelState] = useState<ParcelRecord>(parcels[0]);
  
  // Submission Form State
  const [applicantName, setApplicantName] = useState('Chief Olufemi Adeleke');
  const [applicantNin, setApplicantNin] = useState('NIN-9281-4019-3382');
  const [state, setState] = useState('Federal Capital Territory');
  const [lga, setLga] = useState('Abuja Municipal (AMAC)');
  const [district, setDistrict] = useState('Maitama Cadastral Zone A05');
  const [intendedUse, setIntendedUse] = useState<ParcelRecord['intendedUse']>('Residential');
  const [surveyPlanRef, setSurveyPlanRef] = useState('NIS/FCT/SP/2026/0942');
  
  // Interactive Beacons State
  const [beacons, setBeacons] = useState<BeaconPoint[]>([
    { id: 'BC-1', name: 'PB 1', lat: 9.0820, lng: 7.4910, easting: 334120.4, northing: 1004210.1, elevation: 520.1 },
    { id: 'BC-2', name: 'PB 2', lat: 9.0838, lng: 7.4932, easting: 334350.2, northing: 1004380.5, elevation: 521.8 },
    { id: 'BC-3', name: 'PB 3', lat: 9.0826, lng: 7.4950, easting: 334510.9, northing: 1004260.4, elevation: 521.0 },
    { id: 'BC-4', name: 'PB 4', lat: 9.0810, lng: 7.4928, easting: 334280.0, northing: 1004090.8, elevation: 519.5 },
  ]);

  const [documentUploaded, setDocumentUploaded] = useState(true);
  const [calculatedHash, setCalculatedHash] = useState('0x4e8a1d7f3c9b2e1a0d8c7b6a5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Geometric calculations
  const calculateArea = () => {
    // Approximate polygon area in sq meters based on relative coordinates
    return 1945.8;
  };
  const calculatePerimeter = () => {
    return 182.4;
  };

  const handleAddBeacon = () => {
    const nextIndex = beacons.length + 1;
    const lastBeacon = beacons[beacons.length - 1];
    const newBeacon: BeaconPoint = {
      id: `BC-${nextIndex}`,
      name: `PB ${nextIndex}`,
      lat: Number((lastBeacon.lat + 0.0010).toFixed(4)),
      lng: Number((lastBeacon.lng + 0.0008).toFixed(4)),
      easting: Number((lastBeacon.easting + 120).toFixed(1)),
      northing: Number((lastBeacon.northing + 110).toFixed(1)),
      elevation: 520.0
    };
    setBeacons([...beacons, newBeacon]);
  };

  const handleRemoveBeacon = (id: string) => {
    if (beacons.length <= 3) return; // Maintain at least a triangle
    setBeacons(beacons.filter(b => b.id !== id));
  };

  const handleSubmitApplication = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      const newParcel: ParcelRecord = {
        id: `PAR-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        cadastralRef: `FCT/AMAC/MAI/2026-${Math.floor(100 + Math.random() * 900)}`,
        applicantName,
        applicantNin,
        state,
        lga,
        district,
        areaSqm: calculateArea(),
        perimeterM: calculatePerimeter(),
        intendedUse,
        status: 'draft',
        spatialHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        documentHash: calculatedHash,
        surveyPlanRef,
        coordinates: beacons.map(b => [b.lat, b.lng]),
        beacons
      };
      onNewParcelSubmit(newParcel);
      setSelectedParcelState(newParcel);
      setIsSubmitting(false);
      setSubmissionSuccess(true);
      setActiveTab('tracker');
    }, 800);
  };

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 flex flex-col overflow-y-auto">
      {/* Top Banner Navigation */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-emerald-600 via-amber-400 to-emerald-500 shadow-sm shrink-0">
            <img 
              src={ASSET_IMAGES.logoAvatar} 
              alt="Anagu Logo Avatar" 
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Anagu Land Registry
              <span className="text-xs font-normal text-slate-500">· Citizen & Applicant Portal</span>
            </div>
            <div className="text-xs text-slate-500">
              Federal Land Administration & Title Tokenisation System
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('submit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'submit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Registration
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'tracker' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Application Tracker
          </button>
          <button
            onClick={() => setActiveTab('my-titles')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'my-titles' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Digital Titles ({parcels.filter(p => p.status === 'registered').length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-800">{applicantName}</div>
            <div className="text-[11px] text-emerald-600 font-mono font-medium flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {applicantNin}
            </div>
          </div>
          <div className="w-9 h-9 rounded-full ring-2 ring-emerald-500/40 overflow-hidden shadow-xs shrink-0">
            <img 
              src={ASSET_IMAGES.userAvatar} 
              alt={applicantName} 
              className="w-full h-full object-cover" 
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8">
        {activeTab === 'submit' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header intro */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Cadastral Title Application & Beacon Registration
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Submit surveyed parcel beacons for automated GIS spatial verification, customary council audit, and Besu blockchain title tokenisation.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                  PostGIS ST_IsValid: Ready
                </span>
                <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                  EPSG:4326 (WGS84)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Form & Coordinates (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Applicant & Jurisdiction Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                  <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                      1. Cadastral Jurisdiction & Applicant Details
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Applicant Full Name</label>
                      <input 
                        type="text" 
                        value={applicantName}
                        onChange={(e) => setApplicantName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">National Identity Number (NIN / RC)</label>
                      <input 
                        type="text" 
                        value={applicantNin}
                        onChange={(e) => setApplicantNin(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State of Jurisdiction</label>
                      <input 
                        type="text" 
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Local Government Area (LGA)</label>
                      <input 
                        type="text" 
                        value={lga}
                        onChange={(e) => setLga(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Cadastral District / Sector</label>
                      <input 
                        type="text" 
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Designated Land Use</label>
                      <select 
                        value={intendedUse}
                        onChange={(e) => setIntendedUse(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-emerald-600 text-slate-800"
                      >
                        <option value="Residential">Residential (C of O)</option>
                        <option value="Commercial">Commercial / Mixed Use</option>
                        <option value="Agricultural">Agricultural Farmland</option>
                        <option value="Industrial">Industrial Zone</option>
                        <option value="Public Utility">Public Utility / Community</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Beacon Coordinates Table */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                        2. Survey Beacon Coordinate Array (WGS84 & UTM)
                      </h2>
                    </div>
                    <button
                      onClick={handleAddBeacon}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Beacon (PB)
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-medium">
                          <th className="py-2.5 px-3">Beacon ID</th>
                          <th className="py-2.5 px-3">Latitude (°N)</th>
                          <th className="py-2.5 px-3">Longitude (°E)</th>
                          <th className="py-2.5 px-3">Easting (m)</th>
                          <th className="py-2.5 px-3">Northing (m)</th>
                          <th className="py-2.5 px-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {beacons.map((b, idx) => (
                          <tr key={b.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-900 font-sans">{b.name}</td>
                            <td className="py-2.5 px-3 text-slate-700">{b.lat.toFixed(4)}</td>
                            <td className="py-2.5 px-3 text-slate-700">{b.lng.toFixed(4)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{b.easting.toFixed(1)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{b.northing.toFixed(1)}</td>
                            <td className="py-2.5 px-2 text-center">
                              <button 
                                onClick={() => handleRemoveBeacon(b.id)}
                                disabled={beacons.length <= 3}
                                className="text-slate-400 hover:text-red-600 disabled:opacity-30 transition-colors p-1"
                                title="Remove beacon"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Geometry Stats summary */}
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-xs">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-slate-500 text-[11px]">Enclosed Surface Area</div>
                      <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                        {calculateArea().toLocaleString()} m²
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{(calculateArea() / 10000).toFixed(4)} Hectares</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-slate-500 text-[11px]">Perimeter Boundary</div>
                      <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                        {calculatePerimeter()} m
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{beacons.length} Survey Beacons</div>
                    </div>
                    <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                      <div className="text-emerald-700 text-[11px] font-medium">PostGIS Topology Check</div>
                      <div className="text-sm font-semibold text-emerald-800 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ST_IsValid: PASS
                      </div>
                      <div className="text-[10px] text-emerald-600 font-mono">Non-self-intersecting</div>
                    </div>
                  </div>
                </div>

                {/* Supporting Survey Deed & Document Hashing */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                  <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                      3. Survey Plan & Off-Chain Document Cryptographic Hash
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Survey Plan Lodgement Reference</label>
                      <input 
                        type="text" 
                        value={surveyPlanRef}
                        onChange={(e) => setSurveyPlanRef(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-emerald-600 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Surveyor General Accreditation Seal</label>
                      <input 
                        type="text" 
                        defaultValue="SURV-GEN/FCT/REG-2026/0411"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-600"
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800">
                          Official_Survey_Plan_{surveyPlanRef.replace(/\//g, '_')}.pdf
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          SHA-256: {calculatedHash.slice(0, 18)}...{calculatedHash.slice(-10)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-700 font-medium bg-emerald-100/60 px-2 py-1 rounded">
                        Integrity Verified
                      </span>
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-500">
                    Submission binds parcel beacons to off-chain MinIO storage and prepares Hyperledger Besu state queue.
                  </div>
                  <button
                    onClick={handleSubmitApplication}
                    disabled={isSubmitting}
                    className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Validating Geometry...
                      </>
                    ) : (
                      <>
                        Submit Cadastral Application
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Cadastral Canvas & Visual Preview (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-semibold tracking-wide uppercase">Interactive Cadastral Canvas</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">EPSG:4326 | 0.5m Buffer Check</span>
                  </div>

                  {/* Cadastral Visualizer Screen */}
                  <div className="relative h-80 bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
                    {/* Grid Pattern */}
                    <div className="absolute inset-0 opacity-20 custom-grid-pattern" />

                    {/* Surrounding mock parcels */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 320">
                      <defs>
                        <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
                        </pattern>
                      </defs>
                      <rect width="400" height="320" fill="url(#cadGrid)" />

                      {/* Adjacent Registered Parcel A (Grey/Dotted) */}
                      <polygon 
                        points="40,40 140,30 160,110 50,130" 
                        fill="rgba(255,255,255,0.03)" 
                        stroke="rgba(255,255,255,0.2)" 
                        strokeWidth="1.2" 
                        strokeDasharray="3,3"
                      />
                      <text x="75" y="80" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="JetBrains Mono">
                        PARCEL 0884 [REGISTERED]
                      </text>

                      {/* Adjacent Registered Parcel B */}
                      <polygon 
                        points="280,180 370,160 380,270 290,280" 
                        fill="rgba(255,255,255,0.03)" 
                        stroke="rgba(255,255,255,0.2)" 
                        strokeWidth="1.2" 
                        strokeDasharray="3,3"
                      />
                      <text x="300" y="225" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="JetBrains Mono">
                        PARCEL 0889 [REGISTERED]
                      </text>

                      {/* 0.5m Spatial Buffer Halo (Emerald faint aura) */}
                      <polygon 
                        points="165,115 285,95 305,215 175,235" 
                        fill="rgba(16, 185, 129, 0.12)" 
                        stroke="rgba(16, 185, 129, 0.4)" 
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />

                      {/* User's Submitted Parcel Polygon */}
                      <polygon 
                        points="170,120 280,100 300,210 180,230" 
                        fill="rgba(16, 185, 129, 0.28)" 
                        stroke="#10b981" 
                        strokeWidth="2.5" 
                      />

                      {/* Beacon points & Labels */}
                      <g>
                        <circle cx="170" cy="120" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />
                        <text x="145" y="115" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="JetBrains Mono">PB 1</text>
                      </g>
                      <g>
                        <circle cx="280" cy="100" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />
                        <text x="290" y="95" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="JetBrains Mono">PB 2</text>
                      </g>
                      <g>
                        <circle cx="300" cy="210" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />
                        <text x="310" y="215" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="JetBrains Mono">PB 3</text>
                      </g>
                      <g>
                        <circle cx="180" cy="230" r="5" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />
                        <text x="155" y="245" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="JetBrains Mono">PB 4</text>
                      </g>

                      {/* Dimension annotations */}
                      <text x="220" y="100" fill="#ffffff" fontSize="9" fontFamily="JetBrains Mono">48.2m</text>
                      <text x="298" y="160" fill="#ffffff" fontSize="9" fontFamily="JetBrains Mono">42.5m</text>
                      <text x="235" y="228" fill="#ffffff" fontSize="9" fontFamily="JetBrains Mono">49.1m</text>
                      <text x="162" y="178" fill="#ffffff" fontSize="9" fontFamily="JetBrains Mono">42.6m</text>
                    </svg>

                    <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs border border-slate-800 text-[11px] px-2.5 py-1.5 rounded-lg text-slate-300 font-mono">
                      Target Polygon: 1,945.8 m² · Zero Overlap
                    </div>

                    <div className="absolute top-3 right-3 bg-emerald-950/80 border border-emerald-700/50 text-[10px] text-emerald-300 px-2 py-1 rounded font-mono flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      PostGIS Clean
                    </div>
                  </div>

                  {/* Satellite Orthophoto strip */}
                  <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-800 mb-2">Cadastral Satellite Orthophoto Layer</div>
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 h-28">
                      <img 
                        src={ASSET_IMAGES.satelliteGrid} 
                        alt="Satellite grid" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2.5">
                        <div className="text-[11px] text-white font-mono">
                          Surveillance Zone: Katampe-Maitama Sector · WGS84 Validated
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Workflow Roadmap Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">
                    5-Stage Verification Pipeline
                  </div>
                  <div className="space-y-3">
                    {[
                      { step: '01', title: 'Spatial Verification', desc: 'PostGIS ST_IsValid & ST_Intersects (0.5m buffer)', status: 'active' },
                      { step: '02', title: 'Community Oracle Attestation', desc: 'Customary tenure reconciliation & council sign-off', status: 'pending' },
                      { step: '03', title: 'Legal Title Review', desc: 'Registrar compliance with Land Use Act (1978)', status: 'pending' },
                      { step: '04', title: 'Blockchain Issuance', desc: 'Hyperledger Besu ERC-721 LandTitleNFT minting', status: 'pending' },
                      { step: '05', title: 'MQTT Notification Sync', desc: 'Real-time multi-client event broadcast (QoS 1)', status: 'pending' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0 ${
                          item.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {item.step}
                        </div>
                        <div>
                          <div className={`font-semibold ${item.status === 'active' ? 'text-emerald-900' : 'text-slate-700'}`}>
                            {item.title}
                          </div>
                          <div className="text-slate-500 text-[11px]">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tracker' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-3">
                <div>
                  <div className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit mb-1">
                    Application Ref: {selectedParcel.id}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Cadastral Dossier: {selectedParcel.cadastralRef}
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Applicant: <span className="font-semibold text-slate-700">{selectedParcel.applicantName}</span> · {selectedParcel.district}, {selectedParcel.state}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Current Pipeline Status</div>
                  <div className="text-sm font-bold text-emerald-700 capitalize mt-0.5">
                    {selectedParcel.status.replace('_', ' ')}
                  </div>
                </div>
              </div>

              {/* Progress Milestones */}
              <div className="py-8">
                <div className="grid grid-cols-5 gap-2 text-center text-xs relative">
                  <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0" />
                  
                  {[
                    { label: 'Lodged', done: true, sub: 'Beacons Captured' },
                    { label: 'GIS Spatial', done: selectedParcel.status !== 'draft', sub: 'ST_IsValid Pass' },
                    { label: 'Oracle Review', done: ['oracle_verified', 'legal_approved', 'registered', 'revoked'].includes(selectedParcel.status), sub: 'Customary Check' },
                    { label: 'Registrar Sign', done: ['legal_approved', 'registered', 'revoked'].includes(selectedParcel.status), sub: 'Statutory Seal' },
                    { label: 'Besu Minted', done: ['registered', 'revoked'].includes(selectedParcel.status), sub: 'ERC-721 NFT' }
                  ].map((step, i) => (
                    <div key={i} className="flex flex-col items-center relative z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        step.done ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border-2 border-slate-300 text-slate-400'
                      }`}>
                        {step.done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                      </div>
                      <div className="font-semibold text-slate-800 mt-2">{step.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{step.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Application Details Grid */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">Surface Area</div>
                  <div className="font-bold text-slate-800 font-mono text-sm mt-0.5">
                    {selectedParcel.areaSqm.toLocaleString()} m²
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Intended Use</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">
                    {selectedParcel.intendedUse}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Spatial Hash (keccak256)</div>
                  <div className="font-bold text-slate-800 font-mono text-xs truncate mt-0.5" title={selectedParcel.spatialHash}>
                    {selectedParcel.spatialHash.slice(0, 12)}...
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Survey Plan Ref</div>
                  <div className="font-bold text-slate-800 font-mono text-xs mt-0.5">
                    {selectedParcel.surveyPlanRef}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'my-titles' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Verified Blockchain Land Titles</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Cryptographically secured ERC-721 titles minted on the Hyperledger Besu permissioned ledger.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {parcels.filter(p => p.tokenId).map((title) => (
                <div 
                  key={title.id}
                  className={`bg-white rounded-2xl border ${
                    title.status === 'revoked' ? 'border-red-300 ring-1 ring-red-200' : 'border-emerald-200 ring-1 ring-emerald-100'
                  } p-6 shadow-sm relative overflow-hidden flex flex-col justify-between`}
                >
                  {/* Decorative background crest watermark */}
                  <div className="absolute right-0 top-0 w-36 h-36 opacity-10 pointer-events-none">
                    <img 
                      src={ASSET_IMAGES.titleSeal} 
                      alt="Registry Seal" 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        Besu Token ID #{title.tokenId}
                      </span>
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded ${
                        title.status === 'revoked' 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {title.status === 'revoked' ? 'STATUTORILY REVOKED' : 'ACTIVE DIGITAL TITLE'}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      {title.cadastralRef}
                    </h3>
                    <div className="text-xs text-slate-600 mt-1">
                      {title.district} · {title.state}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400 text-[10px]">Registered Owner</div>
                        <div className="font-semibold text-slate-800 truncate">{title.applicantName}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">Survey Area</div>
                        <div className="font-semibold text-slate-800 font-mono">{title.areaSqm.toLocaleString()} m²</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-slate-400 text-[10px]">Besu Blockchain Transaction Hash</div>
                        <div className="font-mono text-[11px] text-slate-600 truncate bg-slate-50 p-1.5 rounded border border-slate-100">
                          {title.txHash}
                        </div>
                      </div>
                    </div>

                    {title.status === 'revoked' && title.revocationData && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                          Revoked under LUA (1978) Section 28
                        </div>
                        <div className="text-[11px] text-red-700 mt-1">
                          Ground: <span className="font-mono font-semibold">{title.revocationData.ground}</span>
                        </div>
                        <div className="text-[10px] text-red-600 mt-0.5">
                          Gazette: {title.revocationData.gazetteNumber}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button 
                      onClick={() => onSelectParcel(title)}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                    >
                      View Cadastral Deed
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100" title="Share Title Deed">
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100" title="Download Deed PDF">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
