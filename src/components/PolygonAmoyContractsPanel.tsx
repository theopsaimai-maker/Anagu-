import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  ExternalLink,
  Key,
  Loader2,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import {
  clearLocalContractAddresses,
  getContractConfig,
  getPolygonAmoyAddressUrl,
  getPolygonAmoyTxUrl,
  saveLocalContractAddresses
} from '../config/contracts';
import {
  ConnectedWalletResult,
  connectWeb3Wallet,
  discoverWalletsOnce,
  formatWalletError,
  truncateAddress
} from '../lib/web3Wallet';
import {
  executeRegistryTransferOnChain,
  mintLandTitleNftOnChain,
  recordOracleAttestationOnChain,
  releaseLandPurchaseEscrowOnChain
} from '../lib/anaguContracts';
import type { ParcelRecord } from '../types/anagu';

interface Props {
  parcels: ParcelRecord[];
  onParcelMinted?: (parcelId: string, tokenId: number, txHash: string) => void;
}

export const PolygonAmoyContractsPanel: React.FC<Props> = ({ parcels, onParcelMinted }) => {
  const [config, setConfig] = useState(() => getContractConfig());
  const [isEditing, setIsEditing] = useState(
    () => !config.anaguTokenAddress || !config.landTitleNftAddress
  );
  const [tokenInput, setTokenInput] = useState(config.anaguTokenAddress);
  const [nftInput, setNftInput] = useState(config.landTitleNftAddress);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Connected Registrar / Oracle Polygon Amoy Wallet
  const [wallet, setWallet] = useState<ConnectedWalletResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // On-chain statutory execution helper state
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[0]?.id || '');
  const [transferBuyerWallet, setTransferBuyerWallet] = useState('');
  const [transferEscrowId, setTransferEscrowId] = useState('');
  const [isExecutingChain, setIsExecutingChain] = useState(false);
  const [chainResult, setChainResult] = useState<{ text: string; txHash?: string } | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const selectedParcel = useMemo(
    () => parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null,
    [parcels, selectedParcelId]
  );

  const handleSaveAddresses = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveLocalContractAddresses({
      anaguTokenAddress: tokenInput,
      landTitleNftAddress: nftInput
    });
    if (!res.ok || !res.config) {
      setSaveMessage({ type: 'error', text: res.error || 'Invalid Polygon address format.' });
      return;
    }
    setConfig(res.config);
    setIsEditing(false);
    setSaveMessage({
      type: 'success',
      text: 'Saved Polygon Amoy Testnet contract addresses. Citizen Registration and Access Lands checkout now use these contracts.'
    });
  };

  const handleResetOverrides = () => {
    clearLocalContractAddresses();
    const refreshed = getContractConfig();
    setConfig(refreshed);
    setTokenInput(refreshed.anaguTokenAddress);
    setNftInput(refreshed.landTitleNftAddress);
    setSaveMessage({ type: 'success', text: 'Reverted to environment / deployment manifest addresses.' });
  };

  const handleConnectRegistrarWallet = async () => {
    setChainError(null);
    setIsConnecting(true);
    try {
      const wallets = await discoverWalletsOnce(180);
      if (wallets.length === 0) {
        setChainError('No browser wallet detected. Open MetaMask, Rabby, or Trust Wallet to execute on-chain Registrar transactions.');
        return;
      }
      const connected = await connectWeb3Wallet(wallets[0], {
        enforcePolygon: true,
        targetNetwork: 'amoy'
      });
      setWallet(connected);
    } catch (err) {
      setChainError(formatWalletError(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOnChainAttestAndMint = async () => {
    if (!wallet || !selectedParcel) return;
    if (!selectedParcel.sellerWallet) {
      setChainError('Selected parcel has no registered owner/seller Polygon wallet address.');
      return;
    }
    setChainError(null);
    setChainResult(null);
    setIsExecutingChain(true);
    try {
      await recordOracleAttestationOnChain({
        provider: wallet.provider,
        parcelId: selectedParcel.id,
        attestationSummary: `oracle:${selectedParcel.cadastralRef}:${selectedParcel.applicantNin}`
      });
      const minted = await mintLandTitleNftOnChain({
        provider: wallet.provider,
        recipient: selectedParcel.sellerWallet,
        parcelId: selectedParcel.id,
        cadastralRef: selectedParcel.cadastralRef,
        spatialHash: selectedParcel.spatialHash,
        documentHash: selectedParcel.documentHash
      });
      onParcelMinted?.(selectedParcel.id, minted.tokenId, minted.txHash);
      setChainResult({
        text: `Minted AnaguLandTitleNFT #${minted.tokenId} for ${selectedParcel.cadastralRef} on Polygon Amoy.`,
        txHash: minted.txHash
      });
    } catch (err) {
      setChainError(err instanceof Error ? err.message : 'On-chain mint failed.');
    } finally {
      setIsExecutingChain(false);
    }
  };

  const handleExecuteStatutoryTransfer = async () => {
    if (!wallet || !selectedParcel) return;
    if (!selectedParcel.tokenId) {
      setChainError('Selected parcel does not have an on-chain Token ID yet.');
      return;
    }
    if (!transferBuyerWallet.trim()) {
      setChainError('Enter the verified buyer Polygon (0x...) wallet address.');
      return;
    }
    setChainError(null);
    setChainResult(null);
    setIsExecutingChain(true);
    try {
      const instrumentRef = `DEED-ASSIGNMENT:${selectedParcel.cadastralRef}:${Date.now()}`;
      const transferRes = await executeRegistryTransferOnChain({
        provider: wallet.provider,
        tokenId: selectedParcel.tokenId,
        newOwner: transferBuyerWallet.trim(),
        instrumentRef
      });

      let escrowMsg = '';
      if (transferEscrowId.trim() && config.anaguTokenAddress) {
        await releaseLandPurchaseEscrowOnChain({
          provider: wallet.provider,
          escrowId: transferEscrowId.trim(),
          instrumentRef
        });
        escrowMsg = ` + Released ANAGU Escrow #${transferEscrowId.trim()} to seller.`;
      }

      setChainResult({
        text: `Executed statutory registryTransfer for Token #${selectedParcel.tokenId} to ${truncateAddress(
          transferBuyerWallet.trim()
        )}${escrowMsg}`,
        txHash: transferRes.txHash
      });
      setTransferBuyerWallet('');
      setTransferEscrowId('');
    } catch (err) {
      setChainError(err instanceof Error ? err.message : 'Statutory registry transfer failed.');
    } finally {
      setIsExecutingChain(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Polygon Amoy Smart Contracts</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                Chain ID {config.chainId}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              AnaguToken (ERC-20 Registration Fee &amp; Purchase Escrow) + AnaguLandTitleNFT (ERC-721 Statutory Title)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            {isEditing ? 'Hide Config' : 'Configure Addresses'}
          </button>

          <button
            type="button"
            disabled={isConnecting}
            onClick={() => void handleConnectRegistrarWallet()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>
              {isConnecting
                ? 'Connecting...'
                : wallet
                ? `Registrar: ${truncateAddress(wallet.address)}`
                : 'Connect Registrar Wallet'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Contract Address Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              AnaguToken (ERC-20 · ANAGU)
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                config.anaguTokenAddress
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {config.anaguTokenAddress ? 'Configured' : 'Awaiting Deployment'}
            </span>
          </div>
          {config.anaguTokenAddress ? (
            <a
              href={getPolygonAmoyAddressUrl(config.anaguTokenAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-emerald-300 hover:underline inline-flex items-center gap-1 break-all"
            >
              <span>{config.anaguTokenAddress}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <p className="text-[11px] text-slate-400">
              Run <code className="font-mono text-slate-200">cd contracts &amp;&amp; npm run deploy:amoy</code> or deploy via Remix, then paste the address here.
            </p>
          )}
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              AnaguLandTitleNFT (ERC-721 · ANAGU-TITLE)
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                config.landTitleNftAddress
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {config.landTitleNftAddress ? 'Configured' : 'Awaiting Deployment'}
            </span>
          </div>
          {config.landTitleNftAddress ? (
            <a
              href={getPolygonAmoyAddressUrl(config.landTitleNftAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-emerald-300 hover:underline inline-flex items-center gap-1 break-all"
            >
              <span>{config.landTitleNftAddress}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <p className="text-[11px] text-slate-400">
              Enforces Oracle pre-mint attestation, P2P transfer lock, Registrar transfers, and Section 28 revocation.
            </p>
          )}
        </div>
      </div>

      {/* Inline Address Configuration Form */}
      {isEditing && (
        <form
          onSubmit={handleSaveAddresses}
          className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-slate-300 font-medium">AnaguToken Polygon Amoy Address</span>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg font-mono text-xs text-white outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-300 font-medium">AnaguLandTitleNFT Polygon Amoy Address</span>
              <input
                type="text"
                value={nftInput}
                onChange={(e) => setNftInput(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg font-mono text-xs text-white outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              Addresses can also be persisted via <code className="font-mono">VITE_ANAGU_TOKEN_ADDRESS</code> &amp;{' '}
              <code className="font-mono">VITE_ANAGU_LAND_TITLE_NFT_ADDRESS</code>.
            </span>
            <div className="flex items-center gap-2">
              {config.source === 'admin_override' && (
                <button
                  type="button"
                  onClick={handleResetOverrides}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Reset
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Save Amoy Addresses
              </button>
            </div>
          </div>
        </form>
      )}

      {saveMessage && (
        <div
          className={`text-xs px-3 py-2 rounded-lg border ${
            saveMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/40 border-red-500/30 text-red-300'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Registrar On-Chain Execution Desk (Visible when wallet & NFT contract are ready) */}
      {wallet && config.landTitleNftAddress && parcels.length > 0 && (
        <div className="bg-slate-950 border border-emerald-500/25 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Registrar On-Chain Execution Desk ({wallet.chainName})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <select
              value={selectedParcel?.id || ''}
              onChange={(e) => setSelectedParcelId(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-xs text-slate-100 outline-none"
            >
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cadastralRef} · {p.status.toUpperCase()} {p.tokenId ? `(#${p.tokenId})` : ''}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={transferBuyerWallet}
              onChange={(e) => setTransferBuyerWallet(e.target.value)}
              placeholder="Buyer 0x... wallet (for registryTransfer)"
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-xs text-slate-100 outline-none"
            />

            <input
              type="text"
              value={transferEscrowId}
              onChange={(e) => setTransferEscrowId(e.target.value)}
              placeholder="Optional ANAGU Escrow ID to release"
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-xs text-slate-100 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExecutingChain || !selectedParcel}
              onClick={() => void handleOnChainAttestAndMint()}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5"
            >
              {isExecutingChain ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Key className="w-3.5 h-3.5" />
              )}
              <span>Attest &amp; Mint LandTitleNFT</span>
            </button>

            <button
              type="button"
              disabled={isExecutingChain || !selectedParcel?.tokenId || !transferBuyerWallet.trim()}
              onClick={() => void handleExecuteStatutoryTransfer()}
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Execute registryTransfer &amp; Release Escrow</span>
            </button>
          </div>
        </div>
      )}

      {chainError && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300">
          {chainError}
        </div>
      )}

      {chainResult && (
        <div className="text-xs px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex flex-wrap items-center justify-between gap-2">
          <span>{chainResult.text}</span>
          {chainResult.txHash && (
            <a
              href={getPolygonAmoyTxUrl(chainResult.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono underline hover:text-white"
            >
              <span>View on Polygonscan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};
