import React, { useRef, useState, useEffect } from 'react';
import { 
  Maximize2, 
  ExternalLink, 
  Play, 
  ArrowRight,
  Sparkles,
  Layers,
  FileText,
  Compass,
  Building2,
  Gavel,
  Radio,
  BarChart3,
  Smartphone,
  Palette,
  Crosshair
} from 'lucide-react';
import { FigmaFrame, FigmaFrameId, ParcelRecord, MqttMessage, RevocationGround } from '../../types/anagu';
import { ScreenCitizenPortal } from '../screens/ScreenCitizenPortal';
import { ScreenSurveyorCadastral } from '../screens/ScreenSurveyorCadastral';
import { ScreenCommunityOracle } from '../screens/ScreenCommunityOracle';
import { ScreenRegistrarConsole } from '../screens/ScreenRegistrarConsole';
import { ScreenGovernorRevocation } from '../screens/ScreenGovernorRevocation';
import { ScreenMobileFieldApp } from '../screens/ScreenMobileFieldApp';
import { ScreenMqttTelemetry } from '../screens/ScreenMqttTelemetry';
import { ScreenEvaluationBench } from '../screens/ScreenEvaluationBench';
import { ScreenDesignTokens } from '../screens/ScreenDesignTokens';
import { ScreenLandingPage } from '../screens/ScreenLandingPage';
import { FigmaMiniMap } from './FigmaMiniMap';

interface Props {
  frames: FigmaFrame[];
  selectedFrameId: FigmaFrameId;
  onSelectFrame: (id: FigmaFrameId) => void;
  onEnterPrototypeOnFrame: (id: FigmaFrameId) => void;
  zoomLevel: number;
  onZoomChange?: (zoom: number) => void;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  onFocusFrame: (frameId: FigmaFrameId) => void;
  activeTool: 'pointer' | 'hand' | 'frame';
  parcels: ParcelRecord[];
  onNewParcelSubmit: (p: ParcelRecord) => void;
  onApproveSpatial: (id: string) => void;
  onApproveOracle: (id: string) => void;
  onMintTitle: (id: string, tokenId: number, tx: string) => void;
  onRevokeTitle: (id: string, ground: RevocationGround, gazette: string, reason: string) => void;
  mqttMessages: MqttMessage[];
  onEmitMqtt: (topic: any, payload: any, qos?: 1 | 2) => void;
}

