import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  CheckCircle2, 
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Compass,
  Building2,
  Gavel,
  Radio,
  BarChart3,
  Smartphone,
  FileText
} from 'lucide-react';
import { FigmaFrameId, FigmaFrame } from '../../types/anagu';

export interface TourStep {
  step: number;
  frameId: FigmaFrameId;
  title: string;
  role: string;
  actor: string;
  lawSection: string;
  description: string;
  technicalMechanism: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    frameId: 'frame-citizen',
    title: 'Citizen Title Application Lodgement',
    role: 'Citizen / Applicant',
    actor: 'Dr. Aminu Bello Abubakar (NIN-8921-4091-2311)',
    lawSection: 'Land Use Act (1978) Section 5',
    description: 'Applicant submits 4 boundary beacon coordinates in WGS84 for a residential parcel in Katampe Extension, Abuja FCT.',
    technicalMechanism: 'Client-side EPSG:4326 geometry validation & SHA-256 deed document hashing.'
  },
  {
    step: 2,
    frameId: 'frame-surveyor',
    title: 'Cadastral Spatial Topology & Collision Engine',
    role: 'Licensed Surveyor',
    actor: 'Surveyor General Directorate',
    lawSection: 'Survey Act (CAP S17 LFN 2004)',
    description: 'PostGIS verifies polygon self-intersection and checks 0.5m buffer halo against adjacent registered titles to prevent overlapping surveys.',
    technicalMechanism: 'ST_IsValid(geom) & ST_Intersects(ST_Buffer(new.geom, 0.5), existing.geom).'
  },
  {
    step: 3,
    frameId: 'frame-oracle',
    title: 'Customary Tenure Lineage Attestation',
    role: 'Community Oracle',
    actor: 'Council of Traditional Elders & Customary Trustees',
    lawSection: 'Land Use Act (1978) Section 36 & Customary Law',
    description: 'Traditional rulers verify ancestral inheritance and customary boundary marks. Minimum 2 of 3 council consensus required to issue signed attestation.',
    technicalMechanism: 'Threshold Schnorr / Multi-sig cryptographic attestation published to registry.'
  },
  {
    step: 4,
    frameId: 'frame-registrar',
    title: 'ERC-721 Title NFT Issuance on Hyperledger Besu',
    role: 'Registrar of Deeds',
    actor: 'Federal Lands Registry Directorate',
    lawSection: 'Land Use Act (1978) Section 9 (Grant of Certificate of Occupancy)',
    description: 'Registrar executes pre-mint audit. Hyperledger Besu QBFT smart contract mints ERC-721 LandTitleNFT #1042 with immutable spatial hash.',
    technicalMechanism: 'Solidity ERC721 LandTitleNFT.mint() constrained by LandRegistry invariants.'
  },
  {
    step: 5,
    frameId: 'frame-mobile',
    title: 'Mobile Field Survey & Offline SQLite Queue',
    role: 'Field Cadastral Officer',
    actor: 'On-Site RTK GNSS Field Crew',
    lawSection: 'Field Demarcation Standards',
    description: 'Cadastral crew marks boundary pillars in low-connectivity rural zones. Observations buffer in local encrypted SQLite and flush on reconnect.',
    technicalMechanism: 'React Native / Expo offline store syncing via Mosquitto MQTT QoS 2 broker.'
  },
  {
    step: 6,
    frameId: 'frame-governor',
    title: 'Executive Suite: Section 28 Statutory Revocation',
    role: 'Executive Governor',
    actor: 'His Excellency, Executive Governor',
    lawSection: 'Land Use Act (1978) Section 28(1) & 28(2)',
    description: 'Governor revokes title for overriding public interest. Smart contract flags token as revoked, permanently freezing ERC-721 transfer hooks.',
    technicalMechanism: 'LandTitleNFT.revoke() restricted to GOVERNOR_ROLE; OpenZeppelin _update() reverts on revoked tokens.'
  },
  {
    step: 7,
    frameId: 'frame-evaluation',
    title: 'Component 4: Cross-Cutting Empirical Evaluation',
    role: 'System Evaluator',
    actor: 'Empirical Verification Bench',
    lawSection: 'Comparative Analysis Against Paper-Based Cadastres',
    description: 'Demonstrates 100% fraud rejection across 100 simulated attack trials (forged deeds, overlapping surveys, colluding witnesses, revoked token reuse).',
    technicalMechanism: '99.98% issuance latency speedup (from 180 days to 2.4s) & 98.3% storage bit reduction.'
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentStepIndex: number;
  onSetStepIndex: (index: number) => void;
  onFocusFrame: (frameId: FigmaFrameId) => void;
}

