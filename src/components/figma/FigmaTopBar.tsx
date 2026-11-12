import React from 'react';
import { 
  Play, 
  MousePointer, 
  Hand, 
  Square, 
  MessageSquare, 
  Code2, 
  Share2, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Sparkles,
  ChevronDown,
  Layers,
  SlidersHorizontal,
  Eye,
  HelpCircle,
  Compass
} from 'lucide-react';
import { FigmaViewMode, FigmaPageId } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';

interface Props {
  activePage: FigmaPageId;
  onSelectPage: (page: FigmaPageId) => void;
  viewMode: FigmaViewMode;
  onSetViewMode: (mode: FigmaViewMode) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  onFitCanvas: () => void;
  activeTool: 'pointer' | 'hand' | 'frame';
  onSetActiveTool: (tool: 'pointer' | 'hand' | 'frame') => void;
  isDevMode: boolean;
  onToggleDevMode: () => void;
  onExportSpecs: () => void;
  onStartTour?: () => void;
  onOpenShortcuts?: () => void;
}

export const FigmaTopBar: React.FC<Props> = ({
  activePage,
  onSelectPage,
  viewMode,
  onSetViewMode,
  zoomLevel,
  onZoomChange,
  onFitCanvas,
  activeTool,
  onSetActiveTool,
  isDevMode,
  onToggleDevMode,
  onExportSpecs,
  onStartTour,
  onOpenShortcuts
}) => {
  return (
    <div className="h-12 bg-[#2c2c2c] border-b border-[#383838] px-3 flex items-center justify-between text-slate-200 select-none shrink-0 z-40">
      {/* Left zone: File Menu, Tools, Document Name */}
      <div className="flex items-center gap-3">
        {/* Sovereign Avatar Brand Mark */}
        <div className="w-7 h-7 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shrink-0 shadow-xs">
          <img 
            src={ASSET_IMAGES.logoAvatar} 
            alt="Anagu Avatar" 
            className="w-full h-full object-cover rounded-full bg-slate-900" 
          />
        </div>

        {/* Back to Public Landing Page */}
        <button
          onClick={() => onSetViewMode('landing')}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-[#252525] hover:bg-emerald-600 text-slate-200 hover:text-white transition-colors border border-[#3c3c3c]"
          title="Return to Public Website"
        >
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>Website</span>
        </button>

        {/* Tool selector */}
        <div className="flex items-center bg-[#1e1e1e] rounded-md p-0.5 border border-[#3c3c3c]">
          <button
            onClick={() => onSetActiveTool('pointer')}
            className={`p-1.5 rounded transition-colors ${
              activeTool === 'pointer' ? 'bg-[#383838] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Move Tool (V)"
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetActiveTool('frame')}
            className={`p-1.5 rounded transition-colors ${
              activeTool === 'frame' ? 'bg-[#383838] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Frame Tool (F)"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetActiveTool('hand')}
            className={`p-1.5 rounded transition-colors ${
              activeTool === 'hand' ? 'bg-[#383838] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Hand / Pan Tool (H)"
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Project Title */}
        <div className="flex items-center gap-2 pl-2">
          <span className="font-semibold text-xs text-white tracking-tight">
            Anagu — Enterprise Land Administration UI System
          </span>
          <span className="text-[11px] font-mono text-slate-400 bg-[#383838] px-1.5 py-0.5 rounded">
            v2.4 Master
          </span>
        </div>
      </div>

      {/* Center zone: View mode selector & Pages */}
      <div className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-lg border border-[#3c3c3c]">
        <button
          onClick={() => onSetViewMode('canvas')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            viewMode === 'canvas' ? 'bg-[#383838] text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Design Canvas
        </button>
        <button
          onClick={() => onSetViewMode('prototype')}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
            viewMode === 'prototype' 
              ? 'bg-emerald-600 text-white shadow-xs' 
              : 'text-emerald-400 hover:bg-emerald-950/40'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Interactive Prototype (Play)
        </button>
        <button
          onClick={() => onSetViewMode('landing')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            viewMode === 'landing' ? 'bg-[#383838] text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          Public Landing Page
        </button>
        <button
          onClick={() => onSetViewMode('specs')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            viewMode === 'specs' ? 'bg-[#383838] text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Design Tokens & Specs
        </button>
      </div>

      {/* Right zone: Zoom, Dev Mode, Present & Export */}
      <div className="flex items-center gap-2">
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-[#1e1e1e] px-2 py-1 rounded-md border border-[#3c3c3c] text-xs font-mono">
          <button 
            onClick={() => onZoomChange(Math.max(0.25, zoomLevel - 0.15))}
            className="text-slate-400 hover:text-white p-0.5"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center text-slate-200">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button 
            onClick={() => onZoomChange(Math.min(2.5, zoomLevel + 0.15))}
            className="text-slate-400 hover:text-white p-0.5"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onFitCanvas}
            className="text-slate-400 hover:text-white p-0.5 ml-1"
            title="Fit to Window"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        {/* Dev Mode toggle */}
        <button
          onClick={onToggleDevMode}
          className={`px-2.5 py-1 text-xs font-mono rounded-md flex items-center gap-1.5 border transition-colors ${
            isDevMode 
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-400' 
              : 'bg-[#1e1e1e] border-[#3c3c3c] text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Dev Mode (Inspect Code & ABI)"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Dev Mode</span>
        </button>

        {/* Guided Tour trigger */}
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1.5 transition-colors"
            title="Start Interactive Land Administration Pipeline Tour"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Guided Tour</span>
          </button>
        )}

        {/* Shortcuts / Help modal trigger */}
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 bg-[#1e1e1e] hover:bg-[#383838] border border-[#3c3c3c] rounded-md text-slate-300 hover:text-white transition-colors"
            title="Keyboard Shortcuts & Reference (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}

        {/* Export button */}
        <button
          onClick={onExportSpecs}
          className="p-1.5 bg-[#1e1e1e] hover:bg-[#383838] border border-[#3c3c3c] rounded-md text-slate-300 hover:text-white transition-colors"
          title="Export Design Specs (JSON)"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Play Prototype action */}
        <button
          onClick={() => onSetViewMode('prototype')}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Present</span>
        </button>

        {/* Lead Architect Avatar */}
        <div 
          className="relative w-7 h-7 rounded-full ring-1.5 ring-emerald-500/50 overflow-hidden shrink-0 shadow-xs ml-1 cursor-pointer"
          title="Lead Cadastral Architect: M. Adeleke (Online)"
        >
          <img 
            src={ASSET_IMAGES.userAvatar} 
            alt="Lead Architect" 
            className="w-full h-full object-cover" 
          />
          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-[#2c2c2c]" />
        </div>
      </div>
    </div>
  );
};
