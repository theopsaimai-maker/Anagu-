import React, { useState } from 'react';
import { 
  Gavel, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  FileWarning, 
  KeyRound, 
  Ban, 
  Scale, 
  History,
  Lock,
  ArrowRight
} from 'lucide-react';
import { ParcelRecord, RevocationGround } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onRevokeTitle: (parcelId: string, ground: RevocationGround, gazetteNumber: string, reason: string) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
}

export const ScreenGovernorRevocation: React.FC<Props> = ({ 
  parcels, 
  onRevokeTitle,
  onEmitMqtt 
}) => {
  const titledParcels = parcels.filter(p => p.tokenId !== undefined);
  const [selectedParcelId, setSelectedParcelId] = useState<string>(titledParcels[0]?.id || parcels[0]?.id);
  const [ground, setGround] = useState<RevocationGround>('OverridingPublicInterest');
  const [gazetteNumber, setGazetteNumber] = useState<string>('State Gazette No. 48 Vol. 35 / Notice No. 1024');
  const [reason, setReason] = useState<string>('Construction of the Federal Intermodal Railway Logistics Hub and Ring Road Bypass Corridor.');
  const [governorKey, setGovernorKey] = useState<string>('0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (GOVERNOR_ROLE)');
  const [isRevoking, setIsRevoking] = useState<boolean>(false);
  const [revocationSuccess, setRevocationSuccess] = useState<boolean>(false);
  const [testTransferReverted, setTestTransferReverted] = useState<boolean>(false);

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];
  const isRevoked = activeParcel.status === 'revoked';

  const handleExecuteRevocation = () => {
    setIsRevoking(true);
    setTimeout(() => {
      onRevokeTitle(activeParcel.id, ground, gazetteNumber, reason);
      onEmitMqtt('land/title/revoked', {
        tokenId: activeParcel.tokenId,
        ground,
        revokedBy: governorKey,
        gazetteNumber,
        reason,
        timestamp: new Date().toISOString()
      });
      setIsRevoking(false);
      setRevocationSuccess(true);
      setTimeout(() => setRevocationSuccess(false), 4000);
    }, 900);
  };

  const handleTestTransferOnRevokedToken = () => {
    setTestTransferReverted(true);
    setTimeout(() => setTestTransferReverted(false), 3500);
  };

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-900/40 border border-red-500/50 text-red-400 flex items-center justify-center font-bold text-lg">
            <Gavel className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Executive Governor Suite — Statutory Title Revocation Chamber
              <span className="text-xs font-mono font-normal text-red-400">Land Use Act (1978) Section 28</span>
            </div>
            <div className="text-xs text-slate-400">
              Sovereign Executive Role-Based Authority · Immutable Audit Trail Event Emission
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium hidden sm:block">Select Target Title:</label>
          <select 
            value={selectedParcelId}
            onChange={(e) => setSelectedParcelId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-red-500"
          >
            {titledParcels.map(p => (
              <option key={p.id} value={p.id}>
                Token #{p.tokenId} - {p.cadastralRef} ({p.status.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Executive Header Banner */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-md grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-4 relative h-48 md:h-auto min-h-[160px]">
            <img 
              src={ASSET_IMAGES.governorDesk} 
              alt="Governor Executive Seal Desk" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-950/80 md:to-transparent" />
          </div>

          <div className="md:col-span-8 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-red-400 bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded uppercase">
                  GOVERNOR_ROLE Authorization Required
                </span>
                <span className="text-xs text-slate-400">Constitutional Statutory Executive Power</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-2">
                Section 28 Statutory Revocation for Token #{activeParcel.tokenId || 'N/A'} ({activeParcel.cadastralRef})
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Revocation under Section 28 of the Nigerian Land Use Act (1978) is strictly an executive statutory act reserved for the Governor. It cannot be triggered by private dispute tribunals. The invocation emits an immutable <code className="text-red-400 font-mono">TitleRevoked</code> blockchain event and permanently blocks any future ERC-721 token transfers.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Active Governor Key:</span>
              <span className="text-amber-400">{governorKey}</span>
            </div>
          </div>
        </div>

        {/* Revocation Parameters Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Statutory Form (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 rounded-xl border border-slate-800 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs text-slate-300 font-semibold uppercase tracking-wider">
              <Scale className="w-4 h-4 text-red-400" />
              Statutory Revocation Parameters (LUA 1978 Sec 28)
            </div>

            {/* Target Title Status Banner */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
              isRevoked 
                ? 'bg-red-950/40 border-red-600 text-red-300' 
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}>
              <div>
                <div className="font-bold text-sm">
                  {isRevoked ? 'TITLE IS STATUTORILY REVOKED' : 'TITLE IS ACTIVE ON BESU LEDGER'}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Holder: {activeParcel.applicantName} · Token ID #{activeParcel.tokenId}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded font-mono font-bold text-[10px] ${
                isRevoked ? 'bg-red-900 text-red-100' : 'bg-emerald-900 text-emerald-100'
              }`}>
                {isRevoked ? 'LOCKED / REVOKED' : 'UNREVOKED'}
              </span>
            </div>

            {/* Statutory Ground Selector */}
            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-slate-200">
                Statutory Ground for Revocation (Section 28 Subsection 2 & 3):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGround('OverridingPublicInterest')}
                  disabled={isRevoked}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    ground === 'OverridingPublicInterest' 
                      ? 'bg-red-950/50 border-red-500 text-white' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">Overriding Public Interest</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Public works, highways, railways, defense, or infrastructure utility under Sec 28(2).
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setGround('BreachOfStatutoryCondition')}
                  disabled={isRevoked}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    ground === 'BreachOfStatutoryCondition' 
                      ? 'bg-red-950/50 border-red-500 text-white' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">Breach of Statutory Condition</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Unlawful alienation, non-payment of rent, or violation of covenant under Sec 28(5).
                  </div>
                </button>
              </div>
            </div>

            {/* Gazette Reference */}
            <div className="text-xs space-y-1">
              <label className="block font-semibold text-slate-300">Official State Government Gazette Reference</label>
              <input 
                type="text"
                value={gazetteNumber}
                onChange={(e) => setGazetteNumber(e.target.value)}
                disabled={isRevoked}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-slate-200 focus:outline-red-500"
              />
            </div>

            {/* Justification Memo */}
            <div className="text-xs space-y-1">
              <label className="block font-semibold text-slate-300">Executive Statutory Order & Public Purpose Statement</label>
              <textarea 
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isRevoked}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-red-500 text-xs"
              />
            </div>

            {/* Revoke Action */}
            <div className="pt-2 flex items-center justify-between">
              <div className="text-[11px] text-slate-400 max-w-xs">
                Invoking revocation irreversibly marks the title on-chain and dispatches QoS 2 MQTT emergency broadcast.
              </div>

              <button
                onClick={handleExecuteRevocation}
                disabled={isRevoking || isRevoked || !activeParcel.tokenId}
                className="px-6 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
              >
                {isRevoking ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Executing Executive Order...
                  </>
                ) : isRevoked ? (
                  <>
                    <Ban className="w-4 h-4" />
                    Title Already Revoked
                  </>
                ) : (
                  <>
                    <Gavel className="w-4 h-4" />
                    Sign & Execute Statutory Revocation
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right: Solidity Contract Hook & Transfer Invariance Test (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Solidity Code Snapshot */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold uppercase tracking-wider">LandTitleNFT.sol Invariants</span>
                <span className="text-[11px] font-mono text-emerald-400">OpenZeppelin v5</span>
              </div>

              <div className="font-mono text-[11px] bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1 overflow-x-auto">
                <div className="text-slate-500">// Enforce Governor role and block transfers</div>
                <div className="text-red-400">
                  function revoke(uint256 tokenId, RevocationGround ground)<br />
                  &nbsp;&nbsp;external onlyRole(GOVERNOR_ROLE) {'{'}<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;require(!isRevoked[tokenId], "already revoked");<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;isRevoked[tokenId] = true;<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;emit TitleRevoked(tokenId, ground, msg.sender, block.timestamp);<br />
                  {'}'}
                </div>
                <div className="text-slate-500 pt-1">// Transfer blocking hook</div>
                <div className="text-emerald-400">
                  function _update(address to, uint256 tokenId, address auth) internal override {'{'}<br />
                  &nbsp;&nbsp;require(!isRevoked[tokenId], "token is revoked");<br />
                  &nbsp;&nbsp;return super._update(to, tokenId, auth);<br />
                  {'}'}
                </div>
              </div>
            </div>

            {/* Adversary Post-Revocation Test Runner */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold uppercase tracking-wider">
                  Test: Adversary Post-Revocation Reuse (Scenario 4)
                </span>
                <span className="text-[11px] font-mono text-slate-400">Security Invariant</span>
              </div>

              <p className="text-xs text-slate-300">
                Attempting an unauthorized buyer transfer or mortgage against a statutorily revoked title must revert deterministically on Hyperledger Besu.
              </p>

              <button
                onClick={handleTestTransferOnRevokedToken}
                disabled={!isRevoked}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                Simulate Buyer Transfer Attempt on Token #{activeParcel.tokenId || 'N/A'}
              </button>

              {testTransferReverted && (
                <div className="p-3 bg-red-950/70 border border-red-500/80 rounded-lg text-xs font-mono text-red-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-red-300">
                    <Ban className="w-4 h-4 text-red-400" />
                    TRANSACTION REVERTED BY EVM HOOK:
                  </div>
                  <div className="text-[11px] text-red-300 bg-slate-950 p-1.5 rounded">
                    revert("LandTitleNFT: token is revoked")
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Gas consumed: 21,400 gas (Execution aborted without state change)
                  </div>
                </div>
              )}
            </div>

            {/* Revocation Historical Record Log */}
            {isRevoked && activeParcel.revocationData && (
              <div className="bg-slate-950 rounded-xl border border-red-900/60 p-5 shadow-sm space-y-2 text-xs">
                <div className="font-semibold text-red-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Immutable Revocation Record
                </div>
                <div className="text-slate-300">
                  <strong>Gazette Notice:</strong> {activeParcel.revocationData.gazetteNumber}
                </div>
                <div className="text-slate-300">
                  <strong>Ground:</strong> <span className="font-mono text-red-300">{activeParcel.revocationData.ground}</span>
                </div>
                <div className="text-slate-400 text-[11px] font-mono break-all">
                  TxHash: {activeParcel.revocationData.revocationTxHash}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
