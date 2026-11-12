import React from 'react';
import { 
  Palette, 
  Type, 
  Compass, 
  Layers, 
  Code2, 
  ShieldCheck, 
  Check, 
  Sparkles,
  FileCode,
  Square
} from 'lucide-react';

export const ScreenDesignTokens: React.FC = () => {
  const colorSwatches = [
    { name: 'Cadastral Emerald', hex: '#047857', role: 'Primary Statutory & Approved GIS Boundary', text: 'text-white' },
    { name: 'Sovereign Slate', hex: '#0f172a', role: 'Executive Authority & System Background Canvas', text: 'text-white' },
    { name: 'Statutory Crimson', hex: '#b91c1c', role: 'Section 28 Revocation & PostGIS Collision Alert', text: 'text-white' },
    { name: 'Oracle Amber', hex: '#b45309', role: 'Customary Tenure & Traditional Council Attestation', text: 'text-white' },
    { name: 'Telemetry Cyan', hex: '#0891b2', role: 'MQTT IoT Messaging & Event Bus Stream', text: 'text-white' },
    { name: 'Parchment Gold', hex: '#d97706', role: 'Digital Title Deed Wax Seal & Sovereign Crest', text: 'text-white' },
    { name: 'Surface Slate 900', hex: '#0f172a', role: 'Card & Container Structural Background (30%)', text: 'text-slate-200' },
    { name: 'Hairline Divider', hex: '#334155', role: 'Subtle Hairline Separation Lines (1px)', text: 'text-slate-300' },
  ];

  const typeScales = [
    { level: 'Executive Headline', size: '24px (1.5rem)', weight: 'Bold 700', sample: 'Certificate of Occupancy (Digital Land Title Deed)', font: 'font-sans' },
    { level: 'Cadastral Ref Header', size: '18px (1.125rem)', weight: 'SemiBold 600', sample: 'FCT/AMAC/KAT/0891-B · Katampe Sector', font: 'font-sans' },
    { level: 'Body Prose', size: '14px (0.875rem)', weight: 'Regular 400', sample: 'Pursuant to Section 28 of the Land Use Act 1978, the Governor hereby orders revocation.', font: 'font-sans' },
    { level: 'Cadastral Coordinates', size: '13px (0.8125rem)', weight: 'Medium 500 (Tabular)', sample: 'Lat: 9.1025° N · Lng: 7.4521° E · Easting: 329841.2m', font: 'font-mono' },
    { level: 'Cryptographic Hash', size: '11px (0.6875rem)', weight: 'Regular 400 (Monospace)', sample: '0x3a9f0291e0a9d821fc003192019a8200192a01f8938210921938910293019283', font: 'font-mono' }
  ];

  const rbacRoles = [
    { role: 'citizen', title: 'Citizen / Applicant', perms: 'Submit land registration applications, view own application status and issued title deeds.' },
    { role: 'surveyor', title: 'Licensed Surveyor', perms: 'Submit and validate parcel geometry, approve GIS verification stage, inspect beacon Northing/Easting.' },
    { role: 'registrar', title: 'Registrar of Deeds', perms: 'Approve/reject applications after verification, execute Hyperledger Besu ERC-721 token minting.' },
    { role: 'land_administrator', title: 'Land Administrator', perms: 'Manage registry records, oversee customary oracle council workflows, monitor telemetry.' },
    { role: 'Governor', title: 'Executive State Governor', perms: 'Invoke statutory revocation under LUA (1978) Section 28 (Only role with GOVERNOR_ROLE on contract).' }
  ];

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="bg-slate-950 border-b border-slate-800 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Anagu Master Design System & Cadastral Token Library
              <span className="text-xs font-mono font-normal text-emerald-400">Design Tokens v2.4</span>
            </div>
            <div className="text-xs text-slate-400">
              Anti-Slop Design Constitution · Zero-Pill Typography · Cadastral GIS Symbology · Besu Smart Contract Specs
            </div>
          </div>
        </div>

        <div className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
          Tailwind CSS v4 & Figma Tokens
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-8">
        {/* Color Palette (60-30-10 System) */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Palette className="w-4 h-4 text-emerald-400" />
              1. Color Architecture (60% Neutral Canvas · 30% Structural Surfaces · 10% Statutory Accents)
            </div>
            <span className="text-xs font-mono text-slate-400">WCAG AA Contrast Compliant</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {colorSwatches.map((color, idx) => (
              <div key={idx} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xs">
                <div 
                  className={`h-20 p-3 flex flex-col justify-end ${color.text}`}
                  style={{ backgroundColor: color.hex }}
                >
                  <span className="font-mono text-xs font-bold">{color.hex}</span>
                </div>
                <div className="p-3 text-xs space-y-1">
                  <div className="font-bold text-slate-200">{color.name}</div>
                  <div className="text-[11px] text-slate-400">{color.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Scale & Tabular Numerals */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Type className="w-4 h-4 text-emerald-400" />
              2. Typographic Scale & Tabular Discipline (Plus Jakarta Sans + JetBrains Mono)
            </div>
            <span className="text-xs font-mono text-slate-400">font-variant-numeric: tabular-nums</span>
          </div>

          <div className="space-y-4">
            {typeScales.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-900 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="sm:w-56 shrink-0">
                  <div className="font-semibold text-slate-300">{item.level}</div>
                  <div className="text-slate-500 text-[11px] font-mono">{item.size} · {item.weight}</div>
                </div>
                <div className={`flex-1 text-slate-100 ${item.font} truncate`}>
                  {item.sample}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cadastral GIS Symbology */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Compass className="w-4 h-4 text-emerald-400" />
              3. Cadastral Spatial Symbology & Tolerance Rules
            </div>
            <span className="text-xs font-mono text-slate-400">EPSG:4326 (WGS84) · PostGIS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <div className="w-3 h-3 rounded-full bg-emerald-400 border border-white" />
                Beacon Point (PB)
              </div>
              <p className="text-slate-400">
                Ground monument beacon coordinate. Requires WGS84 Lat/Lng and Minna Datum UTM Zone 31N/32N Northing/Easting conversion.
              </p>
            </div>

            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <div className="w-4 h-2 border border-emerald-400 border-dashed bg-emerald-400/20" />
                0.5m Spatial Buffer Halo
              </div>
              <p className="text-slate-400">
                PostGIS <code className="text-emerald-300 font-mono">ST_Buffer(geom, 0.5)</code> bounding margin preventing encroachment on adjacent gazetted parcels.
              </p>
            </div>

            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-red-400 font-bold">
                <div className="w-4 h-2 bg-red-500 border border-red-400" />
                Collision Intersection Zone
              </div>
              <p className="text-slate-400">
                <code className="text-red-300 font-mono">ST_Intersects()</code> overlap flag. Automatic gate failure and registration halt.
              </p>
            </div>
          </div>
        </div>

        {/* Role-Based Access Control Matrix */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              4. Identity & Role-Based Access Control Matrix (RBAC Specification Section 13)
            </div>
            <span className="text-xs font-mono text-slate-400">5 Governed Roles</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">Role Identifier</th>
                  <th className="py-2.5 px-3">Functional Designation</th>
                  <th className="py-2.5 px-3">Statutory Permissions & Smart Contract Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-sans">
                {rbacRoles.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-900/50">
                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">{r.role}</td>
                    <td className="py-3 px-3 font-semibold text-slate-200">{r.title}</td>
                    <td className="py-3 px-3 text-slate-400">{r.perms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
