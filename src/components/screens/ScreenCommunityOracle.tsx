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
  ArrowRight
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  parcels: ParcelRecord[];
  onApproveOracle: (parcelId: string) => void;
  onEmitMqtt: (topic: any, payload: any) => void;
}

export const ScreenCommunityOracle: React.FC<Props> = ({ 
  parcels, 
  onApproveOracle,
  onEmitMqtt 
}) => {
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id);
  const [simulateInformantCollusion, setSimulateInformantCollusion] = useState<boolean>(false);
  const [isAttesting, setIsAttesting] = useState<boolean>(false);
  const [attestedSuccess, setAttestedSuccess] = useState<boolean>(false);

  const activeParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];

  const councilElders = [
    { name: 'Baale Gbadamosi Adeleke', role: 'Traditional Community Custodian', status: 'Signed & Sealed', verified: true },
    { name: 'Chief (Mrs) Bisi Ogundipe', role: 'Family Lineage Elder Representative', status: 'Signed & Sealed', verified: true },
    { name: 'Barrister Nduka Obi', role: 'Community Legal Secretary', status: simulateInformantCollusion ? 'Dissent: Conflicting Family Deed' : 'Signed & Sealed', verified: !simulateInformantCollusion }
  ];

  const institutionalRecords = [
    { source: 'State Cadastral Deeds Archives', status: 'Clear Title (No prior gazetted encumbrance)', match: true },
    { source: 'National Identity Database (NIMC)', status: `Identity Confirmed: ${activeParcel.applicantNin}`, match: true },
    { source: 'LGA Boundary Commission', status: simulateInformantCollusion ? 'FLAG: Overlapping Customary Boundary Claim' : 'Boundary Alignment Approved', match: !simulateInformantCollusion }
  ];

  const attestationScore = simulateInformantCollusion ? 34 : 98;
  const outcomeStatus = simulateInformantCollusion ? 'Conflict Detected' : 'Verified & Approved';

  const handleAttest = () => {
    setIsAttesting(true);
    setTimeout(() => {
      setIsAttesting(false);
      onApproveOracle(activeParcel.id);
      onEmitMqtt('land/verification/oracle', {
        applicationId: activeParcel.id,
        outcome: simulateInformantCollusion ? 'Conflict' : 'Verified',
        attestationScore,
        reviewerId: 'ORACLE_COUNCIL_AMAC_04',
        timestamp: new Date().toISOString()
      });
      setAttestedSuccess(true);
      setTimeout(() => setAttestedSuccess(false), 3000);
    }, 600);
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
            onChange={(e) => setSelectedParcelId(e.target.value)}
            className="bg-slate-100 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-amber-600"
          >
            {parcels.map(p => (
              <option key={p.id} value={p.id}>
                {p.cadastralRef} - {p.applicantName}
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
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Vote className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                2. Community Council Attestation & Affidavit
              </h3>
            </div>

            <div className="space-y-3">
              {councilElders.map((elder, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{elder.name}</div>
                    <div className="text-slate-500 text-[11px]">{elder.role}</div>
                    <div className={`text-[11px] font-mono mt-1 ${elder.verified ? 'text-emerald-700' : 'text-red-700 font-bold'}`}>
                      {elder.status}
                    </div>
                  </div>
                  {elder.verified ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-100">
              Customary consensus requires $\ge 66.7\%$ agreement among traditional custodians and boundary witnesses.
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
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
            {attestedSuccess ? (
              <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Attestation Sealed and Broadcast to Registrar Pipeline!
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                {simulateInformantCollusion ? (
                  <span className="flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Cannot sign off: Fraudulent customary attestation detected.
                  </span>
                ) : (
                  'Ready to certify customary ownership to the Registrar.'
                )}
              </div>
            )}

            <button
              onClick={handleAttest}
              disabled={simulateInformantCollusion || activeParcel.status === 'oracle_verified' || activeParcel.status === 'registered'}
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
          </div>
        </div>
      </div>
    </div>
  );
};
