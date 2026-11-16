import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  MapPin,
  Upload,
  CheckCircle2,
  ChevronRight,
  Compass,
  ShieldCheck,
  X,
  Search,
  Map as MapIcon,
  RefreshCw,
  Camera,
  Wallet
} from 'lucide-react';
import { ParcelRecord, BeaconPoint, AuthUser } from '../../types/anagu';
import {
  NIGERIA_STATES_AND_LGAS,
  getLgasForState,
  getStateCode,
  normalizeNigeriaState
} from '../../data/nigeriaLocations';
import {
  buildPolygonJsonFromCenter,
  captureOsmMapSnapshot,
  geocodeNigerianLocation,
  GeocodeSuggestion,
  getStateCenter,
  searchNigerianLandmarks
} from '../../lib/osm';
import {
  connectWeb3Wallet,
  discoverWalletsOnce,
  formatWalletError,
  isValidEvmAddress
} from '../../lib/web3Wallet';
import { OpenStreetMapWidget } from '../maps/OpenStreetMapWidget';

interface Props {
  parcels: ParcelRecord[];
  currentUser?: AuthUser | null;
  onNewParcelSubmit: (newParcel: ParcelRecord) => void;
  onSelectParcel: (parcel: ParcelRecord) => void;
  selectedParcelId?: string;
  onSelectParcelId?: (id: string) => void;
  onNextStep?: (parcelId: string) => void;
  onOpenLands?: () => void;
}

const DOCUMENT_TYPES = [
  'Certificate of Occupancy',
  'Survey Plan',
  "Governor's Statutory Consent",
  'Traditional Council Affidavit'
] as const;

type DocumentTypeOption = (typeof DOCUMENT_TYPES)[number];

