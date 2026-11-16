import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Home,
  FilePlus2,
  Search,
  Printer,
  CheckCircle2,
  X,
  Building2,
  Layers,
  BadgeCheck,
  ArrowRight,
  Landmark
} from 'lucide-react';
import { AuthUser, ParcelRecord, VerifiedLandListing } from '../../types/anagu';
import { getLandmarkImageForParcel, VERIFIED_LANDS_FOR_SALE } from '../../data/verifiedLands';
import { ASSET_IMAGES } from '../../data/mockData';
import { apiCreateInquiry } from '../../lib/api';

interface Props {
  parcels: ParcelRecord[];
  currentUser?: AuthUser | null;
  onBackToLanding: () => void;
  onOpenRegister: () => void;
}

const USE_FILTERS: Array<'All' | ParcelRecord['intendedUse']> = [
  'All',
  'Residential',
  'Commercial',
  'Industrial',
  'Agricultural'
];

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function formatUsd(amount: number): string {
  return usdFormatter.format(amount);
}

function formatPlots(areaSqm: number): string {
  const plots = areaSqm / 650;
  return `${plots.toFixed(1)} ${plots >= 1.5 ? 'plots' : 'plot'}`;
}

export const ScreenVerifiedLands: React.FC<Props> = ({
  parcels,
  currentUser,
  onBackToLanding,
  onOpenRegister
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUse, setSelectedUse] = useState<'All' | ParcelRecord['intendedUse']>('All');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [deedListing, setDeedListing] = useState<VerifiedLandListing | null>(null);
  const [buyListing, setBuyListing] = useState<VerifiedLandListing | null>(null);

  const [buyerName, setBuyerName] = useState(currentUser?.fullName || '');
  const [buyerPhone, setBuyerPhone] = useState(currentUser?.phone || '');
  const [buyerEmail, setBuyerEmail] = useState(currentUser?.email || '');
  const [offerNotes, setOfferNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const allListings = useMemo<VerifiedLandListing[]>(() => {
    const existingRefs = new Set(VERIFIED_LANDS_FOR_SALE.map((item) => item.cadastralRef));
    const newlyRegistered: VerifiedLandListing[] = parcels
      .filter((p) => p.status === 'registered' && !existingRefs.has(p.cadastralRef))
      .map((p, idx) => ({
        id: p.id,
        cadastralRef: p.cadastralRef,
        title: p.district || `${p.lga} Land Parcel`,
        district: p.district,
        state: p.state,
        lga: p.lga,
        areaSqm: p.areaSqm,
        priceUsd: p.priceUsd && p.priceUsd > 0 ? p.priceUsd : Math.round(p.areaSqm * 45),
        intendedUse: p.intendedUse,
        sellerName: p.applicantName,
        surveyPlanRef: p.surveyPlanRef,
        spatialHash: p.spatialHash,
        tokenId: p.tokenId || 4300 + idx,
        verificationBadge: 'Registered & Verified',
        landmark: `${p.district}, ${p.state}`,
        imageUrl: getLandmarkImageForParcel(p.state, p.intendedUse)
      }));
    return [...newlyRegistered, ...VERIFIED_LANDS_FOR_SALE];
  }, [parcels]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allListings.filter((item) => {
      const matchesUse = selectedUse === 'All' || item.intendedUse === selectedUse;
      if (!matchesUse) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q) ||
        item.landmark.toLowerCase().includes(q) ||
        item.cadastralRef.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q)
      );
    });
  }, [allListings, searchQuery, selectedUse]);

  const openBuyModal = (listing: VerifiedLandListing) => {
    setBuyListing(listing);
    setBuyerName(currentUser?.fullName || '');
    setBuyerPhone(currentUser?.phone || '');
    setBuyerEmail(currentUser?.email || '');
    setOfferNotes(
      `Purchase reservation for verified parcel ${listing.cadastralRef} (${formatUsd(listing.priceUsd)} USD).`
    );
    setSubmitError(null);
    setSubmittedRef(null);
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyListing) return;
    if (!buyerName.trim() || !buyerPhone.trim()) {
      setSubmitError('Please enter your full name and phone number.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await apiCreateInquiry({
        name: buyerName.trim(),
        phone: buyerPhone.trim(),
        email: buyerEmail.trim() || undefined,
        state: buyListing.state,
        message: `[LAND PURCHASE] Parcel: ${buyListing.title} (${buyListing.cadastralRef}) | Listed Price: ${formatUsd(
          buyListing.priceUsd
        )} USD | Seller: ${buyListing.sellerName} | Buyer Notes: ${offerNotes.trim() || 'Ready for title verification & escrow.'}`
      });
      setSubmittedRef(buyListing.cadastralRef);
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to submit purchase request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800 px-6 lg:px-10 h-16 flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={onBackToLanding}
          className="flex items-center gap-3 text-left group shrink-0"
        >
          <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-sm">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <div>
            <div className="text-base font-bold text-white leading-none group-hover:text-emerald-300 transition-colors whitespace-nowrap">
              Anagu Land Marketplace
            </div>
            <div className="text-[11px] text-emerald-400 mt-0.5 whitespace-nowrap">
              Verified Title Deeds Available for Purchase
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenRegister}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Register Lands</span>
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500/60 text-xs font-medium text-slate-200 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
          >
            <Home className="w-3.5 h-3.5 text-emerald-400" />
            <span>Home</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 space-y-6">
        {/* Heading & Responsive Filter Controls */}
        <div className="space-y-5 border-b border-slate-800/80 pb-6">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
              Available Verified Lands to Buy
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Every verified listing includes landmark photography, cleared satellite boundary coordinates, and USD acquisition pricing.
            </p>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
            <div className="relative w-full md:w-72 lg:w-80 shrink-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search landmark, state, or ref..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl w-full md:w-auto">
              {USE_FILTERS.map((use) => {
                const active = selectedUse === use;
                return (
                  <button
                    key={use}
                    type="button"
                    onClick={() => setSelectedUse(use)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex-1 sm:flex-initial text-center ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {use}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3 Columns x 3 Rows Grid */}
        {filteredListings.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-white">No verified lands match your filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedUse('All');
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Show All Verified Lands
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map((listing) => (
              <article
                key={listing.id}
                className="bg-slate-900/95 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-lg group"
              >
                {/* Top Section: Landmark Photo + Listing Info */}
                <div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-800 via-emerald-950/40 to-slate-950">
                    {!failedImages[listing.id] ? (
                      <img
                        src={listing.imageUrl}
                        alt={`${listing.title} showing ${listing.landmark}`}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImages((prev) => ({ ...prev, [listing.id]: true }))}
                        className="w-full h-full object-cover object-center group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center gap-2">
                        <Landmark className="w-8 h-8 text-emerald-400" />
                        <span className="text-xs font-semibold text-slate-200">{listing.landmark}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-300 truncate">
                          <Landmark className="w-3 h-3 shrink-0" />
                          <span className="truncate">{listing.landmark}</span>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-white bg-slate-950/85 px-2.5 py-1 rounded-lg border border-slate-700/80 tabular-nums shrink-0">
                        {formatUsd(listing.priceUsd)}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    {/* Clean Unboxed Metadata */}
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                        <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>{listing.verificationBadge}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{listing.intendedUse}</span>
                    </div>

                    {/* Title & Location */}
                    <div>
                      <h2 className="text-sm font-bold text-white leading-snug line-clamp-1">
                        {listing.title}
                      </h2>
                      <div className="flex items-start gap-1.5 mt-1 text-xs text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">
                          {listing.district}, {listing.state}
                        </span>
                      </div>
                    </div>

                    {/* Specs Row */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Size</span>
                        <span className="font-semibold text-slate-200 tabular-nums">
                          {listing.areaSqm.toLocaleString()} m² ({formatPlots(listing.areaSqm)})
                        </span>
                      </div>
                      <div className="text-right min-w-0">
                        <span className="text-slate-500 block">Title Ref</span>
                        <span
                          className="font-mono font-semibold text-slate-300 block truncate max-w-[130px]"
                          title={listing.cadastralRef}
                        >
                          {listing.cadastralRef}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate" title={listing.sellerName}>
                        Seller: <strong className="text-slate-300 font-medium">{listing.sellerName}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeedListing(listing)}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openBuyModal(listing)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Buy Land</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* VERIFIED CERTIFICATE OF OCCUPANCY MODAL */}
      {deedListing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-4">
          <div className="bg-amber-50 text-slate-900 rounded-2xl max-w-2xl w-full p-6 sm:p-8 border-4 border-amber-200 shadow-2xl relative max-h-[92vh] overflow-y-auto my-auto">
            <div className="text-center pb-5 border-b-2 border-amber-200">
              <div className="text-xs uppercase tracking-widest text-amber-900 font-bold">
                Federal Republic of Nigeria
              </div>
              <h2 className="text-xl font-serif font-bold text-slate-900 mt-1">
                CERTIFICATE OF OCCUPANCY (VERIFIED FOR TRANSFER)
              </h2>
              <div className="text-xs font-mono text-amber-800 mt-1">
                Issued pursuant to Land Use Act (1978) · Title Ref #{deedListing.cadastralRef}
              </div>
            </div>

            <div className="py-5 space-y-4 text-xs">
              <div className="w-full h-44 rounded-xl overflow-hidden border border-amber-200">
                <img
                  src={deedListing.imageUrl}
                  alt={`${deedListing.title} showing ${deedListing.landmark}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center"
                />
              </div>

              <p className="leading-relaxed text-slate-800">
                THIS IS TO CERTIFY that{' '}
                <strong className="font-bold text-slate-950 uppercase">{deedListing.sellerName}</strong>{' '}
                holds an unencumbered statutory Certificate of Occupancy over{' '}
                <strong className="font-semibold">{deedListing.title}</strong> ({deedListing.landmark}) situated at{' '}
                <strong className="font-semibold">
                  {deedListing.district}, {deedListing.lga}, {deedListing.state}
                </strong>{' '}
                measuring{' '}
                <strong className="font-bold text-slate-900">
                  {deedListing.areaSqm.toLocaleString()} square meters
                </strong>{' '}
                at a verified asking price of{' '}
                <strong className="font-bold text-emerald-800 tabular-nums">
                  {formatUsd(deedListing.priceUsd)} USD
                </strong>
                .
              </p>

              <div className="bg-white/80 p-4 rounded-xl border border-amber-200/80 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Cadastral Ref:</span>
                  <div className="font-bold text-slate-900">{deedListing.cadastralRef}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Survey Plan Lodgement:</span>
                  <div className="font-bold text-slate-900">{deedListing.surveyPlanRef}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Approved Land Use:</span>
                  <div className="font-bold text-slate-900">{deedListing.intendedUse}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Registry Token ID:</span>
                  <div className="font-bold text-slate-900">#{deedListing.tokenId}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Digital Verification Hash:</span>
                  <div className="font-mono font-bold text-emerald-800 truncate">
                    {deedListing.spatialHash}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={ASSET_IMAGES.titleSeal}
                  alt="Official Seal"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Registrar of Deeds Seal</div>
                  <div className="text-[10px] text-slate-500">Zero Encumbrance · Ready for Transfer</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = deedListing;
                    setDeedListing(null);
                    openBuyModal(target);
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg"
                >
                  Proceed to Buy
                </button>
                <button
                  type="button"
                  onClick={() => setDeedListing(null)}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUY / RESERVE LAND MODAL (PERSISTED TO SUPABASE) */}
      {buyListing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-4">
          <div className="bg-slate-900 text-slate-100 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl max-h-[92vh] overflow-y-auto my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Reserve &amp; Purchase Verified Land</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {buyListing.title} · {buyListing.cadastralRef}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuyListing(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close purchase modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submittedRef ? (
              <div className="p-6 space-y-4">
                <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-white">
                      Purchase Reservation Recorded
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your verified acquisition request for <strong className="text-white">{submittedRef}</strong> ({formatUsd(buyListing.priceUsd)} USD) has been lodged with the Anagu Escrow &amp; Title Transfer Desk.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBuyListing(null)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitPurchase} className="p-6 space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3.5">
                  <img
                    src={buyListing.imageUrl}
                    alt={buyListing.landmark}
                    referrerPolicy="no-referrer"
                    className="w-16 h-12 object-cover rounded-lg shrink-0 border border-slate-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-400 truncate">
                      {buyListing.areaSqm.toLocaleString()} m² · {buyListing.landmark}
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
                      Titleholder: {buyListing.sellerName}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Price (USD)</div>
                    <div className="text-base font-extrabold text-emerald-400 tabular-nums">
                      {formatUsd(buyListing.priceUsd)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Buyer Full Name *</span>
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="e.g. Alhaji Ibrahim Musa"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Phone / WhatsApp *</span>
                    <input
                      type="tel"
                      required
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="+234 803 123 4567"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Email Address (Optional)</span>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="buyer@example.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Offer / Escrow Notes</span>
                  <textarea
                    rows={3}
                    value={offerNotes}
                    onChange={(e) => setOfferNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none resize-none"
                  />
                </label>

                {submitError && (
                  <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 rounded-xl px-3 py-2">
                    {submitError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBuyListing(null)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Purchase Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
