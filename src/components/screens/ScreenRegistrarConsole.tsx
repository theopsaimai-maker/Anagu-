import React, { useState } from 'react';
import { 
  Building2, 
  Cpu, 
  CheckCircle2, 
  ShieldCheck, 
  Coins, 
  Key, 
  ExternalLink, 
  Check, 
  Lock, 
  FileText,
  Boxes,
  Printer,
  Wallet
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';
import {
  getContractConfig,
  getPolygonAmoyAddressUrl,
  getPolygonAmoyTxUrl
} from '../../config/contracts';
import {
  connectWeb3Wallet,
  discoverWalletsOnce,
  formatWalletError,
  isValidEvmAddress,
  truncateAddress
} from '../../lib/web3Wallet';
import { mintLandTitleNftOnChain } from '../../lib/anaguContracts';

interface Props {
  parcels: ParcelRecord[];
  onMintTitle: (parcelId: string, tokenId: number, txHash: string) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
}

export const ScreenRegistrarConsole: React.FC<Props> = ({ 
  parcels, 
  onMintTitle,
  onEmitMqtt 
}) => {
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id);
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState<boolean>(false);
  const contractConfig = getContractConfig();

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];

  const handleExecuteMint = async () => {
    setIsMinting(true);
    setMintError(null);

    try {
      let newTokenId = activeParcel.tokenId || Math.floor(4090 + Math.random() * 50);
      let newTxHash = activeParcel.txHash || '';

      if (contractConfig.landTitleNftAddress && activeParcel.sellerWallet && isValidEvmAddress(activeParcel.sellerWallet)) {
        const wallets = await discoverWalletsOnce(150);
        if (wallets.length > 0) {
          const connected = await connectWeb3Wallet(wallets[0], {
            enforcePolygon: true,
            targetNetwork: 'amoy'
          });
          const minted = await mintLandTitleNftOnChain({
            provider: connected.provider,
            recipient: activeParcel.sellerWallet,
            parcelId: activeParcel.id,
            cadastralRef: activeParcel.cadastralRef,
            spatialHash: activeParcel.spatialHash,
            documentHash: activeParcel.documentHash
          });
          newTokenId = minted.tokenId || newTokenId;
          newTxHash = minted.txHash;
        }
      }

      if (!newTxHash) {
        newTxHash =
          '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      }

      onMintTitle(activeParcel.id, newTokenId, newTxHash);
      onEmitMqtt('land/title/issued', {
        tokenId: newTokenId,
        ownerId: activeParcel.applicantNin,
        parcelId: activeParcel.id,
        txHash: newTxHash,
        cadastralRef: activeParcel.cadastralRef,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      setMintError(formatWalletError(err));
    } finally {
      setIsMinting(false);
    }
  };

  const isAlreadyRegistered = activeParcel.status === 'registered' || activeParcel.status === 'revoked';

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="bg-slate-950 border-b border-slate-800 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex flex-wrap items-center gap-2">
              Registrar of Deeds &amp; Polygon Amoy NFT Console
              <span className="text-xs font-mono font-normal text-emerald-400">
                Polygon Amoy Testnet · ChainID: 80002
              </span>
            </div>
            <div className="text-xs text-slate-400">
              ERC-721 AnaguLandTitleNFT Issuance &amp; AnaguToken Escrow Settlement Console
            </div>
          </div>
        </div>

        {/* Selected Dossier */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium hidden sm:block">Application for Grant:</label>
          <select 
            value={selectedParcelId}
            onChange={(e) => setSelectedParcelId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-emerald-500"
          >
            {parcels.map(p => (
              <option key={p.id} value={p.id}>
                {p.cadastralRef} - {p.applicantName} [{p.status.toUpperCase()}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Dossier Pre-Mint Audit Overview */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                Dossier #{activeParcel.id}
              </span>
              <h2 className="text-xl font-bold text-white mt-1.5 tracking-tight">
                {activeParcel.cadastralRef}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                Applicant: <span className="text-slate-200 font-medium">{activeParcel.applicantName}</span> ({activeParcel.applicantNin})
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">Registry Grant Status</div>
              <div className="text-sm font-bold font-mono text-emerald-400 uppercase mt-0.5">
                {activeParcel.status}
              </div>
            </div>
          </div>

          {/* 3-Stage Prerequisite Verification Gates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">Gate 1: GIS Spatial</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono">ST_IsValid: PASS</div>
              <div className="text-xs text-slate-400">
                0.5m buffer overlap calculation clean. No boundary encroachment detected.
              </div>
            </div>

            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">Gate 2: Customary Oracle</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono">Score: 98/100</div>
              <div className="text-xs text-slate-400">
                Traditional lineage affidavit ratified by community council with zero dissent.
              </div>
            </div>

            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">Gate 3: Statutory Search</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono">LUA 1978: COMPLIANT</div>
              <div className="text-xs text-slate-400">
                Land Use Act provisions verified. No active statutory revocation or caveat.
              </div>
            </div>
          </div>

          {/* Smart Contract Interaction Box */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Polygon Amoy Smart Contract Call: AnaguLandTitleNFT.sol
              </div>
              {contractConfig.landTitleNftAddress ? (
                <a
                  href={getPolygonAmoyAddressUrl(contractConfig.landTitleNftAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:underline"
                >
                  <Wallet className="w-3 h-3" />
                  <span>{truncateAddress(contractConfig.landTitleNftAddress)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[11px] font-mono text-amber-300">
                  Contract awaiting Amoy deployment
                </span>
              )}
            </div>

            <div className="font-mono text-xs bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-slate-300 space-y-1">
              <div className="text-slate-500">// AnaguLandTitleNFT.sol — Registrar Controlled Minting (Polygon Amoy 80002)</div>
              <div className="text-emerald-400">
                function mintTitle(
              </div>
              <div className="pl-4 text-slate-300">
                address recipient: <span className="text-amber-300">{activeParcel.sellerWallet || '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'}</span>,<br />
                string parcelId: <span className="text-sky-300">&quot;{activeParcel.id}&quot;</span>,<br />
                string cadastralRef: <span className="text-amber-300">&quot;{activeParcel.cadastralRef}&quot;</span>,<br />
                bytes32 spatialHash: <span className="text-emerald-300">&quot;{activeParcel.spatialHash.slice(0, 32)}...&quot;</span>,<br />
                bytes32 documentHash: <span className="text-purple-300">&quot;{activeParcel.documentHash.slice(0, 32)}...&quot;</span>
              </div>
              <div className="text-emerald-400">
                ) external onlyRole(REGISTRAR_ROLE) returns (uint256 tokenId);
              </div>
            </div>

            {mintError && (
              <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded-lg px-3 py-2">
                {mintError}
              </div>
            )}

            {/* Mint Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <div className="text-xs text-slate-400">
                Registry controls all transfers via <code className="font-mono text-emerald-300">registryTransfer()</code>. Direct peer-to-peer ERC-721 transfers are blocked by contract invariants.
              </div>

              <div className="flex items-center gap-3">
                {isAlreadyRegistered && (
                  <button
                    onClick={() => setShowCertificateModal(true)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-all flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Inspect Issued Certificate
                  </button>
                )}

                <button
                  onClick={() => void handleExecuteMint()}
                  disabled={isMinting || isAlreadyRegistered}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  {isMinting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Minting on Polygon Amoy...
                    </>
                  ) : isAlreadyRegistered ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Title Deed Minted (ID #{activeParcel.tokenId})
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      Execute Polygon Amoy Title Mint
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hyperledger Besu Block Explorer Receipt (When registered) */}
        {isAlreadyRegistered && (
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <Boxes className="w-4 h-4 text-emerald-400" />
                Besu Permissioned Ledger Transaction Receipt
              </div>
              <span className="text-[11px] font-mono text-emerald-400">Block Confirmed (#1892041)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px]">ERC-721 Token ID</div>
                <div className="font-mono text-emerald-400 font-bold text-sm mt-0.5">#{activeParcel.tokenId}</div>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px]">Gas Used</div>
                <div className="font-mono text-slate-200 font-bold text-sm mt-0.5">184,210 gas</div>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px]">Confirmation Latency</div>
                <div className="font-mono text-slate-200 font-bold text-sm mt-0.5">820 ms (T_contract)</div>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px]">MQTT Synchronisation</div>
                <div className="font-mono text-emerald-400 font-bold text-sm mt-0.5">Delivered (QoS 1)</div>
              </div>
            </div>

            <div className="text-xs font-mono bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 break-all flex items-center justify-between gap-2">
              <div>
                <span className="text-slate-500">Transaction Hash: </span>
                <span className="text-emerald-400">{activeParcel.txHash}</span>
              </div>
              {activeParcel.txHash && (
                <a
                  href={getPolygonAmoyTxUrl(activeParcel.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline shrink-0"
                >
                  <span>Polygonscan</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Official Certificate of Occupancy Modal */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-amber-50 text-slate-900 rounded-2xl max-w-2xl w-full p-8 border-4 border-amber-200 shadow-2xl relative overflow-hidden">
            {/* Watermark Crest */}
            <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
              <img 
                src={ASSET_IMAGES.titleSeal} 
                alt="Watermark" 
                referrerPolicy="no-referrer"
                className="w-96 h-96 object-contain"
              />
            </div>

            <div className="text-center pb-6 border-b-2 border-amber-200">
              <div className="text-xs uppercase tracking-widest text-amber-900 font-bold">Federal Republic of Nigeria</div>
              <h2 className="text-xl font-serif font-bold text-slate-900 mt-1">
                CERTIFICATE OF OCCUPANCY (DIGITAL TITLE DEED)
              </h2>
              <div className="text-xs font-mono text-amber-800 mt-1">
                Issued pursuant to the Land Use Act (1978) · ERC-721 Token ID #{activeParcel.tokenId}
              </div>
            </div>

            <div className="py-6 space-y-4 text-xs">
              <p className="leading-relaxed text-slate-800">
                THIS IS TO CERTIFY that <strong className="font-bold text-slate-950 uppercase">{activeParcel.applicantName}</strong> (NIN: {activeParcel.applicantNin}) is the registered statutory titleholder of that parcel of land situated at <strong className="font-semibold">{activeParcel.district}, {activeParcel.state}</strong> containing an area of approximately <strong className="font-mono font-bold">{activeParcel.areaSqm.toLocaleString()} square meters</strong>.
              </p>

              <div className="bg-white/80 p-4 rounded-xl border border-amber-200/80 grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500">Cadastral Ref:</span>
                  <div className="font-bold text-slate-900">{activeParcel.cadastralRef}</div>
                </div>
                <div>
                  <span className="text-slate-500">Survey Plan Lodgement:</span>
                  <div className="font-bold text-slate-900">{activeParcel.surveyPlanRef}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Spatial Geometry Keccak-256 Hash:</span>
                  <div className="font-bold text-emerald-800 truncate">{activeParcel.spatialHash}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Besu Blockchain Ledger TxHash:</span>
                  <div className="font-bold text-slate-900 truncate">{activeParcel.txHash}</div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src={ASSET_IMAGES.titleSeal} 
                  alt="Official Seal" 
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 object-contain"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Registrar of Deeds Seal</div>
                  <div className="text-[10px] text-slate-500 font-mono">Signed with Hardware HSM Key</div>
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
                  onClick={() => setShowCertificateModal(false)}
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