export const FigmaCanvas: React.FC<Props> = ({
  frames,
  selectedFrameId,
  onSelectFrame,
  onEnterPrototypeOnFrame,
  zoomLevel,
  onZoomChange,
  pan,
  onPanChange,
  onFocusFrame,
  activeTool,
  parcels,
  onNewParcelSubmit,
  onApproveSpatial,
  onApproveOracle,
  onMintTitle,
  onRevokeTitle,
  mqttMessages,
  onEmitMqtt
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Spacebar pan listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const shouldPan = activeTool === 'hand' || isSpacePressed;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (shouldPan || e.button === 1) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      onPanChange({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      if (onZoomChange) {
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        const newZoom = Math.min(2.5, Math.max(0.25, zoomLevel * factor));
        onZoomChange(Number(newZoom.toFixed(2)));
      }
    } else {
      // Pan
      onPanChange({
        x: pan.x - e.deltaX,
        y: pan.y - e.deltaY
      });
    }
  };

  const getFrameIcon = (id: FigmaFrameId) => {
    switch (id) {
      case 'frame-landing': return <Compass className="w-3 h-3 text-emerald-400" />;
      case 'frame-citizen': return <FileText className="w-3 h-3 text-emerald-400" />;
      case 'frame-surveyor': return <Compass className="w-3 h-3 text-emerald-400" />;
      case 'frame-oracle': return <Layers className="w-3 h-3 text-amber-400" />;
      case 'frame-registrar': return <Building2 className="w-3 h-3 text-emerald-400" />;
      case 'frame-governor': return <Gavel className="w-3 h-3 text-red-400" />;
      case 'frame-mobile': return <Smartphone className="w-3 h-3 text-cyan-400" />;
      case 'frame-mqtt': return <Radio className="w-3 h-3 text-cyan-400" />;
      case 'frame-evaluation': return <BarChart3 className="w-3 h-3 text-indigo-400" />;
      case 'frame-tokens': return <Palette className="w-3 h-3 text-emerald-400" />;
      default: return <Layers className="w-3 h-3 text-slate-400" />;
    }
  };

  const renderFrameContent = (frameId: FigmaFrameId) => {
    switch (frameId) {
      case 'frame-landing':
        return (
          <ScreenLandingPage
            parcels={parcels}
            onOpenPrototype={() => onEnterPrototypeOnFrame('frame-landing')}
            onOpenCanvas={() => {}}
          />
        );
      case 'frame-citizen':
        return (
          <ScreenCitizenPortal
            parcels={parcels}
            onNewParcelSubmit={onNewParcelSubmit}
            onSelectParcel={() => {}}
          />
        );
      case 'frame-surveyor':
        return (
          <ScreenSurveyorCadastral
            parcels={parcels}
            onApproveSpatial={onApproveSpatial}
            onEmitMqtt={onEmitMqtt}
          />
        );
      case 'frame-oracle':
        return (
          <ScreenCommunityOracle
            parcels={parcels}
            onApproveOracle={onApproveOracle}
            onEmitMqtt={onEmitMqtt}
          />
        );
      case 'frame-registrar':
        return (
          <ScreenRegistrarConsole
            parcels={parcels}
            onMintTitle={onMintTitle}
            onEmitMqtt={onEmitMqtt}
          />
        );
      case 'frame-governor':
        return (
          <ScreenGovernorRevocation
            parcels={parcels}
            onRevokeTitle={onRevokeTitle}
            onEmitMqtt={onEmitMqtt}
          />
        );
      case 'frame-mobile':
        return (
          <ScreenMobileFieldApp
            parcels={parcels}
            onEmitMqtt={onEmitMqtt}
          />
        );
      case 'frame-mqtt':
        return (
          <ScreenMqttTelemetry
            messages={mqttMessages}
            onSendMessage={onEmitMqtt}
          />
        );
      case 'frame-evaluation':
        return <ScreenEvaluationBench />;
      case 'frame-tokens':
        return <ScreenDesignTokens />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className={`flex-1 h-full canvas-bg relative overflow-hidden select-none ${
        shouldPan ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
    >
      {/* Transform Container with Pan and Zoom */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
          transformOrigin: '0 0',
          transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="absolute inset-0"
      >
        {/* Flow Connectors Overlay between pipeline frames */}
        <svg 
          className="absolute pointer-events-none" 
          style={{ width: '9500px', height: '2400px', left: '-2000px', top: '0px' }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
            </marker>
          </defs>

          {/* Landing (-1600+2000=400, w=1440) -> Citizen (0+2000=2000) */}
          <path
            d="M 1840 450 L 2000 450"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6,6"
            markerEnd="url(#arrow)"
          />
          {/* Citizen (2000, w=1440) -> Surveyor (3600) */}
          <path
            d="M 3440 450 L 3600 450"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6,6"
            markerEnd="url(#arrow)"
          />
          {/* Surveyor (3600, w=1440) -> Oracle (5200) */}
          <path
            d="M 5040 450 L 5200 450"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6,6"
            markerEnd="url(#arrow)"
          />
          {/* Oracle (5200, w=1440) -> Registrar (6800) */}
          <path
            d="M 6640 450 L 6800 450"
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6,6"
            markerEnd="url(#arrow)"
          />
          {/* Registrar (6800) -> Governor (2000, 1040) */}
          <path
            d="M 7520 900 C 7520 980, 2720 980, 2720 1040"
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            strokeDasharray="6,6"
            markerEnd="url(#arrow)"
          />
        </svg>

        {/* Frames Rendered as Figma Artboards */}
        {frames.map((frame) => {
          const isSelected = selectedFrameId === frame.id;

          return (
            <div
              key={frame.id}
              onClick={() => onSelectFrame(frame.id)}
              onDoubleClick={() => onEnterPrototypeOnFrame(frame.id)}
              style={{
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
              }}
              className="absolute group select-none"
            >
              {/* Artboard Top Meta Header (Figma style title label above frame) */}
              <div className="absolute -top-9 left-0 flex items-center gap-2 text-xs font-medium text-slate-300">
                <span className="font-semibold text-white tracking-tight">{frame.title}</span>
                <span className="text-slate-500 font-mono text-[11px]">({frame.device})</span>
                <span className="bg-[#2c2c2c] text-emerald-400 font-mono text-[10px] px-2 py-0.5 rounded border border-[#3c3c3c]">
                  {frame.badge}
                </span>

                {/* Quick Play Prototype Action */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnterPrototypeOnFrame(frame.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shadow-sm"
                  title="Present / Test this frame interactively"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Play</span>
                </button>
              </div>

              {/* Artboard Canvas Frame Box */}
              <div
                className={`w-full h-full bg-slate-900 rounded-lg overflow-hidden shadow-2xl transition-all duration-150 relative ${
                  isSelected
                    ? 'ring-2 ring-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
                    : 'border border-slate-700/80 hover:border-slate-500'
                }`}
              >
                {/* Frame Content */}
                {renderFrameContent(frame.id)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Quick-Jump Artboard Pill Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-[#1e1e1e]/90 backdrop-blur-md border border-[#383838] px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1 select-none">
        <span className="text-[10px] uppercase font-mono font-bold text-slate-500 px-2 flex items-center gap-1">
          <Crosshair className="w-3 h-3 text-emerald-400" />
          Focus:
        </span>
        {frames.map((frame, idx) => {
          const isSelected = frame.id === selectedFrameId;
          const shortTitle = frame.title.split(' ')[0];
          return (
            <button
              key={frame.id}
              onClick={() => {
                onSelectFrame(frame.id);
                onFocusFrame(frame.id);
              }}
              title={`${frame.title} (Click to center camera)`}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-xs scale-105'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#2c2c2c]'
              }`}
            >
              {getFrameIcon(frame.id)}
              <span className="hidden lg:inline">{shortTitle}</span>
              <span className="lg:hidden text-[10px] font-mono">{idx + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Radar Mini-Map HUD */}
      <FigmaMiniMap
        frames={frames}
        selectedFrameId={selectedFrameId}
        onSelectFrame={onSelectFrame}
        pan={pan}
        zoomLevel={zoomLevel}
        onPanTo={(newPanX, newPanY) => onPanChange({ x: newPanX, y: newPanY })}
        onFocusFrame={(frame) => onFocusFrame(frame.id)}
      />
    </div>
  );
};
