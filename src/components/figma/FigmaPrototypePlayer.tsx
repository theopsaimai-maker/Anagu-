import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Maximize, 
  Layers, 
  Sparkles,
  Smartphone,
  Monitor
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

interface Props {
  frames: FigmaFrame[];
  activeFrameId: FigmaFrameId;
  onSelectFrame: (id: FigmaFrameId) => void;
  onClosePrototype: () => void;
  parcels: ParcelRecord[];
  onNewParcelSubmit: (p: ParcelRecord) => void;
  onApproveSpatial: (id: string) => void;
  onApproveOracle: (id: string) => void;
  onMintTitle: (id: string, tokenId: number, tx: string) => void;
  onRevokeTitle: (id: string, ground: RevocationGround, gazette: string, reason: string) => void;
  mqttMessages: MqttMessage[];
  onEmitMqtt: (topic: any, payload: any, qos?: 1 | 2) => void;
}

export const FigmaPrototypePlayer: React.FC<Props> = ({
  frames,
  activeFrameId,
  onSelectFrame,
  onClosePrototype,
  parcels,
  onNewParcelSubmit,
  onApproveSpatial,
  onApproveOracle,
  onMintTitle,
  onRevokeTitle,
  mqttMessages,
  onEmitMqtt
}) => {
  const currentIndex = frames.findIndex(f => f.id === activeFrameId);
  const currentFrame = frames[currentIndex] || frames[0];
  const [deviceScale, setDeviceScale] = useState<number>(1);

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + frames.length) % frames.length;
    onSelectFrame(frames[prevIdx].id);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % frames.length;
    onSelectFrame(frames[nextIdx].id);
  };

  const renderActiveScreen = () => {
    switch (activeFrameId) {
      case 'frame-landing':
        return (
          <ScreenLandingPage
            parcels={parcels}
            onOpenPrototype={() => {}}
            onOpenCanvas={onClosePrototype}
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
    <div className="fixed inset-0 z-50 bg-[#121212] text-white flex flex-col overflow-hidden select-none">
      {/* Figma Prototype Presentation Top Bar */}
      <div className="h-14 bg-[#1e1e1e] border-b border-[#2d2d2d] px-6 flex items-center justify-between shrink-0">
        {/* Back to Canvas */}
        <div className="flex items-center gap-4">
          <button
            onClick={onClosePrototype}
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 bg-[#2c2c2c] hover:bg-[#383838] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exit to Canvas</span>
          </button>

          <div className="h-4 w-px bg-[#383838]" />

          {/* Current Frame Title & Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Flow:</span>
            <select
              value={activeFrameId}
              onChange={(e) => onSelectFrame(e.target.value as FigmaFrameId)}
              className="bg-[#2c2c2c] border border-[#3c3c3c] text-white text-xs font-semibold rounded-md px-3 py-1.5 focus:outline-emerald-500"
            >
              {frames.map((f, i) => (
                <option key={f.id} value={f.id}>
                  {i + 1}. {f.title} ({f.device.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step Progression */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 bg-[#2c2c2c] hover:bg-[#383838] rounded text-slate-300 hover:text-white transition-colors"
            title="Previous Screen (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 px-2">
            {currentIndex + 1} of {frames.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 bg-[#2c2c2c] hover:bg-[#383838] rounded text-slate-300 hover:text-white transition-colors"
            title="Next Screen (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Presentation Extras */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded">
            Live Prototype Engine Active
          </div>

          <button
            onClick={() => onSelectFrame(frames[0].id)}
            className="p-1.5 bg-[#2c2c2c] hover:bg-[#383838] rounded text-slate-300 hover:text-white transition-colors"
            title="Restart Workflow (R)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Presentation Viewport */}
      <div className="flex-1 overflow-auto bg-[#181818] p-4 flex items-center justify-center">
        <div 
          style={{
            maxWidth: currentFrame.id === 'frame-mobile' ? '420px' : '100%',
            height: currentFrame.id === 'frame-mobile' ? '860px' : '100%',
          }}
          className="w-full h-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col"
        >
          {renderActiveScreen()}
        </div>
      </div>
    </div>
  );
};
