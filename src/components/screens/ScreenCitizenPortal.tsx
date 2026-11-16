import React, { useState } from 'react';
import {
  FileText,
  MapPin,
  Upload,
  CheckCircle2,
  ChevronRight,
  Compass,
  ShieldCheck,
  X
} from 'lucide-react';
import { ParcelRecord, BeaconPoint, AuthUser } from '../../types/anagu';

interface Props {
  parcels: ParcelRecord[];
  currentUser?: AuthUser | null;
  onNewParcelSubmit: (newParcel: ParcelRecord) => void;
  onSelectParcel: (parcel: ParcelRecord) => void;
  selectedParcelId?: string;
  onSelectParcelId?: (id: string) => void;
  onNextStep?: (parcelId: string) => void;
}

const DOCUMENT_TYPES = [
  'Certificate of Occupancy',
  'Survey Plan',
  "Governor's Statutory Consent",
  'Traditional Council Affidavit'
] as const;

type DocumentTypeOption = (typeof DOCUMENT_TYPES)[number];

const SAMPLE_DEMARCATION_POLYGON =
  '[[[2.2940, 48.8579], [2.2950, 48.8579], [2.2950, 48.8588], [2.2940, 48.8588], [2.2940, 48.8579]]]';

function parseDemarcationPolygon(raw: string): {
  valid: boolean;
  coordinates: [number, number][];
  beacons: BeaconPoint[];
} {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0])) {
      return { valid: false, coordinates: [], beacons: [] };
    }
    const ring = parsed[0];
    if (ring.length < 4) {
      return { valid: false, coordinates: [], beacons: [] };
    }
    for (const pt of ring) {
      if (
        !Array.isArray(pt) ||
        pt.length < 2 ||
        typeof pt[0] !== 'number' ||
        typeof pt[1] !== 'number' ||
        !Number.isFinite(pt[0]) ||
        !Number.isFinite(pt[1])
      ) {
        return { valid: false, coordinates: [], beacons: [] };
      }
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    const vertices =
      first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
    if (vertices.length < 3) {
      return { valid: false, coordinates: [], beacons: [] };
    }
    const coordinates: [number, number][] = vertices.map((pt: number[]) => [pt[1], pt[0]]);
    const beacons: BeaconPoint[] = vertices.map((pt: number[], idx: number) => ({
      id: `BC-${idx + 1}`,
      name: `PB ${idx + 1}`,
      lat: pt[1],
      lng: pt[0],
      easting: Number((330000 + pt[0] * 111320).toFixed(1)),
      northing: Number((pt[1] * 110574).toFixed(1)),
      elevation: 520.0
    }));
    return { valid: true, coordinates, beacons };
  } catch {
    return { valid: false, coordinates: [], beacons: [] };
  }
}

