import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Compass,
  Users,
  Building2,
  Printer,
  ChevronDown,
  Lock,
  FilePlus2
} from 'lucide-react';
import { AccessRoleId, AuthMode, AuthUser, ParcelRecord, PortalStepId } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  currentUser?: AuthUser | null;
  onOpenPrototype: () => void;
  onOpenCanvas: () => void;
  onOpenPortal?: (step: PortalStepId, parcelId?: string) => void;
  onOpenAuth?: (mode: AuthMode, role?: AccessRoleId) => void;
  onOpenLands?: () => void;
}

export const ScreenLandingPage: React.FC<Props> = ({
  parcels,
  currentUser,
  onOpenPrototype,
  onOpenCanvas,
  onOpenPortal,
  onOpenAuth,
  onOpenLands
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [showCertModal, setShowCertModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const featuredParcel: ParcelRecord | null = parcels[0] || null;

  const handleOpenStep = (step: PortalStepId, parcelId?: string) => {
    if (!currentUser && onOpenAuth) {
      onOpenAuth('login', step);
      return;
    }
    if (onOpenPortal) {
      onOpenPortal(step, parcelId);
    } else {
      onOpenPrototype();
    }
  };

  const faqs = [
    {
      q: 'Can someone secretly sell or claim my land while I am away?',
      a: 'No. Every parcel in Anagu is digitally locked to its exact satellite GPS coordinates. The system immediately blocks anyone trying to register over your boundary, even by a single centimeter.'
    },
    {
      q: 'Is this certificate accepted by Nigerian banks and courts?',
      a: 'Yes. Certificates of Occupancy (C of O) are issued under the Nigerian Land Use Act (1978). Banks can scan the encrypted QR code on your certificate to confirm ownership instantly for mortgage or business loan applications.'
    },
    {
      q: 'What if my family inherited community land without old paperwork?',
      a: 'Anagu recognizes customary ancestral tenure under Section 36 of the Land Use Act. Our Community Oracle portal enables traditional council elders and village heads to attest to your family lineage and ancestral boundary marks.'
    },
    {
      q: 'How does it work in rural areas with poor internet connection?',
      a: 'Licensed field surveyors use mobile tools that work offline. They can map your boundary pillars in the field, and the data syncs securely once they return to network coverage.'
    },
    {
      q: 'How long does title verification and registration take?',
      a: 'Instead of waiting 6 to 18 months in government registry queues, automated boundary checks take seconds, and complete digital grant issuance takes only days.'
    }
  ];

  return (
    <div className="w-full min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. CLEAN TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-12 h-16 sm:h-18 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 group text-left"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-md shrink-0 group-hover:scale-105 transition-transform duration-200">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <span className="text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
            Anagu
          </span>
        </button>

        {currentUser ? (
          <button
            type="button"
            onClick={() => (onOpenLands ? onOpenLands() : handleOpenStep(currentUser.role))}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Access Lands</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (onOpenAuth ? onOpenAuth('login', 'citizen') : handleOpenStep('citizen'))}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* 2. HERO: CLEAR SOVEREIGN LANDING PROMISE */}
      <section className="relative pt-10 sm:pt-14 pb-14 sm:pb-20 px-4 sm:px-6 lg:px-12 border-b border-slate-800/80 overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 items-center">
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Federal Republic of Nigeria · Land Use Act (1978)</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.12] text-balance">
              Sovereign Land Title Verification &amp; Role-Based Registry Access
            </h1>

            <p className="text-sm sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Anagu unifies public title searches, citizen land filings, satellite GIS boundary checks, and traditional council attestations in one tamper-proof national registry.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => (onOpenLands ? onOpenLands() : handleOpenStep(currentUser ? currentUser.role : 'citizen'))}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Access Lands</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleOpenStep('citizen')}
                className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-100 font-semibold text-sm rounded-xl border border-slate-700 hover:border-emerald-500/60 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <FilePlus2 className="w-4 h-4 text-emerald-400" />
                <span>Register Lands</span>
              </button>
            </div>

            <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300 border-t border-slate-800/70">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero Double Selling</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Elders &amp; Survey Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Bank &amp; Court Recognized</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl relative bg-gradient-to-br from-slate-900 via-emerald-950/35 to-slate-950 h-[380px]">
              {!failedImages.hero && (
                <img
                  src={ASSET_IMAGES.heroArchitecture}
                  alt="Anagu Land Registry Headquarters"
                  referrerPolicy="no-referrer"
                  onError={() => setFailedImages((prev) => ({ ...prev, hero: true }))}
                  className="w-full h-full object-cover object-center"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Verified Registry Record · Certificate #4092
                  </div>
                  <div className="text-base font-bold text-white">
                    Katampe Extension, Abuja
                  </div>
                  <div className="text-xs text-slate-300">
                    1,845 m² Residential · Zero Spatial Overlap
                  </div>
                </div>
                {featuredParcel && (
                  <button
                    type="button"
                    onClick={() => setShowCertModal(true)}
                    className="px-3.5 py-2 bg-slate-950/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-slate-700 hover:border-emerald-500 transition-colors whitespace-nowrap shrink-0"
                  >
                    Inspect Record
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. STATUTORY PROTECTIONS */}
      <section id="protection" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
              Statutory Safeguards
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              How Anagu Prevents the 4 Biggest Land Disputes
            </h2>
            <p className="text-sm text-slate-400">
              Every access portal enforces strict legal and technical rules so buyers, landowners, surveyors, and communities stay protected.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">No Fake Stamped Papers</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Fraudsters cannot forge paper deeds when every title carries a cryptographic spatial hash verified directly against the state registry.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center">
                <Compass className="w-4 h-4 text-sky-400" />
              </div>
              <h3 className="text-lg font-bold text-white">No Boundary Overlaps</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Surveyor GIS clearance tests every new beacon coordinate against registered neighbor boundaries before any approval can advance.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Family &amp; Elder Quorum Required</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Ancestral land cannot be quietly transferred by a single individual. The Community Oracle enforces multi-elder council attestation first.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Instant Bank Due Diligence</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Mortgage lenders and legal teams confirm statutory validity and collateral status directly from verified registry deeds in seconds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FREQUENTLY ASKED QUESTIONS */}
      <section id="faq" className="py-20 px-6 lg:px-12 border-b border-slate-800/80">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
              Clear Answers
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-400">
              Everything you need to know about registry access and protecting your property.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full p-5 text-left flex items-center justify-between text-sm sm:text-base font-bold text-white hover:text-emerald-400 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-4 ${
                        isOpen ? 'rotate-180 text-emerald-400' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="bg-[#05080e] text-slate-400 py-12 px-6 lg:px-12 border-t border-slate-800 text-xs mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-md shrink-0">
              <img
                src={ASSET_IMAGES.logoAvatar}
                alt="Anagu Emblem Avatar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-full bg-slate-900"
              />
            </div>
            <div>
              <span className="font-bold text-white text-sm block">Anagu Land Administration</span>
              <span className="text-[11px] text-slate-500 block">
                Land Use Act (1978) &amp; Survey Act Standards
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-slate-400">
            <a href="#protection" className="hover:text-white transition-colors whitespace-nowrap">
              Protections
            </a>
            <a href="#faq" className="hover:text-white transition-colors whitespace-nowrap">
              FAQ
            </a>
            <button
              type="button"
              onClick={onOpenPrototype}
              className="hover:text-emerald-400 transition-colors whitespace-nowrap"
            >
              Interactive Workflow
            </button>
            <button
              type="button"
              onClick={onOpenCanvas}
              className="hover:text-slate-300 transition-colors whitespace-nowrap"
            >
              Architecture Canvas
            </button>
          </div>

          <div className="text-slate-500 text-[11px]">
            &copy; 2026 Anagu. All statutory protections reserved.
          </div>
        </div>
      </footer>

      {/* OFFICIAL CERTIFICATE OF OCCUPANCY MODAL */}
      {showCertModal && featuredParcel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-amber-50 text-slate-900 rounded-2xl max-w-2xl w-full p-8 border-4 border-amber-200 shadow-2xl relative overflow-hidden animate-in fade-in duration-150">
            <div className="text-center pb-6 border-b-2 border-amber-200">
              <div className="text-xs uppercase tracking-widest text-amber-900 font-bold">
                Federal Republic of Nigeria
              </div>
              <h2 className="text-xl font-serif font-bold text-slate-900 mt-1">
                CERTIFICATE OF OCCUPANCY (DIGITAL TITLE DEED)
              </h2>
              <div className="text-xs font-mono text-amber-800 mt-1">
                Issued pursuant to Land Use Act (1978) · Title Ref #{featuredParcel.cadastralRef}
              </div>
            </div>

            <div className="py-6 space-y-4 text-xs">
              <p className="leading-relaxed text-slate-800">
                THIS IS TO CERTIFY that{' '}
                <strong className="font-bold text-slate-950 uppercase">
                  {featuredParcel.applicantName}
                </strong>{' '}
                ({featuredParcel.applicantNin}) is the registered statutory titleholder of that parcel of land situated at{' '}
                <strong className="font-semibold">
                  {featuredParcel.district}, {featuredParcel.state}
                </strong>{' '}
                containing an area of approximately{' '}
                <strong className="font-bold text-slate-900">
                  {featuredParcel.areaSqm.toLocaleString()} square meters
                </strong>
                .
              </p>

              <div className="bg-white/80 p-4 rounded-xl border border-amber-200/80 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Cadastral Ref:</span>
                  <div className="font-bold text-slate-900">{featuredParcel.cadastralRef}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Survey Plan Lodgement:</span>
                  <div className="font-bold text-slate-900">{featuredParcel.surveyPlanRef}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Digital Verification Hash:</span>
                  <div className="font-mono font-bold text-emerald-800 truncate">
                    {featuredParcel.spatialHash}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={ASSET_IMAGES.titleSeal}
                  alt="Official Seal"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Registrar of Deeds Seal</div>
                  <div className="text-[10px] text-slate-500">Government Verified Signature</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Deed</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCertModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
