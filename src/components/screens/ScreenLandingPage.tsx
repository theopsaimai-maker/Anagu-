import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Search,
  FileText,
  Compass,
  Users,
  Building2,
  Check,
  Printer,
  MapPin,
  ChevronDown,
  AlertCircle,
  Lock
} from 'lucide-react';
import { AccessRoleId, AuthMode, AuthUser, ParcelRecord, PortalStepId } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';
import { apiCreateInquiry } from '../../lib/api';

interface Props {
  parcels: ParcelRecord[];
  currentUser?: AuthUser | null;
  onOpenPrototype: () => void;
  onOpenCanvas: () => void;
  onOpenPortal?: (step: PortalStepId, parcelId?: string) => void;
  onOpenAuth?: (mode: AuthMode, role?: AccessRoleId) => void;
}

type AccessCategoryId = 'all' | 'public' | 'citizen' | 'surveyor' | 'oracle';

interface AccessPathItem {
  id: Exclude<AccessCategoryId, 'all'>;
  number: string;
  categoryLabel: string;
  title: string;
  audience: string;
  accessScope: string;
  description: string;
  capabilities: string[];
  ctaLabel: string;
  image: string;
  imageAlt: string;
  accentText: string;
  accentBorder: string;
  accentButton: string;
  icon: React.ComponentType<{ className?: string }>;
  actionType: 'scroll-verify' | PortalStepId;
}

