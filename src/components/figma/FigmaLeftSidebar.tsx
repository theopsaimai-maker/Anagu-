import React, { useState } from 'react';
import { 
  Layers, 
  Box, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  Lock, 
  Square, 
  FileText, 
  Compass, 
  Building2, 
  Gavel, 
  Radio, 
  BarChart3, 
  Palette,
  Smartphone,
  Search
} from 'lucide-react';
import { FigmaFrame, FigmaPageId, FigmaFrameId } from '../../types/anagu';

interface Props {
  frames: FigmaFrame[];
  selectedFrameId: FigmaFrameId;
  onSelectFrame: (frameId: FigmaFrameId) => void;
  activePage: FigmaPageId;
  onSelectPage: (page: FigmaPageId) => void;
}

export const FigmaLeftSidebar: React.FC<Props> = ({
  frames,
  selectedFrameId,
  onSelectFrame,
  activePage,
  onSelectPage
}) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'assets'>('layers');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFrames, setExpandedFrames] = useState<Record<string, boolean>>({
    'frame-citizen': true,
    'frame-surveyor': true,
    'frame-governor': true
  });

  const toggleExpand = (frameId: string) => {
    setExpandedFrames(prev => ({ ...prev, [frameId]: !prev[frameId] }));
  };

  const getFrameIcon = (id: FigmaFrameId) => {
    switch (id) {
      case 'frame-landing': return <Compass className="w-3.5 h-3.5 text-emerald-400" />;
      case 'frame-citizen': return <FileText className="w-3.5 h-3.5 text-emerald-400" />;
      case 'frame-surveyor': return <Compass className="w-3.5 h-3.5 text-emerald-400" />;
      case 'frame-oracle': return <Layers className="w-3.5 h-3.5 text-amber-400" />;
      case 'frame-registrar': return <Building2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'frame-governor': return <Gavel className="w-3.5 h-3.5 text-red-400" />;
      case 'frame-mobile': return <Smartphone className="w-3.5 h-3.5 text-cyan-400" />;
      case 'frame-mqtt': return <Radio className="w-3.5 h-3.5 text-cyan-400" />;
      case 'frame-evaluation': return <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />;
      case 'frame-tokens': return <Palette className="w-3.5 h-3.5 text-emerald-400" />;
      default: return <Square className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const filteredFrames = frames.filter(f => 
    f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-64 bg-[#252525] border-r border-[#383838] flex flex-col text-slate-300 select-none shrink-0 z-30">
      {/* Top Tabs: Layers vs Assets */}
      <div className="h-10 border-b border-[#383838] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('layers')}
            className={`font-semibold transition-colors pb-1 relative ${
              activeTab === 'layers' 
                ? 'text-white border-b-2 border-emerald-500' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Layers
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`font-semibold transition-colors pb-1 relative ${
              activeTab === 'assets' 
                ? 'text-white border-b-2 border-emerald-500' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Assets & Tokens
          </button>
        </div>
      </div>

      {/* Pages Dropdown / Switcher */}
      <div className="p-3 border-b border-[#383838] space-y-1.5">
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
          Figma Pages
        </div>
        <select
          value={activePage}
          onChange={(e) => onSelectPage(e.target.value as FigmaPageId)}
          className="w-full bg-[#1e1e1e] border border-[#3c3c3c] text-slate-200 text-xs rounded-md px-2.5 py-1.5 font-medium focus:outline-emerald-500"
        >
          <option value="landing-page">Public Landing Portal (Live)</option>
          <option value="screens">Master Screens (9 Artboards)</option>
          <option value="design-system">Design Tokens & UI Kit</option>
          <option value="cadastral-gis">Cadastral GIS Cadastre</option>
          <option value="smart-contracts">Besu Smart Contracts</option>
          <option value="benchmarks">Component 4 Evaluation</option>
        </select>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2 border-b border-[#383838]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
          <input
            type="text"
            placeholder="Search frames & layers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded text-xs pl-7 pr-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-emerald-500"
          />
        </div>
      </div>

      {/* Layers Tree */}
      {activeTab === 'layers' ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {filteredFrames.map((frame) => {
            const isSelected = selectedFrameId === frame.id;
            const isExpanded = expandedFrames[frame.id];

            return (
              <div key={frame.id} className="space-y-0.5">
                <div
                  onClick={() => onSelectFrame(frame.id)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors group ${
                    isSelected ? 'bg-[#0d9488]/30 text-white font-semibold' : 'hover:bg-[#303030] text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(frame.id);
                      }}
                      className="text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {getFrameIcon(frame.id)}
                    <span className="truncate text-[12px]">{frame.title}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                    <Lock className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                  </div>
                </div>

                {/* Sub-layers for Frame */}
                {isExpanded && (
                  <div className="pl-6 pr-1 space-y-0.5 font-mono text-[11px] text-slate-400">
                    <div className="py-1 px-1.5 rounded hover:bg-[#2c2c2c] flex items-center justify-between">
                      <span className="truncate"># NavigationBar_Contract</span>
                    </div>
                    <div className="py-1 px-1.5 rounded hover:bg-[#2c2c2c] flex items-center justify-between">
                      <span className="truncate"># MainContent_Grid</span>
                    </div>
                    <div className="py-1 px-1.5 rounded hover:bg-[#2c2c2c] flex items-center justify-between">
                      <span className="truncate"># PostGIS_Cadastral_Vector</span>
                    </div>
                    <div className="py-1 px-1.5 rounded hover:bg-[#2c2c2c] flex items-center justify-between">
                      <span className="truncate"># StateMachine_ActionCard</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Assets Library */
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Cadastral UI Kit Components
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-center space-y-1">
                <div className="w-4 h-4 rounded-full bg-emerald-500 mx-auto" />
                <div className="text-[11px] font-semibold text-slate-200">Survey Beacon</div>
                <div className="text-[10px] text-slate-500 font-mono">Component</div>
              </div>
              <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-center space-y-1">
                <div className="w-6 h-3 border border-emerald-400 border-dashed mx-auto bg-emerald-500/20" />
                <div className="text-[11px] font-semibold text-slate-200">0.5m Halo</div>
                <div className="text-[10px] text-slate-500 font-mono">Spatial Buffer</div>
              </div>
              <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-center space-y-1">
                <div className="w-4 h-4 rounded bg-red-600 mx-auto" />
                <div className="text-[11px] font-semibold text-slate-200">Sec 28 Seal</div>
                <div className="text-[10px] text-slate-500 font-mono">Revocation</div>
              </div>
              <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-center space-y-1">
                <div className="w-4 h-4 rounded bg-cyan-600 mx-auto" />
                <div className="text-[11px] font-semibold text-slate-200">MQTT Pill</div>
                <div className="text-[10px] text-slate-500 font-mono">QoS 1/2</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Smart Contract Architecture
            </div>
            <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-[11px] font-mono space-y-1">
              <div className="text-emerald-400 font-bold">LandTitleNFT.sol</div>
              <div className="text-slate-400">ERC-721 + AccessControl</div>
              <div className="text-slate-500 text-[10px]">GOVERNOR_ROLE + revoke()</div>
            </div>
            <div className="p-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg text-[11px] font-mono space-y-1">
              <div className="text-emerald-400 font-bold">LandRegistry.sol</div>
              <div className="text-slate-400">Registry Controlled Transfers</div>
              <div className="text-slate-500 text-[10px]">P2P Disabled Invariant</div>
            </div>
          </div>
        </div>
      )}

      {/* Frame Dimensions quick stats */}
      <div className="p-3 border-t border-[#383838] bg-[#1e1e1e] text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <span>Artboards: 9 Total</span>
        <span className="text-emerald-400 font-bold">Desktop + Mobile</span>
      </div>
    </div>
  );
};