export const FigmaGuidedTour: React.FC<Props> = ({
  isOpen,
  onClose,
  currentStepIndex,
  onSetStepIndex,
  onFocusFrame
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Auto-play timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && isOpen) {
      timer = setTimeout(() => {
        if (currentStepIndex < TOUR_STEPS.length - 1) {
          const nextIdx = currentStepIndex + 1;
          onSetStepIndex(nextIdx);
          onFocusFrame(TOUR_STEPS[nextIdx].frameId);
        } else {
          setIsPlaying(false);
        }
      }, 7000);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, isOpen, onSetStepIndex, onFocusFrame]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      onSetStepIndex(nextIdx);
      onFocusFrame(TOUR_STEPS[nextIdx].frameId);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      onSetStepIndex(prevIdx);
      onFocusFrame(TOUR_STEPS[prevIdx].frameId);
    }
  };

  const handleSelectStep = (idx: number) => {
    onSetStepIndex(idx);
    onFocusFrame(TOUR_STEPS[idx].frameId);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-4 select-none animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="bg-[#1e1e1e]/95 backdrop-blur-md border-2 border-emerald-500/80 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] p-5 text-white flex flex-col gap-3.5">
        {/* Top Header inside Banner */}
        <div className="flex items-center justify-between pb-2 border-b border-[#333]">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-xs font-bold font-mono">
              {currentStep.step}
            </span>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Interactive Land Administration Tour · Stage {currentStep.step} of {TOUR_STEPS.length}
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {currentStep.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto Play toggle */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                isPlaying 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-[#2a2a2a] text-slate-300 hover:text-white hover:bg-[#333]'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause Auto-Tour' : 'Auto Play'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#333] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="md:col-span-2 space-y-2">
            <p className="text-slate-200 text-xs leading-relaxed">
              {currentStep.description}
            </p>
            <div className="bg-[#121212] p-2.5 rounded-lg border border-[#2a2a2a] font-mono text-[11px] text-emerald-400">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Engine Verification Rule:</span>
              {currentStep.technicalMechanism}
            </div>
          </div>

          <div className="bg-[#252525] p-3 rounded-xl border border-[#333] space-y-1.5 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Legal Statutory Mandate</div>
              <div className="text-xs font-bold text-slate-200 mt-0.5">{currentStep.lawSection}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                Authorized Authority: <span className="text-emerald-400 font-medium">{currentStep.actor}</span>
              </div>
            </div>

            <button
              onClick={() => onFocusFrame(currentStep.frameId)}
              className="w-full mt-2 py-1.5 bg-[#333] hover:bg-emerald-600 hover:text-white text-slate-200 text-[11px] font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Center Camera on Artboard</span>
            </button>
          </div>
        </div>

        {/* Step Navigation Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[#333]">
          {/* Step Dots */}
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.step}
                onClick={() => handleSelectStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStepIndex 
                    ? 'w-7 bg-emerald-500' 
                    : 'w-2 bg-[#3a3a3a] hover:bg-[#555]'
                }`}
                title={`Stage ${s.step}: ${s.title}`}
              />
            ))}
          </div>

          {/* Prev / Next Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                currentStepIndex === 0 
                  ? 'opacity-40 cursor-not-allowed bg-[#252525] text-slate-500' 
                  : 'bg-[#2a2a2a] hover:bg-[#383838] text-slate-200 hover:text-white'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <button
              onClick={handleNext}
              disabled={currentStepIndex === TOUR_STEPS.length - 1}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                currentStepIndex === TOUR_STEPS.length - 1
                  ? 'opacity-40 cursor-not-allowed bg-[#252525] text-slate-500'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
              }`}
            >
              <span>Next Stage</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