export const ScreenCitizenPortal: React.FC<Props> = ({
  currentUser,
  onNewParcelSubmit,
  onSelectParcelId,
  onNextStep
}) => {
  // Applicant & Jurisdiction
  const [applicantName, setApplicantName] = useState(currentUser?.fullName || '');
  const [applicantNin, setApplicantNin] = useState(currentUser?.credentialId || '');
  const [state, setState] = useState(currentUser?.state || 'Federal Capital Territory');
  const [lga, setLga] = useState('Abuja Municipal (AMAC)');
  const [intendedUse, setIntendedUse] = useState<ParcelRecord['intendedUse']>('Residential');

  // Survey Beacon / Land Demarcation, Location & Official Document
  const [landDemarcation, setLandDemarcation] = useState(SAMPLE_DEMARCATION_POLYGON);
  const [landLocation, setLandLocation] = useState('');
  const [landPrice, setLandPrice] = useState<string>('85000');
  const [surveyPlanRef, setSurveyPlanRef] = useState('');

  const [documentType, setDocumentType] = useState<DocumentTypeOption>('Survey Plan');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [calculatedHash, setCalculatedHash] = useState<string>('');
  const [isHashingFile, setIsHashingFile] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedParcel, setSubmittedParcel] = useState<ParcelRecord | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const kb = Math.max(1, Math.round(file.size / 1024));
    setUploadedFileSize(kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb} KB`);
    setFormError(null);
    setIsHashingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const hashHex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      setCalculatedHash(`0x${hashHex}`);
    } catch {
      setCalculatedHash(
        '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
      );
    } finally {
      setIsHashingFile(false);
    }
  };

  const handleClearFile = () => {
    setUploadedFileName('');
    setUploadedFileSize('');
    setCalculatedHash('');
  };

  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!applicantName.trim() || !applicantNin.trim()) {
      setFormError('Please enter your applicant full name and NIN / RC number.');
      return;
    }
    if (!landDemarcation.trim()) {
      setFormError('Please enter the demarcation of the land polygon coordinates.');
      return;
    }
    const parsedPolygon = parseDemarcationPolygon(landDemarcation.trim());
    if (!parsedPolygon.valid) {
      setFormError(
        `Demarcation of Land must match the format: ${SAMPLE_DEMARCATION_POLYGON}`
      );
      return;
    }
    if (!landLocation.trim()) {
      setFormError('Please enter the location of the land.');
      return;
    }
    if (!uploadedFileName) {
      setFormError('Please upload your official survey plan document before submitting.');
      return;
    }

    setIsSubmitting(true);
    const parsedPrice = parseFloat(landPrice);
    const priceUsd = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 85000;
    const beacons = parsedPolygon.beacons;
    let computedArea = 0;
    for (let i = 0; i < beacons.length; i++) {
      const j = (i + 1) % beacons.length;
      computedArea +=
        beacons[i].easting * beacons[j].northing -
        beacons[j].easting * beacons[i].northing;
    }
    const areaSqm = Number((Math.abs(computedArea) / 2 || 1200).toFixed(1));
    const perimeterM = Number((Math.sqrt(areaSqm) * 4).toFixed(1));

    setTimeout(() => {
      const newId = `PAR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const cleanState = state.trim() || 'Federal Capital Territory';
      const cleanLga = lga.trim() || 'Municipal';
      const statePrefix = cleanState.toLowerCase().includes('lagos')
        ? 'LAG'
        : cleanState.toLowerCase().includes('ogun')
        ? 'OGN'
        : cleanState.toLowerCase().includes('enugu')
        ? 'ENU'
        : 'FCT';

      const newParcel: ParcelRecord = {
        id: newId,
        cadastralRef: `${statePrefix}/${cleanLga.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X')}/2026-${Math.floor(
          100 + Math.random() * 900
        )}`,
        applicantName: applicantName.trim(),
        applicantNin: applicantNin.trim(),
        state: cleanState,
        lga: cleanLga,
        district: `${landLocation.trim()}`,
        areaSqm,
        perimeterM,
        intendedUse,
        priceUsd,
        status: 'draft',
        spatialHash:
          '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        documentHash:
          calculatedHash ||
          '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        surveyPlanRef: surveyPlanRef.trim() || `NIS/${statePrefix}/SP/2026/${Math.floor(1000 + Math.random() * 8999)}`,
        coordinates: parsedPolygon.coordinates,
        beacons: parsedPolygon.beacons
      };

      onNewParcelSubmit(newParcel);
      onSelectParcelId?.(newParcel.id);
      setIsSubmitting(false);
      setSubmittedParcel(newParcel);
    }, 450);
  };

  const handleResetForm = () => {
    setSubmittedParcel(null);
    setLandDemarcation(SAMPLE_DEMARCATION_POLYGON);
    setLandLocation('');
    setSurveyPlanRef('');
    setDocumentType('Survey Plan');
    setUploadedFileName('');
    setUploadedFileSize('');
    setCalculatedHash('');
    setFormError(null);
  };

  return (
    <div className="w-full min-h-full bg-[#070b12] text-slate-100 relative overflow-y-auto">
      {/* Subtle architectural radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.10),transparent_70%)]"
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
        {/* Centered Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Statutory Land Title Filing</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight text-balance">
            Register Land Application
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Complete your applicant record, describe the land demarcation and exact location, and upload your official survey plan document.
          </p>
        </div>

        {/* Success Receipt Card OR Centered Registration Form */}
        {submittedParcel ? (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white">Application Submitted Successfully</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Your parcel registration has been recorded in the registry and queued for boundary verification.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Cadastral Reference</span>
                <span className="font-mono font-bold text-emerald-400 text-sm mt-0.5 block">
                  {submittedParcel.cadastralRef}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Applicant</span>
                <span className="font-semibold text-white mt-0.5 block">
                  {submittedParcel.applicantName} ({submittedParcel.applicantNin})
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Demarcation of Land &amp; Land price</span>
                <span className="font-mono text-slate-200 mt-0.5 block break-all">
                  {landDemarcation} · $
                  {(Number.isFinite(parseFloat(landPrice)) ? parseFloat(landPrice) : 85000).toLocaleString('en-US')} USD
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Location of the Land</span>
                <span className="font-medium text-slate-200 mt-0.5 block">
                  {landLocation}, {submittedParcel.state}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Submitted Document ({documentType})</span>
                <span className="font-mono text-slate-300 mt-0.5 block truncate">
                  {uploadedFileName} · Hash: {submittedParcel.documentHash.slice(0, 22)}...
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
              >
                Register Another Land
              </button>

              {onNextStep && (
                <button
                  type="button"
                  onClick={() => onNextStep(submittedParcel.id)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <span>Proceed to Verification</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitApplication}
            className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Section 1: Applicant & Jurisdiction */}
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    1. Applicant &amp; Jurisdiction Details
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Identity and state administration information for the titleholder
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Applicant Full Name *</span>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="e.g. Dr. Aminu Bello Abubakar"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">National Identity Number (NIN / RC) *</span>
                  <input
                    type="text"
                    required
                    value={applicantNin}
                    onChange={(e) => setApplicantNin(e.target.value)}
                    placeholder="e.g. NIN-8921-4091-2311"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">State of Jurisdiction</span>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Federal Capital Territory"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Local Government Area (LGA)</span>
                  <input
                    type="text"
                    value={lga}
                    onChange={(e) => setLga(e.target.value)}
                    placeholder="e.g. Abuja Municipal (AMAC)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>

                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="font-medium text-slate-300">Designated Land Use</span>
                  <select
                    value={intendedUse}
                    onChange={(e) => setIntendedUse(e.target.value as ParcelRecord['intendedUse'])}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 outline-none transition-colors"
                  >
                    <option value="Residential">Residential (C of O)</option>
                    <option value="Commercial">Commercial / Mixed Use</option>
                    <option value="Agricultural">Agricultural Farmland</option>
                    <option value="Industrial">Industrial Zone</option>
                    <option value="Public Utility">Public Utility / Community</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Section 2: Survey Beacon Coordinate Array (WGS84 & UTM) */}
            <div className="p-6 sm:p-8 border-t border-slate-800 space-y-5 bg-slate-900/50">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    2. Survey Beacon Coordinate Array (WGS84 &amp; UTM)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Land demarcation, parcel location, and official survey plan upload
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="demarcation-input" className="block font-medium text-slate-300">
                    Demarcation of Land *
                  </label>
                  <textarea
                    id="demarcation-input"
                    required
                    rows={2}
                    value={landDemarcation}
                    onChange={(e) => setLandDemarcation(e.target.value)}
                    placeholder={SAMPLE_DEMARCATION_POLYGON}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-colors resize-y"
                  />
                  <p className="text-[11px] text-slate-500 font-mono">
                    Format: [[[lng, lat], [lng, lat], [lng, lat], [lng, lat], [lng, lat]]]
                  </p>
                </div>

                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="font-medium text-slate-300">Location of the Land *</span>
                  <input
                    type="text"
                    required
                    value={landLocation}
                    onChange={(e) => setLandLocation(e.target.value)}
                    placeholder="e.g. Plot 24, Admiralty Way, Lekki Phase 1"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Land price</span>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="100"
                      value={landPrice}
                      onChange={(e) => setLandPrice(e.target.value)}
                      placeholder="85000"
                      className="w-full pl-7 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono tabular-nums text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Survey Plan Reference (Optional)</span>
                  <input
                    type="text"
                    value={surveyPlanRef}
                    onChange={(e) => setSurveyPlanRef(e.target.value)}
                    placeholder="e.g. NIS/FCT/SP/2026/0942"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                  />
                </label>
              </div>

              {/* Official Survey Plan Document Upload */}
              <div className="space-y-3 pt-1">
                <span className="block text-xs font-medium text-slate-300">
                  Official Survey Plan Document *
                </span>

                <div className="space-y-1.5">
                  <span className="block text-[11px] text-slate-400">
                    Specify the kind of document you are submitting:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Document type">
                    {DOCUMENT_TYPES.map((typeOption, idx) => {
                      const isSelected = documentType === typeOption;
                      return (
                        <button
                          key={typeOption}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setDocumentType(typeOption)}
                          className={`px-3.5 py-2.5 rounded-xl border text-left text-xs font-medium transition-colors flex items-center gap-2.5 ${
                            isSelected
                              ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-mono shrink-0 ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-500 text-slate-950 font-bold'
                                : 'border-slate-600 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="truncate">{typeOption}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {uploadedFileName ? (
                  <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-emerald-400">{documentType}</div>
                        <div className="text-xs font-semibold text-white truncate">
                          {uploadedFileName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {uploadedFileSize}
                          {isHashingFile
                            ? ' · Verifying document...'
                            : calculatedHash
                            ? ` · SHA-256 ${calculatedHash.slice(0, 14)}...`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors">
                        Replace
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Remove uploaded document"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center gap-2.5 p-6 rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500/70 bg-slate-950/70 hover:bg-slate-950 transition-colors text-center">
                    <div className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white">
                        Click to upload your {documentType}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Supports stamped PDF, PNG, JPG, or DOC files
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Submit Bar */}
            <div className="px-6 sm:px-8 py-5 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {formError ? (
                <div className="text-xs text-red-400 font-medium">{formError}</div>
              ) : (
                <div className="text-xs text-slate-400">
                  All submissions are cryptographically stamped and recorded in the state registry.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-lg transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Application</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
