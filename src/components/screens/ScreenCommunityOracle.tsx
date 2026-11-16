import React, { useState } from 'react';
import { 
  Users, 
  ShieldAlert, 
  CheckCircle, 
  AlertOctagon, 
  AlertTriangle,
  FileCheck2, 
  Scale, 
  Vote, 
  History,
  Building,
  ArrowRight,
  Upload
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface OracleAttestationDetails {
  affidavitRef?: string;
  familyWitness?: string;
  witnessNotes?: string;
  reviewerId?: string;
  quorumPercent?: number;
  attestationScore?: number;
}

interface Props {
  parcels: ParcelRecord[];
  onApproveOracle: (parcelId: string, details?: OracleAttestationDetails) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
  selectedParcelId?: string;
  onSelectParcelId?: (id: string) => void;
  onBackToTracker?: (parcelId: string) => void;
}

export const ScreenCommunityOracle: React.FC<Props> = ({ 
  parcels, 
  onApproveOracle,
  onEmitMqtt,
  selectedParcelId: externalParcelId,
  onSelectParcelId,
  onBackToTracker
}) => {
  const [localParcelId, setLocalParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id);
  const selectedParcelId = externalParcelId || localParcelId;
  const handleSelectParcelId = (id: string) => {
    setLocalParcelId(id);
    onSelectParcelId?.(id);
    setAttestedSuccess(false);
  };

  const [simulateInformantCollusion, setSimulateInformantCollusion] = useState<boolean>(false);
  const [elderSignatures, setElderSignatures] = useState<boolean[]>([true, true, true]);
  const [affidavitRef, setAffidavitRef] = useState('AFF/AMAC/2026/0814');
  const [familyWitness, setFamilyWitness] = useState('Elder Danjuma Karshi (Lineage Head)');
  const [witnessNotes, setWitnessNotes] = useState('Confirmed peaceful family possession since 1984 with intact boundary stone markers.');
  const [affidavitFile, setAffidavitFile] = useState<string>('Family_Council_Minutes_Signed.pdf');
  const [isAttesting, setIsAttesting] = useState<boolean>(false);
  const [attestedSuccess, setAttestedSuccess] = useState<boolean>(false);

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];

  const baseElders = [
    { name: 'Baale Gbadamosi Adeleke', role: 'Traditional Community Custodian' },
    { name: 'Chief (Mrs) Bisi Ogundipe', role: 'Family Lineage Elder Representative' },
    { name: 'Barrister Nduka Obi', role: 'Community Legal Secretary' }
  ];

  const councilElders = baseElders.map((elder, i) => {
    const isSigned = elderSignatures[i] && !(i === 2 && simulateInformantCollusion);
    return {
      ...elder,
      verified: isSigned,
      status: i === 2 && simulateInformantCollusion
        ? 'Dissent: Conflicting Family Deed'
        : isSigned
          ? 'Signed & Sealed'
          : 'Awaiting Elder Signature'
    };
  });

  const signedCount = councilElders.filter(e => e.verified).length;
  const quorumPercent = Math.round((signedCount / councilElders.length) * 100);
  const quorumMet = quorumPercent >= 67 && !simulateInformantCollusion;

  const toggleElderSignature = (index: number) => {
    setElderSignatures(prev => prev.map((val, i) => (i === index ? !val : val)));
  };

  const institutionalRecords = [
    { source: 'State Cadastral Deeds Archives', status: 'Clear Title (No prior gazetted encumbrance)', match: true },
    { source: 'National Identity Database (NIMC)', status: `Identity Confirmed: ${activeParcel.applicantNin}`, match: true },
    { source: 'LGA Boundary Commission', status: simulateInformantCollusion ? 'FLAG: Overlapping Customary Boundary Claim' : 'Boundary Alignment Approved', match: !simulateInformantCollusion }
  ];

  const attestationScore = simulateInformantCollusion ? 34 : Math.max(30, Math.round((signedCount / 3) * 98));

  const handleAttest = () => {
    if (!quorumMet) return;
    setIsAttesting(true);
    setTimeout(() => {
      setIsAttesting(false);
      onApproveOracle(activeParcel.id, {
        affidavitRef,
        familyWitness,
        witnessNotes,
        reviewerId: 'ORACLE_COUNCIL_AMAC_04',
        quorumPercent,
        attestationScore
      });
      onEmitMqtt('land/verification/oracle', {
        applicationId: activeParcel.id,
        outcome: 'Verified',
        attestationScore,
        quorumPercent,
        affidavitRef,
        familyWitness,
        reviewerId: 'ORACLE_COUNCIL_AMAC_04',
        timestamp: new Date().toISOString()
      });
      setAttestedSuccess(true);
    }, 500);
  };

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Community Verification Oracle & Customary Tenure Desk
              <span className="text-xs font-normal text-slate-500">· Component 3A</span>
            </div>
            <div className="text-xs text-slate-500">
              Customary Lineage Reconciler & Institutional Land Records Attestation Engine
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500 font-medium hidden sm:block">Inspect Application:</label>
          <select 
            value={selectedParcelId}
            onChange={(e) => handleSelectParcelId(e.target.value)}
            className="bg-slate-100 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-amber-600"
          >
            {parcels.map(p => (
              <option key={p.id} value={p.id}>
                {p.cadastralRef} - {p.applicantName} ({p.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Banner with Documentary Image */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-5 relative h-48 md:h-auto min-h-[180px]">
            <img 
              src={ASSET_IMAGES.oracleElders} 
              alt="Community Oracle Assembly" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/30 md:to-transparent" />
          </div>

          <div className="md:col-span-7 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded">
                  Tenure Reconciliation Model
                </span>
                <span className="text-xs text-slate-500">Jurisdiction: {activeParcel.district}, {activeParcel.state}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-2">
                Customary Claim & Lineage Attestation for {activeParcel.cadastralRef}
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Under the Nigerian Land Use Act framework, statutory title issuance requires reconciling customary ancestral tenure with institutional deeds archives to prevent fraudulent land grabbing or double-selling.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input 
                  type="checkbox"
                  checked={simulateInformantCollusion}
                  onChange={(e) => setSimulateInformantCollusion(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-0"
                />
                <span className="font-medium text-slate-700">Simulate Colluding Informant / Fraud Vector (Scenario 3)</span>
              </label>

              <div className="text-right">
                <span className="text-xs text-slate-400">Oracle Confidence:</span>
                <span className={`ml-2 text-sm font-bold font-mono tabular-nums ${simulateInformantCollusion ? 'text-red-600' : 'text-emerald-700'}`}>
                  {attestationScore}/100
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Matrix: Institutional vs Community Sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Institutional Sources */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                1. Institutional Registry Sources
              </h3>
            </div>

            <div className="space-y-3">
              {institutionalRecords.map((rec, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{rec.source}</div>
                    <div className="text-slate-500 mt-0.5">{rec.status}</div>
                  </div>
                  {rec.match ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-100">
              Automated API query across State Geographic Information System (GIS) and National Identity Management Commission (NIMC).
            </div>
          </div>

          {/* Community & Traditional Authority Council */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Vote className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                  2. Community Council Attestation ({signedCount}/3)
                </h3>
              </div>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                quorumMet ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {quorumPercent}% Quorum
              </span>
            </div>

            <div className="space-y-2.5">
              {councilElders.map((elder, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{elder.name}</div>
                    <div className="text-slate-500 text-[11px]">{elder.role}</div>
                    <div className={`text-[11px] font-mono mt-1 ${elder.verified ? 'text-emerald-700' : 'text-red-700 font-bold'}`}>
                      {elder.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleElderSignature(i)}
                    disabled={i === 2 && simulateInformantCollusion}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors shrink-0 flex items-center gap-1.5 ${
                      elder.verified
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {elder.verified ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Signed</span>
                      </>
                    ) : (
                      <span>Sign Off</span>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Live Quorum Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${quorumMet ? 'bg-emerald-600' : 'bg-red-500'}`}
                  style={{ width: `${quorumPercent}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>Customary consensus requires ≥ 66.7% agreement (2 of 3 elders).</span>
                <span className={`font-semibold ${quorumMet ? 'text-emerald-700' : 'text-red-600'}`}>
                  {quorumMet ? 'Quorum Met' : 'Quorum Not Met'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Customary Witness & Affidavit Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                3. Family Lineage Affidavit & Witness Testimony
              </h3>
            </div>
            <label className="cursor-pointer px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-900 flex items-center gap-1.5 transition-colors w-fit">
              <Upload className="w-3.5 h-3.5" />
              <span>Attach Affidavit ({affidavitFile})</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAffidavitFile(file.name);
                }}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Affidavit Reference</label>
              <input
                type="text"
                value={affidavitRef}
                onChange={(e) => setAffidavitRef(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-800 focus:outline-amber-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Primary Family / Customary Witness</label>
              <input
                type="text"
                value={familyWitness}
                onChange={(e) => setFamilyWitness(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-amber-600"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block font-medium text-slate-700 mb-1">Elders Boundary Testimony & Minutes</label>
              <textarea
                rows={2}
                value={witnessNotes}
                onChange={(e) => setWitnessNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-amber-600"
              />
            </div>
          </div>
        </div>

        {/* Oracle Attestation Result Table (From Spec Section 9 Table) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                Table — Ownership Verification Outcomes (Empirical Distribution)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Benchmark verification metrics from Anagu customary-statutory oracle service
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded text-slate-700">
              Total Validated: N=142
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium bg-slate-50/70">
                  <th className="py-2.5 px-3">Verification Outcome</th>
                  <th className="py-2.5 px-3 text-right">Frequency (n)</th>
                  <th className="py-2.5 px-3 text-right">Percentage (%)</th>
                  <th className="py-2.5 px-3">Protocol Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-emerald-800 font-sans">Successfully verified</td>
                  <td className="py-2.5 px-3 text-right">118</td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-700">83.1%</td>
                  <td className="py-2.5 px-3 text-slate-600 font-sans">Approved for Registrar & Blockchain Minting</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-amber-800 font-sans">Incomplete supporting documents</td>
                  <td className="py-2.5 px-3 text-right">14</td>
                  <td className="py-2.5 px-3 text-right text-amber-700">9.9%</td>
                  <td className="py-2.5 px-3 text-slate-600 font-sans">Returned to applicant for missing family affidavits</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-red-800 font-sans">Ownership information conflict</td>
                  <td className="py-2.5 px-3 text-right">7</td>
                  <td className="py-2.5 px-3 text-right text-red-700">4.9%</td>
                  <td className="py-2.5 px-3 text-slate-600 font-sans">Escalated to Customary Arbitration Tribunal</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800 font-sans">Legal verification pending</td>
                  <td className="py-2.5 px-3 text-right">3</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">2.1%</td>
                  <td className="py-2.5 px-3 text-slate-600 font-sans">Active inquiry under gazetted notice period</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Action Sign-off */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {attestedSuccess || activeParcel.status === 'oracle_verified' || activeParcel.status === 'registered' ? (
              <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Customary Attestation Sealed & Verified!</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                {!quorumMet ? (
                  <span className="flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {simulateInformantCollusion
                      ? 'Cannot sign off: Fraudulent customary attestation detected.'
                      : 'Cannot sign off: Minimum 66.7% (2 of 3) elder quorum required.'}
                  </span>
                ) : (
                  'Ready to certify customary ownership to the Registrar.'
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              {!(activeParcel.status === 'oracle_verified' || activeParcel.status === 'registered') ? (
                <button
                  onClick={handleAttest}
                  disabled={!quorumMet || isAttesting}
                  className="px-6 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  {isAttesting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Broadcasting Proof...
                    </>
                  ) : (
                    <>
                      Attest & Release to Registrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : onBackToTracker ? (
                <button
                  onClick={() => onBackToTracker(activeParcel.id)}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  <span>View Updated Status in Citizen Tracker</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  Attested & Released
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
