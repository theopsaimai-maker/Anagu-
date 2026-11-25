import React, { useEffect, useMemo, useState } from 'react';
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
  Landmark,
  Wallet,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Maximize2,
  Clock,
  Compass,
  Coins
} from 'lucide-react';
import { AuthUser, ParcelRecord, VerifiedLandListing } from '../../types/anagu';
import { VERIFIED_LANDS_FOR_SALE, getDefaultPolygonForState } from '../../data/verifiedLands';
import { ASSET_IMAGES } from '../../data/mockData';
import { apiCreateInquiry } from '../../lib/api';
import { describeParcelGeography } from '../../lib/geoDescription';
import { LandRegistrySnapshot } from '../maps/LandRegistrySnapshot';
import {
  ANAGU_USD_REFERENCE_RATE,
  ConnectedWalletResult,
  DiscoveredWallet,
  POL_USD_REFERENCE_RATE,
  connectWeb3Wallet,
  discoverWalletsOnce,
  formatWalletError,
  getChainName,
  getMobileWalletDeepLinks,
  isMobileDevice,
  isValidEvmAddress,
  sendPaymentToSellerWallet,
  signLandPurchaseIntent,
  subscribeEip6963Wallets,
  truncateAddress,
  usdToAnaguString,
  usdToPolString
} from '../../lib/web3Wallet';
import {
  getContractConfig,
  getPolygonAmoyAddressUrl,
  getPolygonAmoyTxUrl
} from '../../config/contracts';
import {
  AnaguTokenStatus,
  claimTestnetAnaguTokens,
  openLandPurchaseEscrowOnChain,
  readAnaguTokenStatus
} from '../../lib/anaguContracts';

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
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
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
  const [deedListing, setDeedListing] = useState<VerifiedLandListing | null>(null);
  const [buyListing, setBuyListing] = useState<VerifiedLandListing | null>(null);
  const [fullMapListing, setFullMapListing] = useState<VerifiedLandListing | null>(null);

  const [buyerName, setBuyerName] = useState(currentUser?.fullName || '');
  const [buyerPhone, setBuyerPhone] = useState(currentUser?.phone || '');
  const [buyerEmail, setBuyerEmail] = useState(currentUser?.email || '');
  const [offerNotes, setOfferNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const [discoveredWallets, setDiscoveredWallets] = useState<DiscoveredWallet[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletResult | null>(null);
  const [walletStatus, setWalletStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'signing' | 'no_provider' | 'error'
  >('idle');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletSignature, setWalletSignature] = useState<string | null>(null);
  const [copiedDappUrl, setCopiedDappUrl] = useState(false);
  const [copiedSellerWallet, setCopiedSellerWallet] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'deposit'>('full');
  const [settlementAsset, setSettlementAsset] = useState<'ANAGU' | 'POL'>('ANAGU');
  const [paymentEthAmount, setPaymentEthAmount] = useState<string>('');
  const [isSendingPayment, setIsSendingPayment] = useState(false);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [buyerTokenStatus, setBuyerTokenStatus] = useState<AnaguTokenStatus | null>(null);
  const [isClaimingTestAnagu, setIsClaimingTestAnagu] = useState(false);

  const contractConfig = useMemo(() => getContractConfig(), []);
  const mobileLinks = useMemo(() => getMobileWalletDeepLinks(), []);
  const isMobile = useMemo(() => isMobileDevice(), []);

  useEffect(() => {
    if (!buyListing) return;
    const unsubscribe = subscribeEip6963Wallets((wallets) => {
      setDiscoveredWallets(wallets);
    });
    return unsubscribe;
  }, [buyListing]);

  useEffect(() => {
    const provider = connectedWallet?.provider;
    if (!provider?.on || !provider?.removeListener) return;

    const handleAccountsChanged = (accountsArg: unknown) => {
      const accounts = Array.isArray(accountsArg)
        ? accountsArg.filter((a): a is string => typeof a === 'string')
        : [];
      if (accounts.length === 0) {
        setConnectedWallet(null);
        setWalletSignature(null);
        setWalletStatus(discoveredWallets.length > 0 ? 'idle' : 'no_provider');
      } else {
        setConnectedWallet((prev) =>
          prev ? { ...prev, address: accounts[0] } : prev
        );
        setWalletSignature(null);
      }
    };

    const handleChainChanged = (chainArg: unknown) => {
      if (typeof chainArg !== 'string') return;
      const { chainIdDecimal, chainName } = getChainName(chainArg);
      setConnectedWallet((prev) =>
        prev
          ? {
              ...prev,
              chainIdHex: chainArg,
              chainIdDecimal,
              chainName
            }
          : prev
      );
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [connectedWallet?.provider, discoveredWallets.length]);

  const allListings = useMemo<VerifiedLandListing[]>(() => {
    const existingRefs = new Set(VERIFIED_LANDS_FOR_SALE.map((item) => item.cadastralRef));
    const userSubmittedListings: VerifiedLandListing[] = parcels
      .filter(
        (p) =>
          p.status !== 'revoked' &&
          p.status !== 'rejected' &&
          !existingRefs.has(p.cadastralRef)
      )
      .map((p, idx) => {
        const isApproved = p.status === 'registered';
        return {
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
          sellerWallet: p.sellerWallet,
          surveyPlanRef: p.surveyPlanRef,
          spatialHash: p.spatialHash,
          tokenId: p.tokenId || 4300 + idx,
          verificationBadge: isApproved ? 'Approved' : 'Waiting for admin approval',
          approvalStatus: isApproved ? 'approved' : 'waiting_admin_approval',
          landmark: `${p.lga}, ${p.state}`,
          imageUrl: p.mapSnapshotUrl || '',
          coordinates:
            p.coordinates && p.coordinates.length >= 3
              ? p.coordinates
              : getDefaultPolygonForState(p.state),
          isOsmSnapshot: true
        };
      });

    const catalogListings: VerifiedLandListing[] = VERIFIED_LANDS_FOR_SALE.map((item) => ({
      ...item,
      verificationBadge: 'Approved',
      approvalStatus: 'approved'
    }));

    return [...userSubmittedListings, ...catalogListings];
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

  const triggerWalletConnection = async (targetWallet?: DiscoveredWallet) => {
    setWalletError(null);
    setWalletSignature(null);
    setWalletStatus('connecting');

    try {
      const wallets = targetWallet
        ? [targetWallet]
        : discoveredWallets.length > 0
          ? discoveredWallets
          : await discoverWalletsOnce(180);

      if (!targetWallet && wallets.length > 0) {
        setDiscoveredWallets(wallets);
      }

      const chosen = targetWallet || wallets[0];
      if (!chosen) {
        setWalletStatus('no_provider');
        return;
      }

      const connected = await connectWeb3Wallet(chosen, {
        enforcePolygon: true,
        targetNetwork: 'amoy'
      });
      setConnectedWallet(connected);
      setWalletStatus('connected');
      void readAnaguTokenStatus(connected.address, buyListing?.id, connected.provider)
        .then(setBuyerTokenStatus)
        .catch(() => undefined);
    } catch (err) {
      setWalletStatus('error');
      setWalletError(formatWalletError(err));
    }
  };

  const openBuyModal = (listing: VerifiedLandListing) => {
    if (listing.approvalStatus === 'waiting_admin_approval') {
      return;
    }
    const cfg = getContractConfig();
    const defaultAsset: 'ANAGU' | 'POL' = cfg.anaguTokenAddress ? 'ANAGU' : 'POL';
    setBuyListing(listing);
    setBuyerName(currentUser?.fullName || '');
    setBuyerPhone(currentUser?.phone || '');
    setBuyerEmail(currentUser?.email || '');
    setOfferNotes(
      `Purchase reservation for verified parcel ${listing.cadastralRef} (${formatUsd(listing.priceUsd)} USD) pending Registrar statutory title transfer.`
    );
    setSubmitError(null);
    setSubmittedRef(null);
    setWalletError(null);
    setWalletSignature(null);
    setPaymentTxHash(null);
    setEscrowId(null);
    setIsSendingPayment(false);
    setPaymentMode('full');
    setSettlementAsset(defaultAsset);
    setPaymentEthAmount(
      defaultAsset === 'ANAGU' ? usdToAnaguString(listing.priceUsd) : usdToPolString(listing.priceUsd)
    );

    if (connectedWallet) {
      setWalletStatus('connected');
      void readAnaguTokenStatus(connectedWallet.address, listing.id, connectedWallet.provider)
        .then(setBuyerTokenStatus)
        .catch(() => undefined);
    } else {
      setWalletStatus('idle');
    }
  };

  const handleSelectSettlementAsset = (asset: 'ANAGU' | 'POL') => {
    if (!buyListing) return;
    setSettlementAsset(asset);
    const usdTarget = paymentMode === 'full' ? buyListing.priceUsd : buyListing.priceUsd * 0.1;
    setPaymentEthAmount(
      asset === 'ANAGU' ? usdToAnaguString(usdTarget) : usdToPolString(usdTarget)
    );
  };

  const handleSelectPaymentMode = (mode: 'full' | 'deposit') => {
    if (!buyListing) return;
    setPaymentMode(mode);
    const usdTarget = mode === 'full' ? buyListing.priceUsd : buyListing.priceUsd * 0.1;
    setPaymentEthAmount(
      settlementAsset === 'ANAGU' ? usdToAnaguString(usdTarget) : usdToPolString(usdTarget)
    );
  };

  const handleClaimBuyerTestnetAnagu = async () => {
    if (!connectedWallet) return;
    setWalletError(null);
    setIsClaimingTestAnagu(true);
    try {
      await claimTestnetAnaguTokens(connectedWallet.provider);
      const updated = await readAnaguTokenStatus(
        connectedWallet.address,
        buyListing?.id,
        connectedWallet.provider
      );
      setBuyerTokenStatus(updated);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Unable to claim testnet ANAGU.');
    } finally {
      setIsClaimingTestAnagu(false);
    }
  };

  const handleCopySellerWallet = async (walletAddr?: string) => {
    if (!walletAddr || typeof window === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(walletAddr);
      setCopiedSellerWallet(true);
      window.setTimeout(() => setCopiedSellerWallet(false), 2000);
    } catch {
      // Clipboard write unavailable
    }
  };

  const handlePaySellerWallet = async () => {
    if (!buyListing || !connectedWallet) return;
    if (!buyListing.sellerWallet || !isValidEvmAddress(buyListing.sellerWallet)) {
      setWalletError('This listing does not have a valid seller Polygon (0x...) wallet address.');
      return;
    }

    setWalletError(null);
    setIsSendingPayment(true);
    try {
      if (settlementAsset === 'ANAGU') {
        const res = await openLandPurchaseEscrowOnChain({
          provider: connectedWallet.provider,
          parcelId: buyListing.id,
          sellerWallet: buyListing.sellerWallet,
          anaguAmount: paymentEthAmount
        });
        setPaymentTxHash(res.txHash);
        setEscrowId(res.escrowId);
        void readAnaguTokenStatus(connectedWallet.address, buyListing.id, connectedWallet.provider)
          .then(setBuyerTokenStatus)
          .catch(() => undefined);
      } else {
        const { txHash } = await sendPaymentToSellerWallet({
          provider: connectedWallet.provider,
          fromAccount: connectedWallet.address,
          toSellerWallet: buyListing.sellerWallet,
          ethAmount: paymentEthAmount,
          targetNetwork: 'amoy'
        });
        setPaymentTxHash(txHash);
      }
    } catch (err) {
      setWalletError(formatWalletError(err));
    } finally {
      setIsSendingPayment(false);
    }
  };

  const handleSignPurchaseOnly = async () => {
    if (!buyListing || !connectedWallet) return;
    setWalletError(null);
    setWalletStatus('signing');
    try {
      const { signature } = await signLandPurchaseIntent({
        provider: connectedWallet.provider,
        account: connectedWallet.address,
        cadastralRef: buyListing.cadastralRef,
        title: buyListing.title,
        priceUsd: buyListing.priceUsd,
        sellerName: buyListing.sellerName
      });
      setWalletSignature(signature);
      setWalletStatus('connected');
    } catch (err) {
      setWalletStatus('connected');
      setWalletError(formatWalletError(err));
    }
  };

  const handleCopyDappUrl = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedDappUrl(true);
      window.setTimeout(() => setCopiedDappUrl(false), 2000);
    } catch {
      // Clipboard write unavailable
    }
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
    setWalletError(null);

    let activeSignature = walletSignature;
    if (connectedWallet && !activeSignature && !paymentTxHash) {
      setWalletStatus('signing');
      try {
        const signed = await signLandPurchaseIntent({
          provider: connectedWallet.provider,
          account: connectedWallet.address,
          cadastralRef: buyListing.cadastralRef,
          title: buyListing.title,
          priceUsd: buyListing.priceUsd,
          sellerName: buyListing.sellerName
        });
        activeSignature = signed.signature;
        setWalletSignature(signed.signature);
        setWalletStatus('connected');
      } catch (err) {
        setWalletStatus('connected');
        setWalletError(formatWalletError(err));
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const sellerWalletInfo = buyListing.sellerWallet
        ? ` | Seller Wallet: ${buyListing.sellerWallet}`
        : '';
      const paymentProofInfo = paymentTxHash
        ? settlementAsset === 'ANAGU'
          ? ` | ANAGU Statutory Escrow #${escrowId || 'Confirmed'} (${paymentEthAmount} ANAGU on Polygon Amoy): ${paymentTxHash}`
          : ` | Direct Polygon Amoy Payment Tx (${paymentEthAmount} POL): ${paymentTxHash}`
        : '';
      const walletProofSummary = connectedWallet
        ? ` | Buyer Wallet (${connectedWallet.walletName} · ${connectedWallet.chainName}): ${connectedWallet.address}${
            activeSignature ? ` | Signature: ${activeSignature}` : ''
          }`
        : '';

      await apiCreateInquiry({
        name: buyerName.trim(),
        phone: buyerPhone.trim(),
        email: buyerEmail.trim() || undefined,
        state: buyListing.state,
        message: `[LAND PURCHASE] Parcel: ${buyListing.title} (${buyListing.cadastralRef}) | Listed Price: ${formatUsd(
          buyListing.priceUsd
        )} USD | Seller: ${buyListing.sellerName}${sellerWalletInfo}${paymentProofInfo}${walletProofSummary} | Buyer Notes: ${offerNotes.trim() || 'Ready for title verification & escrow.'}`
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
      <header className="sticky top-0 z-40 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-2 sm:gap-4 shrink-0">
        <button
          type="button"
          onClick={onBackToLanding}
          className="flex items-center gap-2.5 sm:gap-3 text-left group min-w-0"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-sm shrink-0">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold text-white leading-none group-hover:text-emerald-300 transition-colors truncate">
              Anagu Land Marketplace
            </div>
            <div className="hidden sm:block text-[11px] text-emerald-400 mt-0.5 truncate">
              Verified Title Deeds Available for Purchase
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenRegister}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">Register</span>
            <span className="hidden sm:inline">Register Lands</span>
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500/60 text-xs font-medium text-slate-200 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
          >
            <Home className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Home</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1280px] mx-auto px-3.5 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-6 sm:space-y-8">
        {/* Heading, Registry Summary & Filter Controls */}
        <div className="space-y-5 sm:space-y-6 border-b border-slate-800/80 pb-6 sm:pb-7">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 sm:gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-semibold text-emerald-400 tracking-wide">
                Federal Cadastral Land Register · Verified Transfers
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                Available Verified Lands to Buy
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Every parcel card displays an official surveyed land registry snapshot with directional bearing geometry, geographical area context, approved land use, and transparent USD acquisition pricing.
              </p>
            </div>

            <div className="grid grid-cols-3 divide-x divide-slate-800 text-xs w-full lg:w-auto shrink-0 pt-1 lg:pt-0">
              <div className="pr-2 sm:pr-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Verified Deeds</div>
                <div className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5">
                  {filteredListings.length}
                </div>
              </div>
              <div className="px-2 sm:px-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Total Surveyed</div>
                <div className="text-base sm:text-lg font-bold text-emerald-400 tabular-nums mt-0.5 truncate">
                  {filteredListings.reduce((sum, l) => sum + l.areaSqm, 0).toLocaleString()} m²
                </div>
              </div>
              <div className="pl-2 sm:pl-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Settlement</div>
                <div className="text-base sm:text-lg font-bold text-white mt-0.5">Direct Web3</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
            <div className="relative w-full md:w-80 shrink-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search district, state, landmark, or title ref..."
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-full md:w-auto">
              {USE_FILTERS.map((use) => {
                const active = selectedUse === use;
                return (
                  <button
                    key={use}
                    type="button"
                    onClick={() => setSelectedUse(use)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex-1 sm:flex-initial text-center ${
                      active
                        ? 'bg-emerald-600 text-white shadow-xs'
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

        {/* 3 Columns Verified Land Registry Snapshot Grid */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7">
            {filteredListings.map((listing) => {
              const isWaitingApproval = listing.approvalStatus === 'waiting_admin_approval';
              const mapCoords =
                listing.coordinates && listing.coordinates.length >= 3
                  ? listing.coordinates
                  : getDefaultPolygonForState(listing.state);
              const geoInfo = describeParcelGeography({
                state: listing.state,
                lga: listing.lga,
                district: listing.district,
                coordinates: mapCoords,
                areaSqm: listing.areaSqm
              });

              return (
                <article
                  key={listing.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 shadow-xl shadow-black/30 group ${
                    isWaitingApproval
                      ? 'border-amber-500/40 hover:border-amber-400/70'
                      : 'border-slate-800 hover:border-emerald-500/60'
                  }`}
                >
                  <div>
                    {/* Primary Visual Stage: Official Land Registry Snapshot */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950 border-b border-slate-800">
                      <LandRegistrySnapshot
                        coordinates={mapCoords}
                        cadastralRef={listing.cadastralRef}
                        areaSqm={listing.areaSqm}
                        stateName={listing.state}
                        title={listing.title}
                        snapshotUrl={listing.imageUrl || undefined}
                      />

                      <button
                        type="button"
                        onClick={() => setFullMapListing(listing)}
                        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950/90 hover:bg-emerald-700 border border-slate-700/90 hover:border-emerald-400 text-[11px] font-semibold text-white shadow-md transition-colors whitespace-nowrap"
                        title="Enlarge registered land survey snapshot"
                      >
                        <Maximize2 className="w-3 h-3 text-emerald-400" />
                        <span>Inspect Plan</span>
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 sm:p-5 space-y-3.5">
                      {/* Clean Unboxed Approval Status & Specs Metadata */}
                      <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-medium text-slate-400">
                        {isWaitingApproval ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Waiting for admin approval</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>Approved</span>
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{listing.intendedUse}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums text-slate-300">
                          {formatPlots(listing.areaSqm)}
                        </span>
                      </div>

                      {/* Title & Location */}
                      <div className="space-y-1.5">
                        <h2 className="text-base font-bold text-white leading-snug line-clamp-1 group-hover:text-emerald-300 transition-colors">
                          {listing.title}
                        </h2>
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="line-clamp-1">
                            {listing.district}, {listing.state}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Landmark className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="line-clamp-1">
                            {geoInfo.geopoliticalZone} · {geoInfo.relativePosition}
                          </span>
                        </div>
                      </div>

                      {/* Geometry Direction & Geographical Area Context */}
                      <div className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-2.5 space-y-1 text-[11px]">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                          <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate" title={geoInfo.primaryOrientation}>
                            {geoInfo.primaryOrientation}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 leading-snug line-clamp-1">
                          {geoInfo.terrainProfile}
                        </div>
                        <div className="text-[10px] font-mono text-slate-300 tabular-nums">
                          Span: {geoInfo.dimensionsLabel}
                        </div>
                      </div>

                      {/* Price & Cadastral Ref Baseline */}
                      <div className="flex items-end justify-between gap-3 pt-3 border-t border-slate-800/90">
                        <div>
                          <span className="text-[11px] text-slate-500 block">Asking Price</span>
                          <span className="text-lg font-extrabold text-emerald-400 tabular-nums tracking-tight">
                            {formatUsd(listing.priceUsd)}
                          </span>
                        </div>
                        <div className="text-right min-w-0">
                          <span className="text-[11px] text-slate-500 block">Title Reference</span>
                          <span
                            className="font-mono text-xs font-semibold text-slate-200 block truncate max-w-[140px] sm:max-w-[155px]"
                            title={listing.cadastralRef}
                          >
                            {listing.cadastralRef}
                          </span>
                        </div>
                      </div>

                      {/* Seller & Receiving Wallet */}
                      <div className="pt-3 border-t border-slate-800/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate" title={listing.sellerName}>
                            Seller: <strong className="text-slate-200 font-medium">{listing.sellerName}</strong>
                          </span>
                        </div>
                        {listing.sellerWallet && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono truncate">
                            <Wallet className="w-3 h-3 shrink-0" />
                            <span title={listing.sellerWallet}>
                              Wallet: {truncateAddress(listing.sellerWallet)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDeedListing(listing)}
                      className="px-3 sm:px-4 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>View Deed</span>
                    </button>
                    {isWaitingApproval ? (
                      <button
                        type="button"
                        disabled
                        title="Waiting for administrator verification before purchase"
                        className="px-2.5 sm:px-3 py-2.5 bg-amber-950/50 border border-amber-500/30 text-amber-300 text-[11px] font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-not-allowed"
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Pending Approval</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openBuyModal(listing)}
                        className="px-3 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm shadow-emerald-950/50"
                      >
                        <span>Buy Land</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* VERIFIED CERTIFICATE OF OCCUPANCY MODAL */}
      {deedListing && (() => {
        const deedCoords =
          deedListing.coordinates && deedListing.coordinates.length >= 3
            ? deedListing.coordinates
            : getDefaultPolygonForState(deedListing.state);
        const deedGeo = describeParcelGeography({
          state: deedListing.state,
          lga: deedListing.lga,
          district: deedListing.district,
          coordinates: deedCoords,
          areaSqm: deedListing.areaSqm
        });
        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4">
            <div className="bg-amber-50 text-slate-900 rounded-2xl max-w-2xl w-full p-4 sm:p-8 border-4 border-amber-200 shadow-2xl relative max-h-[92vh] overflow-y-auto my-auto">
              <div className="text-center pb-4 sm:pb-5 border-b-2 border-amber-200">
                <div className="text-[11px] sm:text-xs uppercase tracking-widest text-amber-900 font-bold">
                  Federal Republic of Nigeria
                </div>
                <h2 className="text-base sm:text-xl font-serif font-bold text-slate-900 mt-1">
                  {deedListing.approvalStatus === 'waiting_admin_approval'
                    ? 'LAND APPLICATION RECORD (WAITING FOR ADMIN APPROVAL)'
                    : 'CERTIFICATE OF OCCUPANCY (APPROVED FOR TRANSFER)'}
                </h2>
                <div className="text-[11px] sm:text-xs font-mono text-amber-800 mt-1">
                  Issued pursuant to Land Use Act (1978) · Title Ref #{deedListing.cadastralRef}
                </div>
              </div>

              <div className="py-4 sm:py-5 space-y-4 text-xs">
                <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-amber-200 bg-slate-950">
                  <LandRegistrySnapshot
                    coordinates={deedCoords}
                    cadastralRef={deedListing.cadastralRef}
                    areaSqm={deedListing.areaSqm}
                    stateName={deedListing.state}
                    title={deedListing.title}
                    snapshotUrl={deedListing.imageUrl || undefined}
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

                <div className="bg-amber-100/70 p-3.5 rounded-xl border border-amber-300/80 space-y-1.5 text-[11px]">
                  <div className="font-bold uppercase tracking-wider text-amber-900 text-[10px]">
                    Geographical Area &amp; Survey Geometry Direction
                  </div>
                  <div className="text-slate-900 leading-relaxed">{deedGeo.fullDescription}</div>
                  <div className="font-mono text-[10px] text-amber-950 break-words">
                    {deedGeo.edgeSummary}
                  </div>
                </div>

                <div className="bg-white/80 p-3.5 sm:p-4 rounded-xl border border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
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
                  {deedListing.sellerWallet && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Seller&apos;s Receiving Wallet:</span>
                      <div className="font-mono font-bold text-slate-900 break-all">
                        {deedListing.sellerWallet}
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">Digital Verification Hash:</span>
                    <div className="font-mono font-bold text-emerald-800 truncate">
                      {deedListing.spatialHash}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t-2 border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={ASSET_IMAGES.titleSeal}
                    alt="Official Seal"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 object-contain shrink-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Registrar of Deeds Seal</div>
                    <div className="text-[10px] text-slate-500">Zero Encumbrance · Ready for Transfer</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  {deedListing.approvalStatus === 'waiting_admin_approval' ? (
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 bg-amber-200 text-amber-900 text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-not-allowed"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Waiting for admin approval</span>
                    </button>
                  ) : (
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
                  )}
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
        );
      })()}

      {/* BUY / RESERVE LAND MODAL (PERSISTED TO SUPABASE) */}
      {buyListing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-900 text-slate-100 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl max-h-[92vh] overflow-y-auto my-auto">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Reserve &amp; Purchase Verified Land</h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {buyListing.title} · {buyListing.cadastralRef}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuyListing(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Close purchase modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submittedRef ? (
              <div className="p-4 sm:p-6 space-y-4">
                <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 min-w-0">
                    <div className="text-sm font-bold text-white">
                      Purchase Reservation Recorded
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your verified acquisition request for <strong className="text-white">{submittedRef}</strong> ({formatUsd(buyListing.priceUsd)} USD) has been lodged with the Anagu Escrow &amp; Title Transfer Desk.
                    </p>
                    {(connectedWallet || paymentTxHash || buyListing.sellerWallet) && (
                      <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-300 space-y-1">
                        {buyListing.sellerWallet && (
                          <div className="truncate font-mono">
                            Seller Wallet: {buyListing.sellerWallet}
                          </div>
                        )}
                        {connectedWallet && (
                          <div className="truncate">
                            Buyer Wallet: <span className="font-mono font-semibold">{connectedWallet.address}</span>
                          </div>
                        )}
                        {paymentTxHash && (
                          <div className="truncate font-mono text-[10px] text-emerald-200">
                            {settlementAsset === 'ANAGU'
                              ? `ANAGU Escrow #${escrowId || 'Confirmed'} (${paymentEthAmount} ANAGU): `
                              : `Polygon Amoy Payment (${paymentEthAmount} POL): `}
                            <a
                              href={getPolygonAmoyTxUrl(paymentTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-white"
                            >
                              {paymentTxHash}
                            </a>
                          </div>
                        )}
                        {walletSignature && (
                          <div className="truncate font-mono text-[10px] text-emerald-400">
                            Signature Proof: {walletSignature}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBuyListing(null)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitPurchase} className="p-4 sm:p-6 space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-16 sm:w-20 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-800 bg-slate-900">
                    <LandRegistrySnapshot
                      coordinates={
                        buyListing.coordinates && buyListing.coordinates.length >= 3
                          ? buyListing.coordinates
                          : getDefaultPolygonForState(buyListing.state)
                      }
                      cadastralRef={buyListing.cadastralRef}
                      areaSqm={buyListing.areaSqm}
                      stateName={buyListing.state}
                      snapshotUrl={buyListing.imageUrl || undefined}
                      compact={true}
                    />
                  </div>
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
                    <div className="text-sm sm:text-base font-extrabold text-emerald-400 tabular-nums">
                      {formatUsd(buyListing.priceUsd)}
                    </div>
                  </div>
                </div>

                {/* Web3 Wallet Trigger & Connection Section */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-white">
                        Web3 Wallet Authorization
                      </span>
                    </div>
                    {connectedWallet ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConnectedWallet(null);
                          setWalletSignature(null);
                          setWalletStatus(discoveredWallets.length > 0 ? 'idle' : 'no_provider');
                        }}
                        className="text-[11px] text-slate-400 hover:text-white transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void triggerWalletConnection()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{discoveredWallets.length > 0 ? 'Trigger Wallet' : 'Detect Wallets'}</span>
                      </button>
                    )}
                  </div>

                  {walletStatus === 'connecting' && (
                    <div className="flex items-center gap-2.5 text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2.5">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        Waiting for wallet approval on your PC extension or mobile wallet app...
                      </span>
                    </div>
                  )}

                  {walletStatus === 'signing' && (
                    <div className="flex items-center gap-2.5 text-xs text-sky-300 bg-sky-950/30 border border-sky-500/30 rounded-lg px-3 py-2.5">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        Check your Web3 wallet to sign the parcel purchase authorization...
                      </span>
                    </div>
                  )}

                  {/* Seller's Registered Receiving Wallet */}
                  {buyListing.sellerWallet && (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                          Seller&apos;s Receiving Wallet
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopySellerWallet(buyListing.sellerWallet)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          {copiedSellerWallet ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Address</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className="font-mono text-[11px] font-semibold text-emerald-300 break-all"
                        title={buyListing.sellerWallet}
                      >
                        {buyListing.sellerWallet}
                      </div>

                      {connectedWallet && isValidEvmAddress(buyListing.sellerWallet) && (
                        <div className="pt-2 border-t border-slate-800 space-y-2.5">
                          {/* Statutory Due-Process Escrow Notice */}
                          <div className="text-[10px] text-slate-300 bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-2 leading-relaxed">
                            <span className="font-semibold text-emerald-300">Statutory Due Process:</span>{' '}
                            LandTitleNFT #{buyListing.tokenId} blocks direct P2P transfers under the Land Use Act. Locking{' '}
                            <strong className="text-white">ANAGU</strong> in smart-contract escrow protects your funds until the Ministry Registrar executes{' '}
                            <code className="font-mono text-emerald-300">registryTransfer()</code>.
                            {contractConfig.landTitleNftAddress && (
                              <a
                                href={getPolygonAmoyAddressUrl(contractConfig.landTitleNftAddress)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-emerald-400 hover:underline"
                              >
                                <span>NFT Contract</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          {/* Settlement Asset & Mode Selector */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                            <div className="inline-flex rounded-md bg-slate-950 border border-slate-800 p-0.5">
                              <button
                                type="button"
                                onClick={() => handleSelectSettlementAsset('ANAGU')}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                                  settlementAsset === 'ANAGU'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                <Coins className="w-3 h-3" />
                                <span>ANAGU Escrow</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectSettlementAsset('POL')}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  settlementAsset === 'POL'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Native POL
                              </button>
                            </div>

                            <div className="inline-flex rounded-md bg-slate-950 border border-slate-800 p-0.5">
                              <button
                                type="button"
                                onClick={() => handleSelectPaymentMode('full')}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  paymentMode === 'full'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Full Price
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectPaymentMode('deposit')}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  paymentMode === 'deposit'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                10% Deposit
                              </button>
                            </div>
                          </div>

                          {settlementAsset === 'ANAGU' && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                              <span className="text-slate-400">
                                {contractConfig.anaguTokenAddress ? (
                                  <>
                                    Balance:{' '}
                                    <strong className="font-mono text-emerald-300">
                                      {buyerTokenStatus?.balanceFormatted ?? '0'} ANAGU
                                    </strong>{' '}
                                    (1 ANAGU ≈ ${ANAGU_USD_REFERENCE_RATE} USD)
                                  </>
                                ) : (
                                  <span className="text-amber-300">
                                    AnaguToken contract address not configured yet — configure it in Admin Portal or use Native POL.
                                  </span>
                                )}
                              </span>
                              {contractConfig.anaguTokenAddress &&
                                buyerTokenStatus?.testnetFaucetEnabled !== false && (
                                  <button
                                    type="button"
                                    disabled={isClaimingTestAnagu}
                                    onClick={() => void handleClaimBuyerTestnetAnagu()}
                                    className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-semibold disabled:opacity-50"
                                  >
                                    {isClaimingTestAnagu ? 'Claiming...' : 'Claim 1,000 ANAGU'}
                                  </button>
                                )}
                            </div>
                          )}

                          {settlementAsset === 'POL' && (
                            <div className="text-[10px] text-slate-400">
                              Polygon Amoy Native Settlement (Ref: 1 POL ≈ ${POL_USD_REFERENCE_RATE.toFixed(2)} USD)
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={paymentEthAmount}
                                onChange={(e) => {
                                  if (/^[0-9.]*$/.test(e.target.value)) {
                                    setPaymentEthAmount(e.target.value);
                                  }
                                }}
                                aria-label={`${settlementAsset} amount to pay for land`}
                                className="w-full px-2.5 py-2 sm:py-1.5 pr-14 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg font-mono text-xs text-white outline-none"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-400 pointer-events-none">
                                {settlementAsset}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={
                                isSendingPayment ||
                                Boolean(paymentTxHash) ||
                                (settlementAsset === 'ANAGU' && !contractConfig.anaguTokenAddress)
                              }
                              onClick={() => void handlePaySellerWallet()}
                              className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 transition-colors"
                            >
                              {isSendingPayment ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>{settlementAsset === 'ANAGU' ? 'Locking Escrow...' : 'Sending POL...'}</span>
                                </>
                              ) : paymentTxHash ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{settlementAsset === 'ANAGU' ? 'Escrow Funded' : 'Paid'}</span>
                                </>
                              ) : (
                                <>
                                  <Wallet className="w-3.5 h-3.5" />
                                  <span>
                                    {settlementAsset === 'ANAGU'
                                      ? 'Lock ANAGU Escrow'
                                      : 'Pay POL on Polygon'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>

                          {paymentTxHash && (
                            <a
                              href={getPolygonAmoyTxUrl(paymentTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 text-[10px] font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-md px-2.5 py-1.5 hover:bg-emerald-950/70"
                            >
                              <span className="truncate">
                                {settlementAsset === 'ANAGU'
                                  ? `Escrow #${escrowId || 'Confirmed'} Locked · Tx: ${paymentTxHash}`
                                  : `POL Sent · Tx: ${paymentTxHash}`}
                              </span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {connectedWallet && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 bg-emerald-950/30 border border-emerald-500/30 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-emerald-300 truncate">
                            Buyer: {connectedWallet.walletName} · {connectedWallet.chainName}
                          </div>
                          <div className="text-xs font-mono font-bold text-white">
                            {truncateAddress(connectedWallet.address)}
                          </div>
                        </div>
                        {walletSignature ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 shrink-0">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Signed</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSignPurchaseOnly}
                            disabled={walletStatus === 'signing'}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-60 text-[11px] font-semibold text-slate-200 shrink-0 transition-colors"
                          >
                            Sign Intent
                          </button>
                        )}
                      </div>

                      {discoveredWallets.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 mr-1">Switch wallet:</span>
                          {discoveredWallets.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => void triggerWalletConnection(w)}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                                connectedWallet.walletName === w.name
                                  ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
                                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300'
                              }`}
                            >
                              {w.icon && (
                                <img src={w.icon} alt="" className="w-3.5 h-3.5 rounded-xs" />
                              )}
                              <span>{w.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!connectedWallet && discoveredWallets.length > 0 && walletStatus !== 'connecting' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-400">
                        Detected Web3 wallets on this device. Select one to connect:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {discoveredWallets.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => void triggerWalletConnection(w)}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-left transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {w.icon ? (
                                <img src={w.icon} alt="" className="w-4 h-4 rounded-xs shrink-0" />
                              ) : (
                                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                              )}
                              <span className="text-xs font-semibold text-white truncate">
                                {w.name}
                              </span>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!connectedWallet &&
                    (walletStatus === 'no_provider' || discoveredWallets.length === 0) &&
                    walletStatus !== 'connecting' && (
                      <div className="space-y-2.5">
                        <div className="flex items-start gap-2 text-[11px] text-slate-300">
                          <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                          <span>
                            {isMobile
                              ? 'Open this purchase inside your mobile Web3 wallet app to sign with your wallet:'
                              : 'No browser wallet extension was detected. Launch a mobile wallet via deep-link or enable a PC wallet (MetaMask, Rabby, Coinbase, Trust) and click Detect Wallets:'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {mobileLinks.map((walletLink) => (
                            <a
                              key={walletLink.id}
                              href={walletLink.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${walletLink.accentClass}`}
                            >
                              <span className="truncate">{walletLink.name}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                            </a>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={handleCopyDappUrl}
                            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors"
                          >
                            {copiedDappUrl ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">DApp link copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy URL for any mobile wallet browser</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                  {walletError && (
                    <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-600/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <span>{walletError}</span>
                      {!connectedWallet && discoveredWallets.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void triggerWalletConnection()}
                          className="text-xs font-bold text-amber-200 underline shrink-0"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
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
                    disabled={
                      isSubmitting ||
                      isSendingPayment ||
                      walletStatus === 'connecting' ||
                      walletStatus === 'signing'
                    }
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    {walletStatus === 'signing'
                      ? 'Waiting for Wallet Sign...'
                      : isSubmitting
                        ? 'Submitting...'
                        : paymentTxHash
                          ? 'Complete Purchase Receipt'
                          : connectedWallet && !walletSignature
                            ? 'Sign with Wallet & Submit'
                            : 'Submit Purchase Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* REGISTERED PARCEL SNAPSHOT INSPECTOR MODAL */}
      {fullMapListing && (() => {
        const inspectCoords =
          fullMapListing.coordinates && fullMapListing.coordinates.length >= 3
            ? fullMapListing.coordinates
            : getDefaultPolygonForState(fullMapListing.state);
        const inspectGeo = describeParcelGeography({
          state: fullMapListing.state,
          lga: fullMapListing.lga,
          district: fullMapListing.district,
          coordinates: inspectCoords,
          areaSqm: fullMapListing.areaSqm
        });
        return (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] my-auto">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950">
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    Registered Land Survey Snapshot · {fullMapListing.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                    {fullMapListing.district}, {fullMapListing.lga}, {fullMapListing.state} · {fullMapListing.areaSqm.toLocaleString()} m² · Ref {fullMapListing.cadastralRef}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFullMapListing(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Close snapshot preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 sm:p-4 bg-slate-950/70 overflow-y-auto space-y-3">
                <div className="w-full aspect-[4/3] max-h-[46vh] mx-auto rounded-xl overflow-hidden border border-slate-800">
                  <LandRegistrySnapshot
                    coordinates={inspectCoords}
                    cadastralRef={fullMapListing.cadastralRef}
                    areaSqm={fullMapListing.areaSqm}
                    stateName={fullMapListing.state}
                    title={fullMapListing.title}
                    snapshotUrl={fullMapListing.imageUrl || undefined}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400">
                      Geographical Area Profile
                    </div>
                    <div className="font-semibold text-white">
                      {inspectGeo.geopoliticalZone} · {fullMapListing.lga}, {fullMapListing.state}
                    </div>
                    <div className="text-[11px] text-slate-300">{inspectGeo.terrainProfile}</div>
                    <div className="text-[10px] font-mono text-emerald-400">
                      {inspectGeo.relativePosition}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400">
                      Geometry Direction &amp; Boundary Span
                    </div>
                    <div className="font-semibold text-white">{inspectGeo.primaryOrientation}</div>
                    <div className="text-[11px] font-mono text-slate-300">
                      Span: {inspectGeo.dimensionsLabel}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 break-words">
                      {inspectGeo.edgeSummary}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-5 py-3.5 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  Asking Price:{' '}
                  <strong className="text-emerald-400 text-sm tabular-nums">
                    {formatUsd(fullMapListing.priceUsd)}
                  </strong>{' '}
                  · Surveyed boundary with beacon monuments (PB1–PB4)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = fullMapListing;
                      setFullMapListing(null);
                      setDeedListing(target);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Deed</span>
                  </button>
                  {fullMapListing.approvalStatus === 'waiting_admin_approval' ? (
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 bg-amber-950/60 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-not-allowed"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Waiting for admin approval</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const target = fullMapListing;
                        setFullMapListing(null);
                        openBuyModal(target);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <span>Buy Land</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
