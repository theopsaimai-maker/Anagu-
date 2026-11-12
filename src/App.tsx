/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  INITIAL_PARCELS, 
  INITIAL_MQTT_MESSAGES, 
  FIGMA_FRAMES 
} from './data/mockData';
import { 
  ParcelRecord, 
  MqttMessage, 
  FigmaFrameId, 
  FigmaViewMode, 
  FigmaPageId, 
  RevocationGround 
} from './types/anagu';
import { FigmaTopBar } from './components/figma/FigmaTopBar';
import { FigmaLeftSidebar } from './components/figma/FigmaLeftSidebar';
import { FigmaRightSidebar } from './components/figma/FigmaRightSidebar';
import { FigmaCanvas } from './components/figma/FigmaCanvas';
import { FigmaPrototypePlayer } from './components/figma/FigmaPrototypePlayer';
import { ScreenDesignTokens } from './components/screens/ScreenDesignTokens';
import { ScreenLandingPage } from './components/screens/ScreenLandingPage';
import { FigmaGuidedTour, TOUR_STEPS } from './components/figma/FigmaGuidedTour';
import { FigmaShortcutsModal } from './components/figma/FigmaShortcutsModal';
import { Maximize2, Eye, Layers, Play } from 'lucide-react';

export default function App() {
  const [parcels, setParcels] = useState<ParcelRecord[]>(INITIAL_PARCELS);
  const [mqttMessages, setMqttMessages] = useState<MqttMessage[]>(INITIAL_MQTT_MESSAGES);
  const [selectedFrameId, setSelectedFrameId] = useState<FigmaFrameId>('frame-landing');
  const [viewMode, setViewMode] = useState<FigmaViewMode>('landing');
  const [isPureFullscreen, setIsPureFullscreen] = useState<boolean>(false);
  const [activePage, setActivePage] = useState<FigmaPageId>('screens');
  const [zoomLevel, setZoomLevel] = useState<number>(0.65);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 60 });
  const [activeTool, setActiveTool] = useState<'pointer' | 'hand' | 'frame'>('pointer');
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [showTour, setShowTour] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  // Active frame object
  const activeFrame = FIGMA_FRAMES.find(f => f.id === selectedFrameId) || FIGMA_FRAMES[0];

  // Center canvas viewport on a target frame
  const handleFocusFrame = useCallback((frameId: FigmaFrameId) => {
    const frame = FIGMA_FRAMES.find(f => f.id === frameId);
    if (!frame) return;
    setSelectedFrameId(frameId);

    // Canvas container viewport size (subtracting sidebars & header)
    const viewportWidth = window.innerWidth - 256 - 280; // left sidebar 256px, right 280px
    const viewportHeight = window.innerHeight - 48; // top bar 48px

    // Center coordinates
    const targetX = (viewportWidth / 2) - (frame.x + frame.width / 2) * zoomLevel;
    const targetY = (viewportHeight / 2) - (frame.y + frame.height / 2) * zoomLevel;

    setPan({ x: targetX, y: targetY });
  }, [zoomLevel]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in form fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === '?') {
        setShowShortcuts(prev => !prev);
      } else if (e.key === 'Escape') {
        if (showTour) setShowTour(false);
        if (showShortcuts) setShowShortcuts(false);
        if (viewMode === 'prototype') setViewMode('canvas');
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('pointer');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      } else if (e.key === 'f' || e.key === 'F') {
        setActiveTool('frame');
      } else if (e.shiftKey && e.key === '!') { // Shift + 1
        handleFitCanvas();
      } else if (e.shiftKey && e.key === '@') { // Shift + 2
        handleFocusFrame(selectedFrameId);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setViewMode(prev => prev === 'prototype' ? 'canvas' : 'prototype');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTour, showShortcuts, viewMode, selectedFrameId, handleFocusFrame]);

  // Pipeline state handlers
  const handleNewParcelSubmit = (newParcel: ParcelRecord) => {
    setParcels(prev => [newParcel, ...prev]);
    handleEmitMqtt('land/registration/status', {
      applicationId: newParcel.id,
      status: 'submitted',
      applicant: newParcel.applicantName,
      cadastralRef: newParcel.cadastralRef,
      timestamp: new Date().toISOString()
    });
  };

  const handleApproveSpatial = (parcelId: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, status: 'spatial_verified' } : p));
  };

  const handleApproveOracle = (parcelId: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, status: 'oracle_verified' } : p));
  };

  const handleMintTitle = (parcelId: string, tokenId: number, txHash: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? {
      ...p,
      status: 'registered',
      tokenId,
      txHash,
      blockNumber: Math.floor(1892040 + Math.random() * 100),
      issuanceTimestamp: new Date().toISOString()
    } : p));
  };

  const handleRevokeTitle = (parcelId: string, ground: RevocationGround, gazetteNumber: string, reason: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? {
      ...p,
      status: 'revoked',
      revocationData: {
        ground,
        revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (GOVERNOR_ROLE)',
        timestamp: new Date().toISOString(),
        gazetteNumber,
        reason,
        revocationTxHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
      }
    } : p));
  };

  const handleEmitMqtt = (topic: any, payload: any, qos: 1 | 2 = 1) => {
    const newMsg: MqttMessage = {
      id: `msg-${Date.now()}`,
      topic,
      payload,
      qos,
      timestamp: new Date().toLocaleTimeString(),
      deliveryLatencyMs: Math.floor(35 + Math.random() * 25),
      status: 'delivered'
    };
    setMqttMessages(prev => [newMsg, ...prev]);
  };

  const handleFitCanvas = () => {
    setZoomLevel(0.18);
    setPan({ x: 340, y: 160 });
  };

  const handleExportSpecs = () => {
    const specsData = {
      project: 'Anagu Land Administration Platform',
      version: '2.4',
      designTokens: {
        primary: '#047857',
        canvas: '#0f172a',
        statutoryRevocation: '#b91c1c',
        oracle: '#b45309'
      },
      parcelsCount: parcels.length,
      frames: FIGMA_FRAMES.map(f => ({ id: f.id, title: f.title, device: f.device })),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(specsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Anagu_Design_Specs_v2.4.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pure Website View: When in 'landing' mode, render the actual public website directly with no editor chrome!
  if (viewMode === 'landing') {
    return (
      <div className="w-screen h-screen overflow-y-auto bg-[#070b12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
        <ScreenLandingPage
          parcels={parcels}
          onOpenPrototype={() => {
            setSelectedFrameId('frame-citizen');
            setViewMode('prototype');
          }}
          onOpenCanvas={() => {
            setViewMode('canvas');
            handleFocusFrame('frame-landing');
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#1e1e1e] text-slate-100 overflow-hidden font-sans">
      {/* Figma Top Bar */}
      <FigmaTopBar
        activePage={activePage}
        onSelectPage={setActivePage}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        onFitCanvas={handleFitCanvas}
        activeTool={activeTool}
        onSetActiveTool={setActiveTool}
        isDevMode={isDevMode}
        onToggleDevMode={() => setIsDevMode(!isDevMode)}
        onExportSpecs={handleExportSpecs}
        onStartTour={() => {
          setShowTour(true);
          handleFocusFrame(TOUR_STEPS[tourStepIndex].frameId);
        }}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Left Layers & Pages Sidebar - ONLY shown in Canvas mode */}
        {viewMode === 'canvas' && (
          <FigmaLeftSidebar
            frames={FIGMA_FRAMES}
            selectedFrameId={selectedFrameId}
            onSelectFrame={(id) => {
              setSelectedFrameId(id);
              handleFocusFrame(id);
            }}
            activePage={activePage}
            onSelectPage={(page) => {
              setActivePage(page);
              if (page === 'landing-page') {
                handleFocusFrame('frame-landing');
              } else if (page === 'design-system') {
                handleFocusFrame('frame-tokens');
              } else if (page === 'cadastral-gis') {
                handleFocusFrame('frame-surveyor');
              } else if (page === 'smart-contracts') {
                handleFocusFrame('frame-registrar');
              } else if (page === 'benchmarks') {
                handleFocusFrame('frame-evaluation');
              } else {
                handleFocusFrame('frame-citizen');
              }
            }}
          />
        )}

        {/* Center Canvas View or Design System Specs View */}
        {viewMode === 'specs' ? (
          <div className="flex-1 overflow-y-auto bg-slate-900 w-full h-full">
            <ScreenDesignTokens />
          </div>
        ) : (
          <FigmaCanvas
            frames={FIGMA_FRAMES}
            selectedFrameId={selectedFrameId}
            onSelectFrame={setSelectedFrameId}
            onEnterPrototypeOnFrame={(id) => {
              setSelectedFrameId(id);
              setViewMode('prototype');
            }}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            pan={pan}
            onPanChange={setPan}
            onFocusFrame={handleFocusFrame}
            activeTool={activeTool}
            parcels={parcels}
            onNewParcelSubmit={handleNewParcelSubmit}
            onApproveSpatial={handleApproveSpatial}
            onApproveOracle={handleApproveOracle}
            onMintTitle={handleMintTitle}
            onRevokeTitle={handleRevokeTitle}
            mqttMessages={mqttMessages}
            onEmitMqtt={handleEmitMqtt}
          />
        )}

        {/* Right Inspector & Code Sidebar - ONLY shown in Canvas mode */}
        {viewMode === 'canvas' && (
          <FigmaRightSidebar
            selectedFrame={activeFrame}
            isDevMode={isDevMode}
            onEnterPrototype={() => setViewMode('prototype')}
          />
        )}
      </div>

      {/* Full-Screen Prototype Presentation Mode (Play) */}
      {viewMode === 'prototype' && (
        <FigmaPrototypePlayer
          frames={FIGMA_FRAMES}
          activeFrameId={selectedFrameId}
          onSelectFrame={setSelectedFrameId}
          onClosePrototype={() => setViewMode('landing')}
          parcels={parcels}
          onNewParcelSubmit={handleNewParcelSubmit}
          onApproveSpatial={handleApproveSpatial}
          onApproveOracle={handleApproveOracle}
          onMintTitle={handleMintTitle}
          onRevokeTitle={handleRevokeTitle}
          mqttMessages={mqttMessages}
          onEmitMqtt={handleEmitMqtt}
        />
      )}

      {/* Guided Tour HUD */}
      <FigmaGuidedTour
        isOpen={showTour && viewMode === 'canvas'}
        onClose={() => setShowTour(false)}
        currentStepIndex={tourStepIndex}
        onSetStepIndex={setTourStepIndex}
        onFocusFrame={handleFocusFrame}
      />

      {/* Keyboard Shortcuts Reference Modal */}
      <FigmaShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}
