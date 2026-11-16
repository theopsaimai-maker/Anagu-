/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  INITIAL_PARCELS, 
  INITIAL_MQTT_MESSAGES, 
  FIGMA_FRAMES,
  ASSET_IMAGES
} from './data/mockData';
import { 
  ParcelRecord, 
  MqttMessage, 
  FigmaFrameId, 
  FigmaViewMode, 
  FigmaPageId, 
  RevocationGround,
  PortalStepId,
  AuthMode,
  AccessRoleId,
  AuthUser
} from './types/anagu';
import { FigmaTopBar } from './components/figma/FigmaTopBar';
import { FigmaLeftSidebar } from './components/figma/FigmaLeftSidebar';
import { FigmaRightSidebar } from './components/figma/FigmaRightSidebar';
import { FigmaCanvas } from './components/figma/FigmaCanvas';
import { FigmaPrototypePlayer } from './components/figma/FigmaPrototypePlayer';
import { ScreenDesignTokens } from './components/screens/ScreenDesignTokens';
import { ScreenLandingPage } from './components/screens/ScreenLandingPage';
import { ScreenAuth, INITIAL_DEMO_ACCOUNTS, StoredAuthAccount } from './components/screens/ScreenAuth';
import { ScreenCitizenPortal } from './components/screens/ScreenCitizenPortal';
import { ScreenSurveyorCadastral } from './components/screens/ScreenSurveyorCadastral';
import { ScreenCommunityOracle } from './components/screens/ScreenCommunityOracle';
import { FigmaGuidedTour, TOUR_STEPS } from './components/figma/FigmaGuidedTour';
import { FigmaShortcutsModal } from './components/figma/FigmaShortcutsModal';
import { Home, FileText, Compass, Users, Layers, LogOut } from 'lucide-react';
import {
  apiApproveOracle,
  apiApproveSpatial,
  apiCreateMqttMessage,
  apiCreateParcel,
  apiListMqttMessages,
  apiListParcels,
  apiMintTitle,
  apiRevokeTitle
} from './lib/api';

const STORAGE_KEY = 'anagu_parcels_v1';
const USERS_STORAGE_KEY = 'anagu_users_v1';
const SESSION_STORAGE_KEY = 'anagu_session_v1';