export const ScreenLandingPage: React.FC<Props> = ({
  parcels,
  currentUser,
  onOpenPrototype,
  onOpenCanvas,
  onOpenPortal,
  onOpenAuth
}) => {
  const [activeAccessFilter, setActiveAccessFilter] = useState<AccessCategoryId>('all');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedParcel, setSearchedParcel] = useState<ParcelRecord | null>(parcels[0] || null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    state: 'Federal Capital Territory (Abuja)',
    message: ''
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

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

  const scrollToVerification = () => {
    const el = document.getElementById('check-title');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 350);
  };

  const accessPaths: AccessPathItem[] = [
    {
      id: 'public',
      number: '01',
      categoryLabel: 'Public & Buyers',
      title: 'Public Title Registry',
      audience: 'Property buyers, commercial banks, mortgage officers, and legal counsel',
      accessScope: 'Open Read-Only Access — No Account Required',
      description:
        'Verify any land parcel before paying a deposit. Confirm ownership, inspect official cadastral status, and check for encumbrances or revocations in seconds.',
      capabilities: [
        'Search live records by cadastral reference or owner name',
        'Verify zero double-selling or statutory revocation flags',
        'Print QR-indexed Certificate of Occupancy deed previews'
      ],
      ctaLabel: 'Search Public Registry',
      image: ASSET_IMAGES.governorDesk,
      imageAlt: 'Statutory title deed verification desk',
      accentText: 'text-emerald-400',
      accentBorder: 'border-emerald-500/35 hover:border-emerald-400/70',
      accentButton: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      icon: Search,
      actionType: 'scroll-verify'
    },
    {
      id: 'citizen',
      number: '02',
      categoryLabel: 'Citizens & Landowners',
      title: 'Citizen Application Portal',
      audience: 'Private landowners, family estates, and residential or commercial developers',
      accessScope: 'Applicant Portal — NIN-Linked Filing',
      description:
        'Register new land parcels, submit surveyed boundary beacons, monitor multi-stage statutory clearance, and receive your tamper-proof digital Certificate of Occupancy.',
      capabilities: [
        'Lodge parcel beacon coordinates and survey plan numbers',
        'Track real-time approval status from draft to final grant',
        'Access and print your verified digital title deed anytime'
      ],
      ctaLabel: 'Open Citizen Portal',
      image: ASSET_IMAGES.bentoGovernance,
      imageAlt: 'Citizen land ownership and digital deed access',
      accentText: 'text-emerald-300',
      accentBorder: 'border-slate-800 hover:border-emerald-500/60',
      accentButton: 'bg-slate-800 hover:bg-emerald-600 text-white border border-slate-700 hover:border-emerald-500',
      icon: FileText,
      actionType: 'citizen'
    },
    {
      id: 'surveyor',
      number: '03',
      categoryLabel: 'Surveyors & GIS',
      title: 'Surveyor GIS Map',
      audience: 'NIS-licensed surveyors, state Surveyor General offices, and GIS analysts',
      accessScope: 'Technical Spatial Access — Coordinate Clearance',
      description:
        'Inspect boundary polygons over high-resolution cadastral overlays, detect centimeter-level boundary overlaps, and issue spatial clearance certificates.',
      capabilities: [
        'Plot and inspect pillar coordinates on interactive cadastral maps',
        'Run automated encroachment and overlap collision checks',
        'Sign off spatial verification to unlock elder council review'
      ],
      ctaLabel: 'Open Surveyor GIS Map',
      image: ASSET_IMAGES.bentoCadastre,
      imageAlt: 'Satellite cadastral GIS boundary map',
      accentText: 'text-sky-400',
      accentBorder: 'border-slate-800 hover:border-sky-500/60',
      accentButton: 'bg-slate-800 hover:bg-sky-600 text-white border border-slate-700 hover:border-sky-500',
      icon: Compass,
      actionType: 'surveyor'
    },
    {
      id: 'oracle',
      number: '04',
      categoryLabel: 'Traditional Council',
      title: 'Community Oracle',
      audience: 'Recognized village heads, traditional rulers, and family land trustees',
      accessScope: 'Customary Quorum Access — Section 36 LUA',
      description:
        'Protect ancestral and community land from unauthorized secret sales. Elders review lineage evidence and cast multi-signatory quorum attestations.',
      capabilities: [
        'Audit customary family lineage and boundary witness notes',
        'Require multi-elder quorum consent before title issuance',
        'Escalate disputed claims before any deed can be minted'
      ],
      ctaLabel: 'Open Community Oracle',
      image: ASSET_IMAGES.oracleElders,
      imageAlt: 'Traditional community council elders attestation',
      accentText: 'text-amber-400',
      accentBorder: 'border-slate-800 hover:border-amber-500/60',
      accentButton: 'bg-slate-800 hover:bg-amber-600 text-white border border-slate-700 hover:border-amber-500',
      icon: Users,
      actionType: 'oracle'
    }
  ];

  const accessTabs: { id: AccessCategoryId; label: string }[] = [
    { id: 'all', label: 'All Access Categories' },
    { id: 'public', label: 'Public & Buyers' },
    { id: 'citizen', label: 'Citizens & Landowners' },
    { id: 'surveyor', label: 'Surveyors & GIS' },
    { id: 'oracle', label: 'Traditional Council' }
  ];

  const visibleAccessPaths =
    activeAccessFilter === 'all'
      ? accessPaths
      : accessPaths.filter((item) => item.id === activeAccessFilter);

  const getStatusMeta = (status: ParcelRecord['status']) => {
    switch (status) {
      case 'registered':
        return {
          label: 'Officially Registered & Protected',
          badgeClass: 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80',
          note: 'This property has been legally stamped by the Surveyor General and attested by the Traditional Council of Elders. It cannot be duplicated or sold twice.'
        };
      case 'oracle_verified':
        return {
          label: 'Community Elders Attested (Ready for Grant)',
          badgeClass: 'text-amber-300 bg-amber-950/80 border-amber-700/80',
          note: 'Spatial boundaries and customary family lineage have both passed verification. Awaiting final Registrar certificate minting.'
        };
      case 'spatial_verified':
        return {
          label: 'Surveyor GIS Verified (Pending Elders)',
          badgeClass: 'text-sky-300 bg-sky-950/80 border-sky-700/80',
          note: 'PostGIS boundary overlap check passed with zero encroachment. Currently queued for Community Oracle elder verification.'
        };
      case 'revoked':
        return {
          label: 'Statutorily Revoked (LUA Section 28)',
          badgeClass: 'text-red-400 bg-red-950/80 border-red-700/80',
          note: 'This statutory right of occupancy has been formally revoked by Executive Gazette Notice. Do not transact on this title without Ministry clearance.'
        };
      default:
        return {
          label: 'Application Submitted (Awaiting GIS Survey)',
          badgeClass: 'text-slate-300 bg-slate-800 border-slate-700',
          note: 'Parcel beacons have been lodged in the Citizen Portal and are queued for Surveyor General boundary overlap inspection.'
        };
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setTimeout(() => {
      const q = searchQuery.toLowerCase().trim();
      const match = parcels.find(
        (p) =>
          p.cadastralRef.toLowerCase().includes(q) ||
          p.applicantName.toLowerCase().includes(q) ||
          p.district.toLowerCase().includes(q) ||
          p.state.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
      );
      if (match) {
        setSearchedParcel(match);
        setSearchNotFound(false);
      } else {
        setSearchNotFound(true);
      }
      setIsSearching(false);
    }, 300);
  };

  const handleSelectSample = (parcel: ParcelRecord) => {
    setSearchQuery(parcel.cadastralRef);
    setSearchedParcel(parcel);
    setSearchNotFound(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.phone) return;
    setFormSubmitted(true);
    try {
      await apiCreateInquiry({
        name: contactForm.name,
        phone: contactForm.phone,
        email: contactForm.email || undefined,
        state: contactForm.state,
        message: contactForm.message || undefined
      });
    } catch {
      // Keep confirmation state cleanly even if offline
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

  const handleAccessAction = (actionType: AccessPathItem['actionType']) => {
    if (actionType === 'scroll-verify') {
      scrollToVerification();
    } else {
      handleOpenStep(actionType);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. CLEAN 3-ZONE TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800/80 px-6 lg:px-12 h-18 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3 cursor-pointer shrink-0 group text-left"
        >
          <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-md shrink-0 group-hover:scale-105 transition-transform duration-200">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <span className="text-xl font-bold tracking-tight text-white whitespace-nowrap">
            Anagu
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a href="#access-portals" className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            Access Portals
          </a>
          <a href="#check-title" className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            Verify Title
          </a>
          <a href="#protection" className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            Protections
          </a>
          <a href="#faq" className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            FAQ
          </a>
          <a href="#contact" className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0">
            Contact
          </a>
        </nav>

        {currentUser ? (
          <button
            type="button"
            onClick={() => handleOpenStep(currentUser.role)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Open My Portal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (onOpenAuth ? onOpenAuth('login', 'citizen') : handleOpenStep('citizen'))}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* 2. HERO: CLEAR SOVEREIGN LANDING PROMISE */}
      <section className="relative pt-14 pb-20 px-6 lg:px-12 border-b border-slate-800/80 overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Federal Republic of Nigeria · Land Use Act (1978)</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.12] text-balance">
              Sovereign Land Title Verification &amp; Role-Based Registry Access
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Anagu unifies public title searches, citizen land filings, satellite GIS boundary checks, and traditional council attestations in one tamper-proof national registry. Select your access category below to begin.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#access-portals"
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition-all inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span>Explore Access Portals</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={scrollToVerification}
                className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-100 font-semibold text-sm rounded-xl border border-slate-700 hover:border-emerald-500/60 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Search className="w-4 h-4 text-emerald-400" />
                <span>Verify a Land Title</span>
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
                <button
                  type="button"
                  onClick={scrollToVerification}
                  className="px-3.5 py-2 bg-slate-950/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-slate-700 hover:border-emerald-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Inspect Record
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CATEGORIZED ACCESS PORTALS: CLEAR ENTRY BY ROLE */}
      <section id="access-portals" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
                Categorized Registry Access
              </span>
              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                Select Your Portal by Access Category
              </h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                Every visitor accesses Anagu according to their role in the land lifecycle. Filter by category below to see what each access path authorizes and enter the right workspace directly.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenPrototype}
              className="self-start lg:self-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open Full 4-Step Workflow</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Access Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/90 pb-5" role="tablist" aria-label="Access categories">
            {accessTabs.map((tab) => {
              const isSelected = activeAccessFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveAccessFilter(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Categorized Access Cards */}
          <div
            className={`grid gap-6 ${
              visibleAccessPaths.length === 1
                ? 'grid-cols-1 max-w-3xl'
                : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {visibleAccessPaths.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.id}
                  className={`bg-slate-900 rounded-2xl border ${item.accentBorder} overflow-hidden flex flex-col justify-between transition-colors shadow-lg`}
                >
                  <div>
                    {/* Visual Header Band */}
                    <div className="relative h-44 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 overflow-hidden">
                      {!failedImages[item.id] && (
                        <img
                          src={item.image}
                          alt={item.imageAlt}
                          referrerPolicy="no-referrer"
                          onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                          className="w-full h-full object-cover object-center opacity-85"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/55 to-transparent" />
                      <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold tracking-wide text-slate-200 flex items-center gap-2">
                          <span className={`font-mono font-bold ${item.accentText}`}>{item.number}</span>
                          <span className="text-slate-500">/</span>
                          <span>{item.categoryLabel}</span>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-slate-950/85 border border-slate-700/80 flex items-center justify-center shrink-0">
                          <Icon className={`w-4 h-4 ${item.accentText}`} />
                        </div>
                      </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-6 space-y-5">
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">
                          {item.title}
                        </h3>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      {/* Eligibility & Access Scope Metadata */}
                      <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500 font-medium block uppercase tracking-wider text-[10px]">
                            Who This Access Is For
                          </span>
                          <span className="text-slate-200 font-medium block mt-1 leading-snug">
                            {item.audience}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block uppercase tracking-wider text-[10px]">
                            Authorization Scope
                          </span>
                          <span className={`font-semibold block mt-1 leading-snug ${item.accentText}`}>
                            {item.accessScope}
                          </span>
                        </div>
                      </div>

                      {/* Capabilities Checklist */}
                      <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                          Key Actions Inside This Portal
                        </span>
                        <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                          {item.capabilities.map((cap, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                              <Check className={`w-4 h-4 shrink-0 mt-0.5 ${item.accentText}`} />
                              <span>{cap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Single Primary Portal Entry Footer */}
                  <div className="px-6 pb-6 pt-2">
                    <button
                      type="button"
                      onClick={() => handleAccessAction(item.actionType)}
                      className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${item.accentButton}`}
                    >
                      <span>{item.ctaLabel}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Connected Lifecycle Summary Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Connected Statutory Sequence
              </div>
              <p className="text-sm text-slate-300">
                01 Public Search &rarr; 02 Citizen Beacon Filing &rarr; 03 Surveyor GIS Overlap Check &rarr; 04 Community Oracle Attestation
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => (onOpenAuth ? onOpenAuth('signup', 'citizen') : handleOpenStep('citizen'))}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => (onOpenAuth ? onOpenAuth('login', 'citizen') : handleOpenStep('citizen'))}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
              >
                Sign In to Portal
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. INSTANT PUBLIC TITLE VERIFICATION */}
      <section id="check-title" className="py-20 px-6 lg:px-12 border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
              Category 01 · Free Public Title Verification
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Check Any Property Record Instantly
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Buying land? Verify the seller&rsquo;s title before paying a kobo. Search by cadastral reference number, district, or owner name below.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Reference (e.g. FCT/AMAC/KAT/0891-B) or Owner Name..."
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:outline-emerald-500 shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
            >
              {isSearching ? 'Checking Registry...' : 'Search Title'}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-slate-400">Sample properties:</span>
            {parcels.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectSample(p)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  searchedParcel?.id === p.id && !searchNotFound
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>
                  {p.district} ({p.applicantName.split(' ')[0]})
                </span>
              </button>
            ))}
          </div>

          {searchNotFound ? (
            <div className="bg-slate-900 rounded-2xl border border-amber-500/40 p-8 text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                No Matching Property Record Found for &ldquo;{searchQuery}&rdquo;
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Double-check the cadastral reference number (e.g. FCT/AMAC/KAT/0891-B), or register a brand-new parcel in the Citizen Portal.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {parcels[0] && (
                  <button
                    type="button"
                    onClick={() => handleSelectSample(parcels[0])}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Show Sample Title
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenStep('citizen')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Register New Plot in Citizen Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            searchedParcel &&
            (() => {
              const statusMeta = getStatusMeta(searchedParcel.status);
              return (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                    <div>
                      <div
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md border mb-2 ${statusMeta.badgeClass}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{statusMeta.label}</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white">
                        {searchedParcel.district}, {searchedParcel.state}
                      </h3>
                      <div className="text-xs text-slate-400 mt-1">
                        Cadastral Reference:{' '}
                        <strong className="text-slate-200 font-mono">
                          {searchedParcel.cadastralRef}
                        </strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenStep('surveyor', searchedParcel.id)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Compass className="w-4 h-4 text-sky-400" />
                        <span>Inspect on GIS Map</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCertModal(true)}
                        className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-4 h-4" />
                        <span>View Official Deed</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block">Registered Owner</span>
                      <span className="text-sm font-bold text-white block mt-1">
                        {searchedParcel.applicantName}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Verified National ID
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block">Land Size</span>
                      <span className="text-sm font-bold text-emerald-400 block mt-1">
                        {searchedParcel.areaSqm.toLocaleString()} m&sup2;
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {(searchedParcel.areaSqm / 648).toFixed(1)} standard plots
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block">Approved Use</span>
                      <span className="text-sm font-bold text-white block mt-1">
                        {searchedParcel.intendedUse}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Zoned Development
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block">Boundary Status</span>
                      <span className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {searchedParcel.status === 'draft' ? 'Pending Check' : 'No Overlaps'}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Clean border separation
                      </span>
                    </div>
                  </div>

                  <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-4 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>{statusMeta.note}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenStep('oracle', searchedParcel.id)}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200 whitespace-nowrap flex items-center gap-1 shrink-0"
                    >
                      <span>Community Oracle Record</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </section>

      {/* 5. STATUTORY PROTECTIONS */}
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
                Mortgage lenders and legal teams use Public Registry Access to confirm statutory validity and collateral status in seconds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FREQUENTLY ASKED QUESTIONS */}
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

      {/* 7. CONTACT / ACCESS SUPPORT */}
      <section id="contact" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block">
              Registry Support
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Speak With Our Cadastral Access Team
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Need onboarding for a licensed survey firm, traditional council, or state land ministry? Reach out below.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-xl">
            {formSubmitted ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 bg-emerald-600/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Thank You, {contactForm.name}!</h3>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  We have received your message. A land administration officer will reach out to your phone or email shortly.
                </p>
                <button
                  type="button"
                  onClick={() => setFormSubmitted(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="space-y-4 text-xs sm:text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium block">Your Full Name *</label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="e.g. Alhaji Ibrahim Musa"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium block">Phone Number / WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="+234 803 123 4567"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium block">Email Address (Optional)</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="ibrahim@example.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium block">State / Location</label>
                    <select
                      value={contactForm.state}
                      onChange={(e) => setContactForm({ ...contactForm, state: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                    >
                      <option value="Federal Capital Territory (Abuja)">Federal Capital Territory (Abuja)</option>
                      <option value="Lagos State">Lagos State</option>
                      <option value="Ogun State">Ogun State</option>
                      <option value="Kano State">Kano State</option>
                      <option value="Rivers State">Rivers State</option>
                      <option value="Enugu State">Enugu State</option>
                      <option value="Other States">Other State / Jurisdiction</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium block">How Can We Help You?</label>
                  <textarea
                    rows={3}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    placeholder="Tell us which access portal or property verification you need assistance with..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-md mt-2 flex items-center justify-center gap-2"
                >
                  <span>Submit Inquiry</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-[#05080e] text-slate-400 py-12 px-6 lg:px-12 border-t border-slate-800 text-xs">
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
            <a href="#access-portals" className="hover:text-white transition-colors whitespace-nowrap">
              Access Portals
            </a>
            <a href="#check-title" className="hover:text-white transition-colors whitespace-nowrap">
              Verify Title
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
      {showCertModal && searchedParcel && (
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
                Issued pursuant to Land Use Act (1978) · Title Ref #{searchedParcel.cadastralRef}
              </div>
            </div>

            <div className="py-6 space-y-4 text-xs">
              <p className="leading-relaxed text-slate-800">
                THIS IS TO CERTIFY that{' '}
                <strong className="font-bold text-slate-950 uppercase">
                  {searchedParcel.applicantName}
                </strong>{' '}
                ({searchedParcel.applicantNin}) is the registered statutory titleholder of that parcel of land situated at{' '}
                <strong className="font-semibold">
                  {searchedParcel.district}, {searchedParcel.state}
                </strong>{' '}
                containing an area of approximately{' '}
                <strong className="font-bold text-slate-900">
                  {searchedParcel.areaSqm.toLocaleString()} square meters
                </strong>
                .
              </p>

              <div className="bg-white/80 p-4 rounded-xl border border-amber-200/80 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Cadastral Ref:</span>
                  <div className="font-bold text-slate-900">{searchedParcel.cadastralRef}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Survey Plan Lodgement:</span>
                  <div className="font-bold text-slate-900">{searchedParcel.surveyPlanRef}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Digital Verification Hash:</span>
                  <div className="font-mono font-bold text-emerald-800 truncate">
                    {searchedParcel.spatialHash}
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