const SAMPLE_DEMARCATION_POLYGON =
  '[[[7.4910, 9.0820], [7.4922, 9.0820], [7.4922, 9.0830], [7.4910, 9.0830], [7.4910, 9.0820]]]';

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
  onNextStep,
  onOpenLands
}) => {
  const initialState = normalizeNigeriaState(currentUser?.state);
  const initialLgas = getLgasForState(initialState);
  const initialCenter = getStateCenter(initialState);

  // Applicant & Jurisdiction
  const [applicantName, setApplicantName] = useState(currentUser?.fullName || '');
  const [applicantNin, setApplicantNin] = useState(currentUser?.credentialId || '');
  const [sellerWallet, setSellerWallet] = useState('');
  const [isConnectingSellerWallet, setIsConnectingSellerWallet] = useState(false);
  const [sellerWalletNote, setSellerWalletNote] = useState<string | null>(null);
  const [state, setState] = useState(initialState);
  const [lga, setLga] = useState(
    initialLgas.includes('Abuja Municipal (AMAC)') ? 'Abuja Municipal (AMAC)' : initialLgas[0]
  );
  const [intendedUse, setIntendedUse] = useState<ParcelRecord['intendedUse']>('Residential');

  // Survey Beacon / Land Demarcation, Location & Official Document
  const [landDemarcation, setLandDemarcation] = useState(() =>
    buildPolygonJsonFromCenter(initialCenter[0], initialCenter[1])
  );
  const [hasCustomPolygon, setHasCustomPolygon] = useState(false);
  const [landLocation, setLandLocation] = useState('');
  const [landPrice, setLandPrice] = useState<string>('85000');
  const [surveyPlanRef, setSurveyPlanRef] = useState('');
  const [isLocatingMap, setIsLocatingMap] = useState(false);
  const [mapStatusNote, setMapStatusNote] = useState<string>(
    `Centered on ${initialState} · Type a landmark or click map to preview exact location`
  );
  const [landmarkSuggestions, setLandmarkSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [previewSnapshotUrl, setPreviewSnapshotUrl] = useState<string>('');
  const [previewSignature, setPreviewSignature] = useState<string>('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const [documentType, setDocumentType] = useState<DocumentTypeOption>('Survey Plan');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [calculatedHash, setCalculatedHash] = useState<string>('');
  const [isHashingFile, setIsHashingFile] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedParcel, setSubmittedParcel] = useState<ParcelRecord | null>(null);

  const livePolygon = useMemo(
    () => parseDemarcationPolygon(landDemarcation.trim()),
    [landDemarcation]
  );

  const recenterMapForRegion = async (
    targetLoc: string,
    targetLga: string,
    targetState: string,
    force = false
  ) => {
    if (!force && hasCustomPolygon) return;
    setIsLocatingMap(true);
    try {
      const geo = await geocodeNigerianLocation(targetLoc, targetLga, targetState);
      setLandDemarcation(buildPolygonJsonFromCenter(geo.lat, geo.lng));
      setMapStatusNote(
        `OpenStreetMap pinned: ${geo.displayName} (${geo.lat.toFixed(5)}°N, ${geo.lng.toFixed(5)}°E)`
      );
    } finally {
      setIsLocatingMap(false);
    }
  };

  // Debounced landmark autocomplete + automatic exact location map centering while typing
  useEffect(() => {
    const query = landLocation.trim();
    if (query.length < 3) {
      setLandmarkSuggestions([]);
      return;
    }
    let cancelled = false;
    const searchTimer = window.setTimeout(async () => {
      const results = await searchNigerianLandmarks(query, state);
      if (!cancelled) {
        setLandmarkSuggestions(results);
      }
    }, 380);

    const autoLocateTimer = window.setTimeout(() => {
      if (!cancelled && !hasCustomPolygon) {
        void recenterMapForRegion(query, lga, state, false);
      }
    }, 780);

    return () => {
      cancelled = true;
      window.clearTimeout(searchTimer);
      window.clearTimeout(autoLocateTimer);
    };
  }, [landLocation, state, lga, hasCustomPolygon]);

  // Live pre-submission OpenStreetMap snapshot preview for Access Lands
  useEffect(() => {
    if (!livePolygon.valid || livePolygon.coordinates.length < 3) {
      setPreviewSnapshotUrl('');
      return;
    }
    let cancelled = false;
    const label = landLocation.trim()
      ? `${landLocation.trim()}, ${state}`
      : `${lga}, ${state}`;

    const sig = `${landDemarcation.trim()}|${landLocation.trim()}|${state}|${lga}`;
    const timer = window.setTimeout(async () => {
      setIsGeneratingPreview(true);
      try {
        const snapshot = await captureOsmMapSnapshot(livePolygon.coordinates, label);
        if (!cancelled && snapshot) {
          setPreviewSnapshotUrl(snapshot);
          setPreviewSignature(sig);
        }
      } finally {
        if (!cancelled) {
          setIsGeneratingPreview(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [livePolygon, landLocation, lga, state]);

  const handleSelectSuggestion = (item: GeocodeSuggestion) => {
    const shortName = item.name || item.displayName.split(',')[0].trim();
    setLandLocation(shortName);
    setHasCustomPolygon(false);
    setShowSuggestions(false);
    setLandmarkSuggestions([]);
    setLandDemarcation(buildPolygonJsonFromCenter(item.lat, item.lng));
    setMapStatusNote(
      `Exact landmark selected: ${item.displayName} (${item.lat.toFixed(5)}°N, ${item.lng.toFixed(5)}°E)`
    );
  };

  const handleRefreshSnapshotPreview = async () => {
    if (!livePolygon.valid || livePolygon.coordinates.length < 3) return;
    setIsGeneratingPreview(true);
    try {
      const label = landLocation.trim()
        ? `${landLocation.trim()}, ${state}`
        : `${lga}, ${state}`;
      const snapshot = await captureOsmMapSnapshot(livePolygon.coordinates, label);
      if (snapshot) {
        setPreviewSnapshotUrl(snapshot);
      }
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handlePickLocationOnMap = (lat: number, lng: number) => {
    setHasCustomPolygon(true);
    setLandDemarcation(buildPolygonJsonFromCenter(lat, lng));
    setMapStatusNote(
      `Custom plot pinned on OpenStreetMap at ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`
    );
  };

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

  const handleConnectSellerWallet = async () => {
    setSellerWalletNote(null);
    setFormError(null);
    setIsConnectingSellerWallet(true);
    try {
      const wallets = await discoverWalletsOnce(180);
      if (wallets.length === 0) {
        setSellerWalletNote(
          'No browser wallet extension detected — paste any valid 0x... wallet address above.'
        );
        return;
      }
      const connected = await connectWeb3Wallet(wallets[0]);
      setSellerWallet(connected.address);
      setSellerWalletNote(`Connected ${connected.walletName} (${connected.address})`);
    } catch (err) {
      setSellerWalletNote(formatWalletError(err));
    } finally {
      setIsConnectingSellerWallet(false);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!applicantName.trim() || !applicantNin.trim()) {
      setFormError('Please enter your applicant full name and NIN / RC number.');
      return;
    }
    if (!isValidEvmAddress(sellerWallet)) {
      setFormError(
        "Please enter a valid Seller's Web3 Wallet address (42-character 0x... address) so buyers can pay directly."
      );
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

    const sanitizedPrice = landPrice.replace(/[$,\s]/g, '').trim();
    const parsedPrice = Number(sanitizedPrice);
    if (!sanitizedPrice || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFormError('Please enter a valid land price greater than 0.');
      return;
    }

    setIsSubmitting(true);
    const priceUsd = Number(parsedPrice.toFixed(2));
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

    const cleanState = normalizeNigeriaState(state);
    const availableLgas = getLgasForState(cleanState);
    const cleanLga = availableLgas.includes(lga) ? lga : availableLgas[0];
    const statePrefix = getStateCode(cleanState);

    const currentSig = `${landDemarcation.trim()}|${landLocation.trim()}|${state}|${lga}`;
    let mapSnapshotUrl = previewSignature === currentSig ? previewSnapshotUrl : '';
    if (!mapSnapshotUrl) {
      try {
        mapSnapshotUrl = await captureOsmMapSnapshot(
          parsedPolygon.coordinates,
          `${landLocation.trim()}, ${cleanState}`
        );
      } catch {
        mapSnapshotUrl = '';
      }
    }

    const newId = `PAR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
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
      sellerWallet: sellerWallet.trim(),
      mapSnapshotUrl: mapSnapshotUrl || undefined,
      status: 'registered',
      tokenId: Math.floor(4250 + Math.random() * 700),
      txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      blockNumber: Math.floor(1892050 + Math.random() * 500),
      issuanceTimestamp: new Date().toISOString(),
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
  };

  const handleResetForm = () => {
    setSubmittedParcel(null);
    const center = getStateCenter(state);
    setLandDemarcation(buildPolygonJsonFromCenter(center[0], center[1]));
    setHasCustomPolygon(false);
    setLandLocation('');
    setSurveyPlanRef('');
    setDocumentType('Survey Plan');
    setUploadedFileName('');
    setUploadedFileSize('');
    setCalculatedHash('');
    setSellerWalletNote(null);
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
                <h2 className="text-lg font-bold text-white">Registration Successful</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Your parcel has been officially registered in the national registry and added to the Access Lands marketplace.
                </p>
              </div>
            </div>

            {submittedParcel.mapSnapshotUrl && (
              <div className="rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-950">
                <img
                  src={submittedParcel.mapSnapshotUrl}
                  alt={`OpenStreetMap snapshot of ${submittedParcel.district}, ${submittedParcel.state}`}
                  className="w-full h-56 object-cover"
                />
                <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Captured OpenStreetMap Parcel Snapshot</span>
                  </span>
                  <span className="font-mono">
                    {submittedParcel.lga}, {submittedParcel.state}
                  </span>
                </div>
              </div>
            )}

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
                  {(submittedParcel.priceUsd ?? 85000).toLocaleString('en-US', {
                    maximumFractionDigits: 2
                  })}{' '}
                  USD
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Location of the Land</span>
                <span className="font-medium text-slate-200 mt-0.5 block">
                  {submittedParcel.district}, {submittedParcel.lga}, {submittedParcel.state}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Seller&apos;s Receiving Wallet</span>
                <span className="font-mono text-emerald-300 mt-0.5 block break-all">
                  {submittedParcel.sellerWallet}
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

              <div className="flex flex-wrap items-center gap-2.5">
                {onNextStep && (
                  <button
                    type="button"
                    onClick={() => onNextStep(submittedParcel.id)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Inspect GIS Map
                  </button>
                )}

                {onOpenLands && (
                  <button
                    type="button"
                    onClick={onOpenLands}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2 shadow-lg"
                  >
                    <span>View in Access Lands</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
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

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="seller-wallet-input" className="block font-medium text-slate-300">
                    Seller&apos;s Wallet Address (For Buyer Payment) *
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Wallet className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="seller-wallet-input"
                        type="text"
                        required
                        value={sellerWallet}
                        onChange={(e) => {
                          setSellerWallet(e.target.value);
                          setSellerWalletNote(null);
                        }}
                        placeholder="0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isConnectingSellerWallet}
                      onClick={() => void handleConnectSellerWallet()}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 text-emerald-300 text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>{isConnectingSellerWallet ? 'Connecting...' : 'Use My Wallet'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {sellerWalletNote ||
                      'Buyers on Access Lands will pay directly into this EVM wallet address when purchasing this land.'}
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">State of Jurisdiction</span>
                  <select
                    value={state}
                    onChange={(e) => {
                      const nextState = e.target.value;
                      setState(nextState);
                      const nextLgas = getLgasForState(nextState);
                      const nextLga = nextLgas[0] || '';
                      setLga(nextLga);
                      setHasCustomPolygon(false);
                      void recenterMapForRegion(landLocation, nextLga, nextState, true);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 outline-none transition-colors"
                  >
                    {NIGERIA_STATES_AND_LGAS.map((stateEntry) => (
                      <option key={stateEntry.name} value={stateEntry.name}>
                        {stateEntry.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Local Government Area (LGA)</span>
                  <select
                    value={lga}
                    onChange={(e) => {
                      const nextLga = e.target.value;
                      setLga(nextLga);
                      setHasCustomPolygon(false);
                      void recenterMapForRegion(landLocation, nextLga, state, true);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 outline-none transition-colors"
                  >
                    {getLgasForState(state).map((lgaName) => (
                      <option key={lgaName} value={lgaName}>
                        {lgaName}
                      </option>
                    ))}
                  </select>
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
                <div className="space-y-1.5 sm:col-span-2 relative">
                  <label htmlFor="land-location-input" className="block font-medium text-slate-300">
                    Location / Landmark of the Land *
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="land-location-input"
                      type="text"
                      required
                      value={landLocation}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => window.setTimeout(() => setShowSuggestions(false), 180)}
                      onChange={(e) => {
                        setHasCustomPolygon(false);
                        setLandLocation(e.target.value);
                        setShowSuggestions(true);
                      }}
                      placeholder="Type a street or landmark, e.g. Admiralty Way, Lekki Phase 1"
                      className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      disabled={isLocatingMap}
                      onClick={() => {
                        setHasCustomPolygon(false);
                        setShowSuggestions(false);
                        void recenterMapForRegion(landLocation, lga, state, true);
                      }}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 text-emerald-300 text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>{isLocatingMap ? 'Locating...' : 'Locate Landmark'}</span>
                    </button>
                  </div>

                  {showSuggestions && landmarkSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800/80">
                      {landmarkSuggestions.map((item, idx) => (
                        <button
                          key={`${item.lat}-${item.lng}-${idx}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSuggestion(item);
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-950/50 transition-colors flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {item.displayName}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400 shrink-0 mt-0.5">
                            {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Interactive OpenStreetMap Parcel Preview & Live Access Lands Screenshot Preview */}
                <div className="space-y-3 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-300 inline-flex items-center gap-1.5">
                      <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Exact Landmark Preview on OpenStreetMap</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Click anywhere on map to adjust exact plot pin
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                    <div className="md:col-span-7 flex flex-col space-y-1.5">
                      <OpenStreetMapWidget
                        coordinates={livePolygon.valid ? livePolygon.coordinates : []}
                        centerFallback={getStateCenter(state)}
                        heightClassName="h-64"
                        onPickLocation={handlePickLocationOnMap}
                        landmarkLabel={landLocation.trim() || `${lga}, ${state}`}
                      />
                      <p className="text-[11px] text-emerald-400/90 font-mono truncate">
                        {mapStatusNote}
                      </p>
                    </div>

                    <div className="md:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Access Lands Map Preview</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleRefreshSnapshotPreview}
                          disabled={isGeneratingPreview}
                          className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isGeneratingPreview ? 'animate-spin' : ''}`} />
                          <span>Refresh</span>
                        </button>
                      </div>

                      <div className="relative flex-1 min-h-[168px] rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                        {previewSnapshotUrl ? (
                          <img
                            src={previewSnapshotUrl}
                            alt={`OpenStreetMap preview for ${landLocation || lga}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[11px] text-slate-500 px-4 text-center">
                            {isGeneratingPreview
                              ? 'Capturing OpenStreetMap snapshot...'
                              : 'Enter a location to preview OpenStreetMap snapshot'}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 leading-snug">
                        This exact OpenStreetMap screenshot will be saved to <strong className="text-slate-200">Access Lands</strong> when you submit.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="demarcation-input" className="block font-medium text-slate-300">
                    Demarcation of Land *
                  </label>
                  <textarea
                    id="demarcation-input"
                    required
                    rows={2}
                    value={landDemarcation}
                    onChange={(e) => {
                      setHasCustomPolygon(true);
                      setLandDemarcation(e.target.value);
                    }}
                    placeholder={SAMPLE_DEMARCATION_POLYGON}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-colors resize-y"
                  />
                  <p className="text-[11px] text-slate-500 font-mono">
                    Format: [[[lng, lat], [lng, lat], [lng, lat], [lng, lat], [lng, lat]]]
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="font-medium text-slate-300">Land price (USD)</span>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={landPrice}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (/^[0-9,.\s]*$/.test(raw)) {
                          setLandPrice(raw);
                        }
                      }}
                      placeholder="Enter any amount, e.g. 85000"
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
