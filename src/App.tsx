/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
import { ScreenVerifiedLands } from './components/screens/ScreenVerifiedLands';
import { ScreenAuth, INITIAL_DEMO_ACCOUNTS, StoredAuthAccount } from './components/screens/ScreenAuth';
import { ScreenCitizenPortal } from './components/screens/ScreenCitizenPortal';
import { ScreenSurveyorCadastral } from './components/screens/ScreenSurveyorCadastral';
import { ScreenCommunityOracle } from './components/screens/ScreenCommunityOracle';
import { FigmaGuidedTour, TOUR_STEPS } from './components/figma/FigmaGuidedTour';
import { FigmaShortcutsModal } from './components/figma/FigmaShortcutsModal';
import { Home } from 'lucide-react';
import {
  apiApproveOracle,
  apiApproveSpatial,
  apiCreateMqttMessage,
  apiCreateParcel,
  apiListMqttMessages,
  apiListParcels,
  apiMintTitle,
  apiRevokeTitle,
  apiSignup,
  checkBackendAvailable,
  clearUserSessionToken
} from './lib/api';
import { auth } from './lib/firebase';
import {
  mergeParcelLists,
  saveMqttEventToFirestore,
  saveParcelToFirestore,
  saveUserProfileToFirestore,
  signInWithGooglePopup,
  signOutFirebaseUser,
  subscribeFirestoreMqttEvents,
  subscribeFirestoreParcels,
  updateParcelStageInFirestore
} from './lib/firestoreRegistry';

const STORAGE_KEY = 'anagu_parcels_v1';
const UNSYNCED_PARCELS_KEY = 'anagu_unsynced_parcels_v1';
const UNSYNCED_CLOUD_PARCELS_KEY = 'anagu_unsynced_cloud_parcels_v1';
const USERS_STORAGE_KEY = 'anagu_users_v1';
const SYNCED_EMAILS_KEY = 'anagu_synced_user_emails_v1';
const SESSION_STORAGE_KEY = 'anagu_session_v1';
const DEMO_SEED_IDS = new Set(['usr-citizen-01', 'usr-surveyor-01', 'usr-oracle-01']);

function readStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, items: string[]): void {
  try {
    const unique = Array.from(new Set(items));
    if (unique.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(unique));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function readUnsyncedParcelIds(): string[] {
  return readStringList(UNSYNCED_PARCELS_KEY);
}

function writeUnsyncedParcelIds(ids: string[]): void {
  writeStringList(UNSYNCED_PARCELS_KEY, ids);
}

function readUnsyncedCloudParcelIds(): string[] {
  return readStringList(UNSYNCED_CLOUD_PARCELS_KEY);
}

function writeUnsyncedCloudParcelIds(ids: string[]): void {
  writeStringList(UNSYNCED_CLOUD_PARCELS_KEY, ids);
}

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

  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(() =>
    Boolean(auth.currentUser && auth.currentUser.emailVerified)
  );
  const cloudParcelsRef = useRef<ParcelRecord[]>([]);
  const expressParcelsRef = useRef<ParcelRecord[]>([]);
  const parcelsRef = useRef<ParcelRecord[]>(parcels);

  useEffect(() => {
    parcelsRef.current = parcels;
  }, [parcels]);

  const applyMergedParcels = useCallback(() => {
    const cloudList = cloudParcelsRef.current;
    const expressList = expressParcelsRef.current;
    const cloudIds = new Set(cloudList.map((p) => p.id));
    const pendingSet = new Set([...readUnsyncedParcelIds(), ...readUnsyncedCloudParcelIds()]);

    const remainingCloudIds = readUnsyncedCloudParcelIds().filter((id) => !cloudIds.has(id));
    writeUnsyncedCloudParcelIds(remainingCloudIds);

    const localPendingOnly = parcelsRef.current.filter(
      (p) => !cloudIds.has(p.id) && pendingSet.has(p.id)
    );
    const merged = mergeParcelLists(
      cloudList,
      expressList,
      localPendingOnly,
      INITIAL_PARCELS
    );
    setParcels(merged);
    setActiveParcelId((prevActive) =>
      prevActive && merged.some((p) => p.id === prevActive)
        ? prevActive
        : merged[1]?.id || merged[0]?.id || ''
    );
  }, []);

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

  const [mqttMessages, setMqttMessages] = useState<MqttMessage[]>(() => {
    try {
      const saved = localStorage.getItem('anagu_mqtt_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial messages
    }
    return INITIAL_MQTT_MESSAGES;
  });

  useEffect(() => {
    try {
      localStorage.setItem('anagu_mqtt_v1', JSON.stringify(mqttMessages));
    } catch {
      // Ignore storage quota errors
    }
  }, [mqttMessages]);

  const [selectedFrameId, setSelectedFrameId] = useState<FigmaFrameId>('frame-landing');
  const [viewMode, setViewMode] = useState<FigmaViewMode>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authRole, setAuthRole] = useState<AccessRoleId>('citizen');
  const [activePortalStep, setActivePortalStep] = useState<PortalStepId>('citizen');
  const [activeParcelId, setActiveParcelId] = useState<string>(parcels[1]?.id || parcels[0]?.id || '');

  const syncFromBackend = useCallback(async (forceHealth = false) => {
    try {
      const hasBackend = await checkBackendAvailable(forceHealth);
      if (!hasBackend) return;

      const pendingIds = readUnsyncedParcelIds();
      let currentLocalParcels: ParcelRecord[] = [];
      try {
        const rawLocal = localStorage.getItem(STORAGE_KEY);
        const parsed = rawLocal ? JSON.parse(rawLocal) : [];
        if (Array.isArray(parsed)) currentLocalParcels = parsed;
      } catch {
        currentLocalParcels = [];
      }

      const [initialRemoteParcels, remoteMqtt] = await Promise.all([
        apiListParcels(),
        apiListMqttMessages()
      ]);

      let remoteParcels = Array.isArray(initialRemoteParcels) ? initialRemoteParcels : [];
      const remoteIdSet = new Set(remoteParcels.map((p) => p.id));

      // Replay any local submissions that were not yet persisted on the server
      if (pendingIds.length > 0) {
        const stillUnsynced: string[] = [];
        for (const pendingId of pendingIds) {
          if (remoteIdSet.has(pendingId)) continue;
          const candidate = currentLocalParcels.find((p) => p.id === pendingId);
          if (!candidate) continue;
          try {
            const uploaded = await apiCreateParcel(candidate, currentUser?.id);
            remoteParcels = [uploaded, ...remoteParcels.filter((p) => p.id !== uploaded.id)];
            remoteIdSet.add(uploaded.id);
          } catch {
            stillUnsynced.push(pendingId);
          }
        }
        writeUnsyncedParcelIds(stillUnsynced);
      }

      // Replay any local custom accounts that have not yet been synced to the server
      try {
        const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
        const savedUsers: StoredAuthAccount[] = rawUsers ? JSON.parse(rawUsers) : [];
        if (Array.isArray(savedUsers) && savedUsers.length > 0) {
          const syncedSet = new Set(readStringList(SYNCED_EMAILS_KEY).map((e) => e.toLowerCase()));
          let changed = false;
          for (const acc of savedUsers) {
            if (!acc?.email || !acc?.password || DEMO_SEED_IDS.has(acc.id)) continue;
            const normEmail = acc.email.trim().toLowerCase();
            if (syncedSet.has(normEmail)) continue;
            try {
              await apiSignup({
                fullName: acc.fullName,
                email: normEmail,
                phone: acc.phone,
                role: acc.role,
                state: acc.state,
                credentialId: acc.credentialId,
                password: acc.password
              });
              syncedSet.add(normEmail);
              changed = true;
            } catch (err) {
              const msg = err instanceof Error ? err.message.toLowerCase() : '';
              if (msg.includes('already exists')) {
                syncedSet.add(normEmail);
                changed = true;
              }
            }
          }
          if (changed) {
            writeStringList(SYNCED_EMAILS_KEY, Array.from(syncedSet));
          }
        }
      } catch {
        // Ignore user replay errors
      }

      if (Array.isArray(remoteParcels)) {
        expressParcelsRef.current = remoteParcels;
        applyMergedParcels();
      }
      if (Array.isArray(remoteMqtt) && remoteMqtt.length > 0) {
        setMqttMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const item of remoteMqtt) {
            if (!seen.has(item.id)) {
              merged.push(item);
              seen.add(item.id);
            }
          }
          return merged.sort((a, b) => b.id.localeCompare(a.id));
        });
      }
    } catch {
      // Keep local cache + Cloud Firestore if backend Express API is temporarily unavailable
    }
  }, [currentUser?.id, applyMergedParcels]);

  const flushPendingCloudParcels = useCallback(async () => {
    if (!auth.currentUser?.emailVerified) return;
    const pendingCloudIds = readUnsyncedCloudParcelIds();
    if (pendingCloudIds.length === 0) return;

    const currentList = parcelsRef.current;
    const remaining: string[] = [];
    for (const id of pendingCloudIds) {
      const candidate = currentList.find((p) => p.id === id);
      if (!candidate) continue;
      try {
        await saveParcelToFirestore(candidate);
      } catch {
        remaining.push(id);
      }
    }
    writeUnsyncedCloudParcelIds(remaining);
  }, []);

  // Listen to Firebase Auth state & subscribe to real-time Cloud Firestore parcels + MQTT feed
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      const verified = Boolean(fbUser && fbUser.emailVerified);
      setIsCloudConnected(verified);
      if (verified) {
        void flushPendingCloudParcels();
      }
    });

    const unsubParcels = subscribeFirestoreParcels(
      (cloudList) => {
        cloudParcelsRef.current = cloudList;
        applyMergedParcels();
      },
      () => {
        // Non-blocking fallback to Express / local cache
      }
    );

    const unsubMqtt = subscribeFirestoreMqttEvents(
      (cloudEvents) => {
        if (cloudEvents.length === 0) return;
        setMqttMessages((prev) => {
          const map = new Map<string, MqttMessage>();
          for (const item of cloudEvents) map.set(item.id, item);
          for (const item of prev) {
            if (!map.has(item.id)) map.set(item.id, item);
          }
          return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
        });
      },
      () => {
        // Non-blocking fallback
      }
    );

    return () => {
      unsubAuth();
      unsubParcels();
      unsubMqtt();
    };
  }, [applyMergedParcels, flushPendingCloudParcels]);

  // Hydrate registry parcels & MQTT log from Express database (or cross-tab storage) on mount, focus, visibility & interval
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setParcels(parsed);
        } catch {
          // Ignore malformed storage payload
        }
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncFromBackend(true);
        void flushPendingCloudParcels();
      }
    };

    void syncFromBackend(true);
    const intervalId = window.setInterval(() => void syncFromBackend(false), 8000);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [syncFromBackend, flushPendingCloudParcels]);

  useEffect(() => {
    if (viewMode === 'lands' || viewMode === 'portal') {
      void syncFromBackend(true);
    }
  }, [viewMode, syncFromBackend]);
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

  const handleRegisterAccount = useCallback((newAccount: StoredAuthAccount, needsBackendSync = false) => {
    const cleanEmail = newAccount.email.trim().toLowerCase();
    setAccounts((prev) => [newAccount, ...prev.filter((a) => a.email.toLowerCase() !== cleanEmail)]);
    if (!needsBackendSync) {
      writeStringList(SYNCED_EMAILS_KEY, [...readStringList(SYNCED_EMAILS_KEY), cleanEmail]);
    }
  }, []);

  const handleAuthSuccess = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setActivePortalStep(user.role);
    setViewMode('portal');
  }, []);

  const handleSignOut = useCallback(() => {
    clearUserSessionToken();
    void signOutFirebaseUser();
    setCurrentUser(null);
    setViewMode('landing');
  }, []);

  const handleConnectGoogleSync = useCallback(async () => {
    const fbUser = await signInWithGooglePopup();
    const role = currentUser?.role || authRole || 'citizen';
    const syncedUser = await saveUserProfileToFirestore(fbUser, role, {
      fullName: currentUser?.fullName,
      phone: currentUser?.phone,
      state: currentUser?.state,
      credentialId: currentUser?.credentialId
    });
    if (!currentUser || currentUser.id.startsWith('usr-')) {
      setCurrentUser(syncedUser);
    }
    setIsCloudConnected(true);
    await flushPendingCloudParcels();
  }, [currentUser, authRole, flushPendingCloudParcels]);

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

  // Pipeline state handlers (optimistic state + awaited Cloud Firestore & Express persistence)
  const handleNewParcelSubmit = async (newParcel: ParcelRecord): Promise<ParcelRecord> => {
    setParcels(prev => [newParcel, ...prev.filter(p => p.id !== newParcel.id)]);
    writeUnsyncedParcelIds([...readUnsyncedParcelIds(), newParcel.id]);
    writeUnsyncedCloudParcelIds([...readUnsyncedCloudParcelIds(), newParcel.id]);

    let finalParcel = newParcel;

    // 1. Write to Cloud Firestore immediately when signed in with Google
    if (auth.currentUser?.emailVerified) {
      try {
        const cloudSaved = await saveParcelToFirestore(newParcel);
        finalParcel = cloudSaved;
        writeUnsyncedCloudParcelIds(
          readUnsyncedCloudParcelIds().filter((id) => id !== newParcel.id && id !== cloudSaved.id)
        );
      } catch {
        // Keep in unsynced cloud queue for retry
      }
    }

    // 2. Also persist to Express backend API when available
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const saved = await apiCreateParcel(finalParcel, currentUser?.id);
        finalParcel = saved;
        writeUnsyncedParcelIds(readUnsyncedParcelIds().filter((id) => id !== newParcel.id && id !== saved.id));
        setParcels(prev => prev.map(p => (p.id === saved.id || p.id === newParcel.id ? saved : p)));
        break;
      } catch {
        if (attempt === 0) {
          await new Promise((r) => window.setTimeout(r, 400));
        }
      }
    }

    handleEmitMqtt('land/registration/status', {
      applicationId: finalParcel.id,
      status: 'submitted',
      applicant: finalParcel.applicantName,
      cadastralRef: finalParcel.cadastralRef,
      timestamp: new Date().toISOString()
    });
    return finalParcel;
  };

  const handleApproveSpatial = (parcelId: string) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, status: 'spatial_verified' } : p));
    void updateParcelStageInFirestore(parcelId, 'spatial_verified');
    apiApproveSpatial(parcelId).catch(() => {
      // Keep local state if offline
    });
  };

  const handleApproveOracle = (parcelId: string, details?: Record<string, any>) => {
    setParcels(prev => prev.map(p => p.id === parcelId ? { ...p, status: 'oracle_verified' } : p));
    void updateParcelStageInFirestore(parcelId, 'oracle_verified');
    apiApproveOracle(parcelId, details).catch(() => {
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
    void saveMqttEventToFirestore(newMsg);
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
      <div className="min-h-screen w-full overflow-x-hidden bg-[#070b12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
        <ScreenLandingPage
          parcels={parcels}
          currentUser={currentUser}
          onOpenPortal={handleOpenPortal}
          onOpenAuth={handleOpenAuth}
          onOpenLands={() => setViewMode('lands')}
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

  // Verified Lands Marketplace View (3 columns x 3 rows)
  if (viewMode === 'lands') {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-[#070b12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
        <ScreenVerifiedLands
          parcels={parcels}
          currentUser={currentUser}
          onBackToLanding={() => setViewMode('landing')}
          onOpenRegister={() => {
            if (currentUser) {
              handleOpenPortal('citizen');
            } else {
              handleOpenAuth('login', 'citizen');
            }
          }}
        />
      </div>
    );
  }

  // Dedicated Login & Sign Up Page View
  if (viewMode === 'auth') {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-[#070b12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
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

  // Clean Live Portal View
  if (viewMode === 'portal') {
    return (
      <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-x-hidden font-sans">
        {/* Clean Portal Header */}
        <header className="sticky top-0 bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-40">
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

          {/* Right: Portal Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('lands')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors shrink-0 whitespace-nowrap"
            >
              <span>Access Lands</span>
            </button>
            {currentUser ? (
              <button
                type="button"
                onClick={() => setViewMode('landing')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500/60 text-xs font-medium text-slate-200 hover:text-emerald-300 transition-colors shrink-0 whitespace-nowrap"
              >
                <Home className="w-3.5 h-3.5 text-emerald-400" />
                <span>Home</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenAuth('login', activePortalStep)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white transition-colors shrink-0 whitespace-nowrap"
              >
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Portal Screen */}
        <main className="flex-1 flex flex-col">
          {activePortalStep === 'citizen' && (
            <ScreenCitizenPortal
              parcels={parcels}
              currentUser={currentUser}
              isCloudConnected={isCloudConnected}
              onConnectGoogleSync={handleConnectGoogleSync}
              onNewParcelSubmit={handleNewParcelSubmit}
              onSelectParcel={(p) => {
                setActiveParcelId(p.id);
                setActivePortalStep('surveyor');
              }}
              selectedParcelId={activeParcelId}
              onSelectParcelId={setActiveParcelId}
              onNextStep={(parcelId) => handleOpenPortal('surveyor', parcelId)}
              onOpenLands={() => setViewMode('lands')}
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
