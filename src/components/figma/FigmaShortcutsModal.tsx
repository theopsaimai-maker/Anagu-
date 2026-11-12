import React from 'react';
import { X, Keyboard, Command, MousePointer, Hand, Maximize2, Play, Eye } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FigmaShortcutsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'V', desc: 'Select / Move Tool (Default pointer)' },
    { key: 'H', desc: 'Hand Tool (Pan canvas without selecting)' },
    { key: 'Space + Drag', desc: 'Temporary pan while in pointer mode' },
    { key: 'F', desc: 'Frame / Artboard tool' },
    { key: 'Ctrl + Scroll', desc: 'Pinch / Wheel zoom centered on cursor' },
    { key: 'Shift + 1', desc: 'Zoom to fit entire canvas workspace' },
    { key: 'Shift + 2', desc: 'Zoom & center into selected artboard' },
    { key: 'Cmd/Ctrl + P', desc: 'Launch Presentation (Interactive Prototype)' },
    { key: 'Esc', desc: 'Exit prototype player back to canvas' },
    { key: '?', desc: 'Toggle keyboard shortcuts reference' },
  ];

  const cadastreFeatures = [
    { section: 'Citizen Portal', detail: 'WGS84 beacon coordinate registration with real-time bounding polygon geometry.' },
    { section: 'Cadastral GIS', detail: 'PostGIS 3.4 ST_IsValid check + 0.5m buffer overlap collision detection.' },
    { section: 'Community Oracle', detail: 'Customary tenure lineage attestation with ancestral council quorum (3/3).' },
    { section: 'Besu Registrar', detail: 'Pre-mint cryptographic audit gates -> ERC-721 LandTitleNFT minting.' },
    { section: 'Section 28 Revocation', detail: 'Nigerian Land Use Act (1978) statutory revocation locks OpenZeppelin transfer hook.' },
    { section: 'Field Surveyor Mobile', detail: 'Offline SQLite beacon queue with automatic sync to Mosquitto MQTT broker.' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#1e1e1e] text-slate-200 rounded-2xl max-w-2xl w-full border border-[#383838] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 border-b border-[#2d2d2d] px-6 flex items-center justify-between bg-[#252525]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight">Figma Canvas & Platform Shortcuts</div>
              <div className="text-xs text-slate-400">Navigation, tools, and Land Use Act simulation controls</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Shortcuts Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">
              Canvas Navigation & Tools
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {shortcuts.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-[#252525] rounded-lg border border-[#333]">
                  <span className="text-xs text-slate-300">{s.desc}</span>
                  <kbd className="px-2 py-1 bg-[#181818] border border-[#383838] rounded text-emerald-400 font-mono text-[11px] font-semibold shrink-0 ml-2">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Statutory Pipeline Flow Reference */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">
              Tenure Governance Flow Reference
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {cadastreFeatures.map((c, i) => (
                <div key={i} className="p-3 bg-[#252525] rounded-lg border border-[#333]">
                  <div className="text-xs font-bold text-emerald-400">{c.section}</div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{c.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-[#2d2d2d] px-6 flex items-center justify-between bg-[#252525] text-xs text-slate-400">
          <span>Press <kbd className="px-1.5 py-0.5 bg-[#181818] border border-[#383838] rounded text-slate-300 font-mono text-[10px]">Esc</kbd> anytime to close</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