export default function App() {
  const [parcels, setParcels] = useState<ParcelRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial parcels
    }
    return INITIAL_PARCELS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels));
    } catch {
      // Ignore storage quota errors
    }
  }, [parcels]);

  const [accounts, setAccounts] = useState<StoredAuthAccount[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to demo accounts
    }
    return INITIAL_DEMO_ACCOUNTS;
  });

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback to logged out
    }
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(accounts));
    } catch {
      // Ignore storage quota errors
    }
  }, [accounts]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [currentUser]);

  const [mqttMessages, setMqttMessages] = useState<MqttMessage[]>(INITIAL_MQTT_MESSAGES);
  const [selectedFrameId, setSelectedFrameId] = useState<FigmaFrameId>('frame-landing');
  const [viewMode, setViewMode] = useState<FigmaViewMode>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authRole, setAuthRole] = useState<AccessRoleId>('citizen');
  const [activePortalStep, setActivePortalStep] = useState<PortalStepId>('citizen');
  const [activeParcelId, setActiveParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id || '');

  // Hydrate registry parcels & MQTT log from database on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [remoteParcels, remoteMqtt] = await Promise.all([
          apiListParcels(),
          apiListMqttMessages()
        ]);
        if (!active) return;
        if (Array.isArray(remoteParcels) && remoteParcels.length > 0) {
          setParcels(remoteParcels);
          setActiveParcelId((prev) =>
            prev && remoteParcels.some((p) => p.id === prev)
              ? prev
              : remoteParcels[1]?.id || remoteParcels[0]?.id || ''
          );
        }
        if (Array.isArray(remoteMqtt) && remoteMqtt.length > 0) {
          setMqttMessages(remoteMqtt);
        }
      } catch {
        // Keep local cache if backend API is temporarily unavailable
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const [activePage, setActivePage] = useState<FigmaPageId>('screens');
  const [zoomLevel, setZoomLevel] = useState<number>(0.65);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 60 });
  const [activeTool, setActiveTool] = useState<'pointer' | 'hand' | 'frame'>('pointer');
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [showTour, setShowTour] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  const handleOpenPortal = useCallback((step: PortalStepId, parcelId?: string) => {
    if (parcelId) setActiveParcelId(parcelId);
    setActivePortalStep(step);
    setViewMode('portal');
  }, []);

  const handleOpenAuth = useCallback((mode: AuthMode, role: AccessRoleId = 'citizen') => {
    setAuthMode(mode);
    setAuthRole(role);
    setViewMode('auth');
  }, []);

  const handleRegisterAccount = useCallback((newAccount: StoredAuthAccount) => {
    setAccounts(prev => [newAccount, ...prev]);
  }, []);

  const handleAuthSuccess = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setActivePortalStep(user.role);
    setViewMode('portal');
  }, []);

  const handleSignOut = useCallback(() => {
    setCurrentUser(null);
    setViewMode('landing');
  }, []);

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

  // Pipeline state handlers (optimistic state + PostgreSQL persistence)
  const handleNewParcelSubmit = (newParcel: ParcelRecord) => {
    setParcels(prev => [newParcel, ...prev]);
    apiCreateParcel(newParcel, currentUser?.id).catch(() => {
      // Keep local state if offline
    });
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
    apiApproveSpatial(parcelId).catch(() => {
      // Keep local state if offline
    });
  };

  const handleApproveOracle = (parcelId: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, status: 'oracle_verified' } : p));
    apiApproveOracle(parcelId).catch(() => {
      // Keep local state if offline
    });
  };

  const handleMintTitle = (parcelId: string, tokenId: number, txHash: string) => {
    const blockNumber = Math.floor(1892040 + Math.random() * 100);
    const issuanceTimestamp = new Date().toISOString();
    setParcels(prev => prev.map(p => p.id === parcelId ? {
      ...p,
      status: 'registered',
      tokenId,
      txHash,
      blockNumber,
      issuanceTimestamp
    } : p));
    apiMintTitle(parcelId, tokenId, txHash, blockNumber, issuanceTimestamp).catch(() => {
      // Keep local state if offline
    });
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
    apiRevokeTitle(parcelId, ground, gazetteNumber, reason)
      .then((updated) => {
        setParcels(prev => prev.map(p => p.id === parcelId ? updated : p));
      })
      .catch(() => {
        // Keep local state if offline
      });
  };

  const handleEmitMqtt = (topic: any, payload: any, qos: 1 | 2 = 1) => {
    const newMsg: MqttMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      topic,
      payload,
      qos,
      timestamp: new Date().toLocaleTimeString(),
      deliveryLatencyMs: Math.floor(35 + Math.random() * 25),
      status: 'delivered'
    };
    setMqttMessages(prev => [newMsg, ...prev]);
    apiCreateMqttMessage(newMsg).catch(() => {
      // Keep local state if offline
    });
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
          currentUser={currentUser}
          onOpenPortal={handleOpenPortal}
          onOpenAuth={handleOpenAuth}
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

  // Dedicated Login & Sign Up Page View
  if (viewMode === 'auth') {
    return (
      <div className="w-screen h-screen overflow-y-auto bg-[#070b12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
        <ScreenAuth
          key={`${authMode}-${authRole}`}
          initialMode={authMode}
          initialRole={authRole}
          accounts={accounts}
          onAuthSuccess={handleAuthSuccess}
          onRegisterAccount={handleRegisterAccount}
          onBackToLanding={() => setViewMode('landing')}
        />
      </div>
    );
  }

  // Clean 4-Step Live Portal Workflow Mode (1. Public Landing -> 2. Citizen Portal -> 3. Surveyor GIS Map -> 4. Community Oracle)
  if (viewMode === 'portal') {
    const pendingSpatialCount = parcels.filter(p => p.status === 'draft').length;
    const pendingOracleCount = parcels.filter(p => p.status === 'spatial_verified').length;

    return (
      <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
        {/* Clean Step-by-Step Workflow Header */}
        <header className="bg-[#070b12] border-b border-slate-800 px-4 lg:px-8 h-16 flex items-center justify-between gap-4 shrink-0 z-40">
          {/* Brand Avatar */}
          <button
            onClick={() => setViewMode('landing')}
            className="flex items-center gap-2.5 text-left group shrink-0"
            title="Return to 1. Public Landing Page"
          >
            <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-sm">
              <img 
                src={ASSET_IMAGES.logoAvatar} 
                alt="Anagu Avatar" 
                className="w-full h-full object-cover rounded-full bg-slate-900" 
              />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-white leading-none group-hover:text-emerald-300 transition-colors">
                Anagu Registry
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Live Workflow Portal</div>
            </div>
          </button>

          {/* 1 -> 2 -> 3 -> 4 Step Navigation */}
          <nav className="flex items-center gap-1.5 overflow-x-auto py-1">
            <button
              onClick={() => setViewMode('landing')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Home className="w-3.5 h-3.5 text-emerald-400" />
              <span>1. Public Landing</span>
            </button>

            <span className="text-slate-600 text-xs">/</span>

            <button
              onClick={() => setActivePortalStep('citizen')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                activePortalStep === 'citizen'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>2. Citizen Portal</span>
            </button>

            <span className="text-slate-600 text-xs">/</span>

            <button
              onClick={() => setActivePortalStep('surveyor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                activePortalStep === 'surveyor'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>3. Surveyor GIS Map</span>
              {pendingSpatialCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-900/80 text-sky-300 font-mono">
                  {pendingSpatialCount}
                </span>
              )}
            </button>

            <span className="text-slate-600 text-xs">/</span>

            <button
              onClick={() => setActivePortalStep('oracle')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                activePortalStep === 'oracle'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>4. Community Oracle</span>
              {pendingOracleCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-900/80 text-amber-300 font-mono">
                  {pendingOracleCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right: Signed-In User & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (
              <div className="hidden lg:flex items-center gap-2 pr-2 text-xs text-slate-300">
                <span className="font-semibold text-white whitespace-nowrap">{currentUser.fullName}</span>
                <span className="text-slate-600">&middot;</span>
                <span className="text-emerald-400 font-mono whitespace-nowrap">{currentUser.credentialId}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setViewMode('canvas');
                handleFocusFrame(
                  activePortalStep === 'citizen'
                    ? 'frame-citizen'
                    : activePortalStep === 'surveyor'
                      ? 'frame-surveyor'
                      : 'frame-oracle'
                );
              }}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors shrink-0 whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Design Studio</span>
            </button>
            {currentUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-red-950/60 border border-slate-700 hover:border-red-700/70 text-xs font-medium text-slate-300 hover:text-red-200 transition-colors shrink-0 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenAuth('login', activePortalStep)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors shrink-0 whitespace-nowrap"
              >
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Portal Screen */}
        <main className="flex-1 overflow-hidden">
          {activePortalStep === 'citizen' && (
            <ScreenCitizenPortal
              parcels={parcels}
              onNewParcelSubmit={handleNewParcelSubmit}
              onSelectParcel={(p) => {
                setActiveParcelId(p.id);
                setActivePortalStep('surveyor');
              }}
              selectedParcelId={activeParcelId}
              onSelectParcelId={setActiveParcelId}
              onNextStep={(parcelId) => handleOpenPortal('surveyor', parcelId)}
            />
          )}

          {activePortalStep === 'surveyor' && (
            <ScreenSurveyorCadastral
              parcels={parcels}
              onApproveSpatial={handleApproveSpatial}
              onEmitMqtt={handleEmitMqtt}
              selectedParcelId={activeParcelId}
              onSelectParcelId={setActiveParcelId}
              onNextStep={(parcelId) => handleOpenPortal('oracle', parcelId)}
            />
          )}

          {activePortalStep === 'oracle' && (
            <ScreenCommunityOracle
              parcels={parcels}
              onApproveOracle={handleApproveOracle}
              onEmitMqtt={handleEmitMqtt}
              selectedParcelId={activeParcelId}
              onSelectParcelId={setActiveParcelId}
              onBackToTracker={(parcelId) => handleOpenPortal('citizen', parcelId)}
            />
          )}
        </main>
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
