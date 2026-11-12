import React, { useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  Search, 
  FileText, 
  Lock, 
  Compass, 
  Users, 
  Building2, 
  Check, 
  Printer, 
  HelpCircle, 
  Phone, 
  Mail, 
  MapPin, 
  Layers, 
  ChevronDown,
  Sparkles,
  Award,
  AlertCircle
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onOpenPrototype: () => void;
  onOpenCanvas: () => void;
}

export const ScreenLandingPage: React.FC<Props> = ({
  parcels,
  onOpenPrototype,
  onOpenCanvas
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedParcel, setSearchedParcel] = useState<ParcelRecord>(parcels[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Simple inquiry form state
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    state: 'Federal Capital Territory (Abuja)',
    message: ''
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setTimeout(() => {
      const match = parcels.find(p => 
        p.cadastralRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.district.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchedParcel(match || parcels[0]);
      setIsSearching(false);
    }, 400);
  };

  const handleSelectSample = (parcel: ParcelRecord) => {
    setSearchQuery(parcel.cadastralRef);
    setSearchedParcel(parcel);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.phone) return;
    setFormSubmitted(true);
  };

  const faqs = [
    {
      q: "Can someone secretly sell or claim my land while I am away?",
      a: "No. Every parcel in Anagu is digitally locked to its exact satellite GPS coordinates. The system immediately blocks anyone trying to register over your boundary, even by a single centimeter."
    },
    {
      q: "Is this certificate accepted by Nigerian banks and courts?",
      a: "Yes. Certificates of Occupancy (C of O) are issued under the Nigerian Land Use Act (1978). Banks can scan the encrypted QR code on your certificate to confirm ownership instantly for mortgage or business loan applications."
    },
    {
      q: "What if my family inherited community land without old paperwork?",
      a: "Anagu recognizes customary ancestral tenure under Section 36 of the Land Use Act. Our community portal enables traditional council elders and village heads to attest to your family lineage and ancestral boundary marks."
    },
    {
      q: "How does it work in rural areas with poor internet connection?",
      a: "Licensed field surveyors use mobile tools that work 100% offline. They can map your boundary pillars in the field, and the data automatically syncs securely once they return to network coverage."
    },
    {
      q: "How long does title verification and registration take?",
      a: "Instead of waiting 6 to 18 months in government registry queues, automated boundary checks take seconds, and complete digital grant issuance takes only days."
    }
  ];

  return (
    <div className="w-full min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. SIMPLE, HUMAN TOP NAVIGATION */}
      <header className="sticky top-0 z-40 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800/80 px-6 lg:px-12 h-18 flex items-center justify-between">
        {/* Brand with Sovereign Avatar Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group" 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <div className="relative w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-lg shadow-emerald-950/70 shrink-0 group-hover:scale-105 transition-transform duration-200">
            <img 
              src={ASSET_IMAGES.logoAvatar} 
              alt="Anagu Sovereign Emblem" 
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#070b12]" title="Statutory Cadastre Live" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white block leading-none">
              Anagu
            </span>
            <span className="text-[11px] text-emerald-400 font-medium block mt-1">
              Secure Land Title Registry
            </span>
          </div>
        </div>

        {/* Friendly human nav links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#how-it-works" className="hover:text-emerald-400 transition-colors">How It Works</a>
          <a href="#check-title" className="hover:text-emerald-400 transition-colors">Check a Title</a>
          <a href="#protection" className="hover:text-emerald-400 transition-colors">Your Protection</a>
          <a href="#faq" className="hover:text-emerald-400 transition-colors">FAQ</a>
          <a href="#contact" className="hover:text-emerald-400 transition-colors">Contact</a>
        </nav>

        {/* Primary Action Button & User Avatar */}
        <div className="flex items-center gap-3">
          <a
            href="#check-title"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Verify Land Title</span>
          </a>
          <button
            onClick={onOpenPrototype}
            className="hidden lg:inline-flex text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Try Interactive Demo
          </button>

          {/* User Profile Avatar Pill */}
          <div 
            onClick={onOpenPrototype}
            className="flex items-center gap-2.5 pl-3 py-1 pr-1.5 rounded-full bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all hover:bg-slate-800/80 group"
            title="Active Session: Surveyor Musa Adeleke"
          >
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                Musa Adeleke
              </div>
              <div className="text-[10px] text-emerald-400 font-medium flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                NIS Licensed Surveyor
              </div>
            </div>
            <div className="relative w-9 h-9 rounded-full ring-2 ring-emerald-500/50 overflow-hidden shrink-0 shadow-sm">
              <img 
                src={ASSET_IMAGES.userAvatar} 
                alt="Musa Adeleke - Land Surveyor" 
                className="w-full h-full object-cover" 
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
            </div>
          </div>
        </div>
      </header>

      {/* 2. HERO: CLEAR, TRUSTWORTHY, HUMAN PROMISE */}
      <section className="relative pt-12 pb-20 px-6 lg:px-12 border-b border-slate-800/80 overflow-hidden">
        {/* Subtle warm glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-emerald-600/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Text: Plain English value */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/70 text-emerald-400 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Federal Republic of Nigeria · Land Use Act (1978)</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.15] text-balance">
              Never Worry About Land Fraud or Boundary Disputes Again
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Anagu secures your land ownership with digital boundary protection. We verify your survey marks, confirm community elders' consent, and issue a tamper-proof Digital Certificate of Occupancy that banks and courts recognize.
            </p>

            {/* Direct human actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#check-title"
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                <span>Check Your Land Title Now</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#how-it-works"
                className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm rounded-xl border border-slate-700 transition-colors"
              >
                See How It Works
              </a>
            </div>

            {/* Reassuring simple points */}
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero Double Selling</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Elders & Family Approved</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Bank & Court Recognized</span>
              </div>
            </div>
          </div>

          {/* Right: Friendly visual preview */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl relative group bg-slate-900">
              <img
                src={ASSET_IMAGES.heroArchitecture}
                alt="Sovereign Land Administration Headquarters"
                referrerPolicy="no-referrer"
                className="w-full h-[360px] object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
              
              {/* Simple human-friendly preview card */}
              <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-4 space-y-2 shadow-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified Title Deed
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">Certificate #4092</span>
                </div>
                <div className="text-sm font-bold text-white">
                  Dr. Aminu Bello Abubakar
                </div>
                <div className="text-xs text-slate-300 flex items-center justify-between pt-1 border-t border-slate-800">
                  <span>Katampe Extension, Abuja</span>
                  <span className="text-emerald-400 font-medium">1,845 m² (Residential)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FOUR SIMPLE STEPS: HOW IT WORKS FOR EVERY CITIZEN */}
      <section id="how-it-works" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Simple 4-Step Process
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              How Your Land Is Protected From Start to Finish
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              We took the confusing government paperwork and made it straightforward, transparent, and completely fraud-proof.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                1
              </div>
              <h3 className="text-lg font-bold text-white">
                Map Your Boundaries
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                A licensed surveyor logs your property boundary pillars using precise GPS coordinates. Even in remote areas, this works without internet.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                2
              </div>
              <h3 className="text-lg font-bold text-white">
                Instant Overlap Check
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Our system automatically checks your boundary against every neighboring land record. If anyone tries to overlap by even half a meter, it is flagged immediately.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 relative">
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 font-bold flex items-center justify-center text-sm border border-amber-500/30">
                3
              </div>
              <h3 className="text-lg font-bold text-white">
                Community Elders Verify
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Traditional village heads and family trustees review the history of the land to confirm ancestral ownership, preventing family inheritance disputes.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 relative">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                4
              </div>
              <h3 className="text-lg font-bold text-white">
                Receive Your Digital Title
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                The government issues your official Certificate of Occupancy. You get a printable deed and a digital QR code that anyone can verify in one second.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. INSTANT TITLE VERIFICATION: SUPER SIMPLE FOR USERS */}
      <section id="check-title" className="py-20 px-6 lg:px-12 border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Free Public Title Verification
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Check Any Property Record Instantly
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Buying land? Verify the seller’s title before paying a kobo. Type the reference number or owner name below to check validity.
            </p>
          </div>

          {/* Simple Search Input */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
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
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0"
            >
              {isSearching ? 'Checking Database...' : 'Search Title'}
            </button>
          </form>

          {/* Friendly One-Click Examples */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-slate-400">Try sample properties:</span>
            {parcels.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectSample(p)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  searchedParcel.id === p.id 
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300' 
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{p.district} ({p.applicantName.split(' ')[0]})</span>
              </button>
            ))}
          </div>

          {/* Human-Friendly Verification Card */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl">
            {/* Top row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/80 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Officially Registered & Protected</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {searchedParcel.district}, {searchedParcel.state}
                </h3>
                <div className="text-xs text-slate-400 mt-1">
                  Cadastral Reference: <strong className="text-slate-200 font-mono">{searchedParcel.cadastralRef}</strong>
                </div>
              </div>

              <button
                onClick={() => setShowCertModal(true)}
                className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors self-start sm:self-center"
              >
                <FileText className="w-4 h-4" />
                <span>View Official Deed</span>
              </button>
            </div>

            {/* Clear Property Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">Registered Owner</span>
                <span className="text-sm font-bold text-white block mt-1">
                  {searchedParcel.applicantName}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Verified National ID</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">Land Size</span>
                <span className="text-sm font-bold text-emerald-400 block mt-1">
                  {searchedParcel.areaSqm.toLocaleString()} m²
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Approx. 2–3 standard plots</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">Approved Use</span>
                <span className="text-sm font-bold text-white block mt-1">
                  {searchedParcel.intendedUse}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Zoned Development</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">Boundary Status</span>
                <span className="text-sm font-bold text-emerald-400 block mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>No Overlaps</span>
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Clean border separation</span>
              </div>
            </div>

            {/* Reassuring note */}
            <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-4 text-xs text-slate-300 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                This property has been legally stamped by the Surveyor General and attested by the Traditional Council of Elders. It cannot be duplicated or sold twice.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. YOUR PROTECTION: REAL PROBLEM SOLVED WITHOUT JARGON */}
      <section id="protection" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Complete Peace of Mind
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              How Anagu Solves the 4 Biggest Land Problems in Nigeria
            </h2>
            <p className="text-sm text-slate-400">
              Clear protections designed to save everyday landowners from heartbreak and financial loss.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">No More Fake Stamped Papers</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Fraudsters often use fake rubber stamps and forged signatures to sell land that isn’t theirs. Anagu replaces loose papers with an unforgeable digital certificate that directly links to the state registry.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">No More Boundary Overlaps</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                When two people are sold the same plot of land, disputes drag on in court for decades. Anagu’s satellite system checks every boundary down to the centimeter before any title can be granted.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Family & Elder Disagreements Prevented</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                One family member cannot secretly sell ancestral land behind everyone's back. Our community quorum requires multiple recognized traditional elders and trustees to confirm the lineage together.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Instant Bank Verification</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Need a bank loan using your land as collateral? Banks can verify your ownership in 5 seconds by scanning the certificate, avoiding months of slow manual registry searches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FREQUENTLY ASKED QUESTIONS (FAQ) */}
      <section id="faq" className="py-20 px-6 lg:px-12 border-b border-slate-800/80">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Clear Answers
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-400">
              Everything you need to know about protecting your property.
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

      {/* 7. SIMPLE, COMFORTABLE CONTACT / INQUIRY */}
      <section id="contact" className="py-20 px-6 lg:px-12 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Get in Touch
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Speak With Our Cadastral Support Team
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Whether you are a landowner, property developer, or community elder, our team is ready to assist you.
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
                    <label className="text-slate-300 font-medium">Your Full Name *</label>
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
                    <label className="text-slate-300 font-medium">Phone Number / WhatsApp *</label>
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
                    <label className="text-slate-300 font-medium">Email Address (Optional)</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="ibrahim@example.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">State / Location</label>
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
                  <label className="text-slate-300 font-medium">How Can We Help You?</label>
                  <textarea
                    rows={3}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    placeholder="Tell us about the property you want to verify or register..."
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

      {/* 8. SIMPLE SOVEREIGN FOOTER */}
      <footer className="bg-[#05080e] text-slate-400 py-12 px-6 lg:px-12 border-t border-slate-800 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-md shrink-0">
              <img 
                src={ASSET_IMAGES.logoAvatar} 
                alt="Anagu Emblem Avatar" 
                className="w-full h-full object-cover rounded-full bg-slate-900"
              />
            </div>
            <div>
              <span className="font-bold text-white text-sm block">Anagu Land Administration</span>
              <span className="text-[11px] text-slate-500 block">Land Use Act (1978) & Survey Act Standards</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#check-title" className="hover:text-white transition-colors">Check Title</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <button onClick={onOpenPrototype} className="hover:text-emerald-400 transition-colors">
              Interactive Demo
            </button>
            <button onClick={onOpenCanvas} className="hover:text-slate-300 transition-colors">
              Figma Design Canvas
            </button>
          </div>

          <div className="text-slate-500 text-[11px]">
            © 2026 Anagu. All statutory protections reserved.
          </div>
        </div>
      </footer>

      {/* OFFICIAL CERTIFICATE OF OCCUPANCY MODAL */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-amber-50 text-slate-900 rounded-2xl max-w-2xl w-full p-8 border-4 border-amber-200 shadow-2xl relative overflow-hidden animate-in fade-in duration-150">
            <div className="text-center pb-6 border-b-2 border-amber-200">
              <div className="text-xs uppercase tracking-widest text-amber-900 font-bold">Federal Republic of Nigeria</div>
              <h2 className="text-xl font-serif font-bold text-slate-900 mt-1">
                CERTIFICATE OF OCCUPANCY (DIGITAL TITLE DEED)
              </h2>
              <div className="text-xs font-mono text-amber-800 mt-1">
                Issued pursuant to Land Use Act (1978) · Title Ref #{searchedParcel.cadastralRef}
              </div>
            </div>

            <div className="py-6 space-y-4 text-xs">
              <p className="leading-relaxed text-slate-800">
                THIS IS TO CERTIFY that <strong className="font-bold text-slate-950 uppercase">{searchedParcel.applicantName}</strong> ({searchedParcel.applicantNin}) is the registered statutory titleholder of that parcel of land situated at <strong className="font-semibold">{searchedParcel.district}, {searchedParcel.state}</strong> containing an area of approximately <strong className="font-bold text-slate-900">{searchedParcel.areaSqm.toLocaleString()} square meters</strong>.
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
                  <div className="font-mono font-bold text-emerald-800 truncate">{searchedParcel.spatialHash}</div>
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
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Deed
                </button>
                <button 
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
