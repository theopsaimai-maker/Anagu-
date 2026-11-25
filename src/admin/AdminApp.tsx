import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Cloud,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  Gavel,
  Landmark,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle
} from 'lucide-react';
import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';
import { ASSET_IMAGES, INITIAL_PARCELS } from '../data/mockData';
import { NIGERIA_STATES_AND_LGAS } from '../data/nigeriaLocations';
import { OpenStreetMapWidget } from '../components/maps/OpenStreetMapWidget';
import { LandRegistrySnapshot } from '../components/maps/LandRegistrySnapshot';
import { describeParcelGeography } from '../lib/geoDescription';
import { apiListParcels } from '../lib/api';
import {
  ADMIN_TOKEN_KEY,
  ADMIN_USER_KEY,
  AdminAuthError,
  type AdminAuthStatus,
  apiAdminAuthStatus,
  apiAdminDeleteInquiry,
  apiAdminDeleteParcel,
  apiAdminDeleteUser,
  apiAdminLogin,
  apiAdminMe,
  apiAdminOverview,
  apiAdminRejectParcel,
  apiAdminRevokeParcel,
  apiAdminSetParcelPending,
  apiAdminSignup,
  apiAdminUpdateUserRole,
  apiAdminVerifyParcel
} from '../lib/adminApi';
import { auth } from '../lib/firebase';
import { FirebaseDomainHelpBanner } from '../components/FirebaseDomainHelpBanner';
import { PolygonAmoyContractsPanel } from '../components/PolygonAmoyContractsPanel';
import {
  addAuthorizedAdminEmail,
  adminDeleteInquiryInFirestore,
  adminDeleteParcelInFirestore,
  adminDeleteUserInFirestore,
  adminRejectParcelInFirestore,
  adminRevokeParcelInFirestore,
  adminSetParcelPendingInFirestore,
  adminUpdateUserRoleInFirestore,
  adminVerifyParcelInFirestore,
  BOOTSTRAPPED_ADMIN_EMAIL,
  checkIsFirebaseAdmin,
  ensureAdminProfileInFirestore,
  fetchAdminsFromFirestore,
  fetchAdminUsersFromFirestore,
  fetchInquiriesFromFirestore,
  mergeParcelLists,
  signInWithGooglePopup,
  signOutFirebaseUser,
  subscribeFirestoreMqttEvents,
  subscribeFirestoreParcels,
  syncParcelsToFirestore,
  UnauthorizedAuthDomainError
} from '../lib/firestoreRegistry';

type AdminTab = 'overview' | 'lands' | 'purchases' | 'users' | 'audit';
type LandFilter = 'pending' | 'registered' | 'rejected' | 'revoked' | 'all';

function isPendingAdminVerification(status: ParcelRecord['status'] | string | undefined): boolean {
  const normalized = String(status || 'draft').trim().toLowerCase();
  return normalized !== 'registered' && normalized !== 'rejected' && normalized !== 'revoked';
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function formatUsd(amount: number): string {
  return usdFormatter.format(amount);
}

function StatusBadge({ status }: { status: ParcelRecord['status'] }) {
  if (status === 'registered') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <BadgeCheck className="w-3.5 h-3.5" />
        <span>Verified · Access Lands</span>
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
        <XCircle className="w-3.5 h-3.5" />
        <span>Rejected</span>
      </span>
    );
  }
  if (status === 'revoked') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
        <Gavel className="w-3.5 h-3.5" />
        <span>Revoked</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
      <Clock className="w-3.5 h-3.5" />
      <span>Pending Admin Verification ({status})</span>
    </span>
  );
}

export const AdminApp: React.FC = () => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      const saved = localStorage.getItem(ADMIN_USER_KEY);
      if (token && saved && !token.startsWith('local-admin-')) {
        return JSON.parse(saved) as AdminUser;
      }
    } catch {
      // Ignore invalid local state
    }
    return null;
  });

  const [isCloudAdmin, setIsCloudAdmin] = useState(false);

  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupDepartment, setSignupDepartment] = useState('National Land Registry Inspectorate');
  const [signupState, setSignupState] = useState('Federal Capital Territory (Abuja)');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupInviteCode, setSignupInviteCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [unauthorizedDomainInfo, setUnauthorizedDomainInfo] = useState<{
    hostname: string;
    projectId: string;
  } | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);

  // Dashboard data
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [landFilter, setLandFilter] = useState<LandFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [inquiries, setInquiries] = useState<AdminInquiryRecord[]>([]);
  const [mqttMessages, setMqttMessages] = useState<MqttMessage[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [autoSync, setAutoSync] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Authorize additional Google Admin email
  const [inviteAdminEmail, setInviteAdminEmail] = useState('');
  const [inviteAdminName, setInviteAdminName] = useState('');
  const [isInvitingAdmin, setIsInvitingAdmin] = useState(false);

  // Modals
  const [inspectParcel, setInspectParcel] = useState<ParcelRecord | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ParcelRecord | null>(null);
  const [revokeGround, setRevokeGround] = useState<RevocationGround>('OverridingPublicInterest');
  const [revokeGazette, setRevokeGazette] = useState('Federal Gazette Notice No. 2026-ADM');
  const [revokeReason, setRevokeReason] = useState('');

  const cloudParcelsRef = useRef<ParcelRecord[]>([]);
  const expressParcelsRef = useRef<ParcelRecord[]>([]);
  const deletedParcelIdsRef = useRef<Set<string>>(new Set());
  const seededInitialCloudRef = useRef(false);

  const recomputeMergedParcels = useCallback(() => {
    const expressList = expressParcelsRef.current.filter(
      (p) => !deletedParcelIdsRef.current.has(p.id)
    );
    const cloudList = cloudParcelsRef.current.filter(
      (p) => !deletedParcelIdsRef.current.has(p.id)
    );
    // Express/Supabase is authoritative for parcel lifecycle and spatial verification state.
    // Firestore records are retained only for parcels absent from the Express response or fallback.
    const merged = mergeParcelLists(expressList, cloudList);
    setParcels(merged);
  }, []);

  const persistSession = (admin: AdminUser, token: string) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
    setAdminUser(admin);
  };

  const clearSession = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    setAdminUser(null);
    setIsCloudAdmin(false);
    void signOutFirebaseUser();
  }, []);

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isUsingFirestoreFallback, setIsUsingFirestoreFallback] = useState(false);
  const [expressSyncError, setExpressSyncError] = useState<string | null>(null);

  const hasActiveExpressAdminToken = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    return Boolean(token && token !== 'firebase-cloud-session');
  }, []);

  const fetchOverview = useCallback(
    async (quiet = false) => {
      if (!quiet) setIsLoadingData(true);
      try {
        const hasExpressToken = hasActiveExpressAdminToken();

        let expressSucceeded = false;
        let cloudSucceeded = false;
        let expressFailureReason: string | null = null;

        // 1. Fetch Express API overview (when signed into Express backend) OR public Express parcels
        if (hasExpressToken) {
          try {
            const data = await apiAdminOverview();
            expressSucceeded = true;
            expressParcelsRef.current = data.parcels;
            setUsers((prev) => {
              const map = new Map<string, AuthUser>();
              for (const u of data.users) map.set(u.id, u);
              for (const u of prev) if (!map.has(u.id)) map.set(u.id, u);
              return Array.from(map.values());
            });
            setInquiries((prev) => {
              const map = new Map<string, AdminInquiryRecord>();
              for (const i of data.inquiries) map.set(i.id, i);
              for (const i of prev) if (!map.has(i.id)) map.set(i.id, i);
              return Array.from(map.values()).sort((a, b) =>
                b.createdAt.localeCompare(a.createdAt)
              );
            });
            setMqttMessages((prev) => {
              const map = new Map<string, MqttMessage>();
              for (const m of data.mqttMessages) map.set(m.id, m);
              for (const m of prev) if (!map.has(m.id)) map.set(m.id, m);
              return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
            });
            setAdmins((prev) => {
              const map = new Map<string, AdminUser>();
              for (const a of data.admins) map.set(a.email.toLowerCase(), a);
              for (const a of prev) {
                const k = a.email.toLowerCase();
                if (!map.has(k)) map.set(k, a);
              }
              return Array.from(map.values());
            });
          } catch (err) {
            expressFailureReason =
              err instanceof Error ? err.message : 'Unable to reach Express admin API.';
            if (err instanceof AdminAuthError) {
              if (!isCloudAdmin) {
                clearSession();
                setAuthError(
                  'Your Express admin session expired. Sign in with Google (Live Cloud Database) or re-enter your admin password.'
                );
                return;
              }
              localStorage.removeItem(ADMIN_TOKEN_KEY);
            }
          }
        } else {
          // Probe public Express parcels so authoritative Express/Supabase records take precedence
          // (Protected MQTT telemetry is loaded via /api/admin/overview when signed in with an Express admin token)
          try {
            const pubParcels = await apiListParcels();
            expressSucceeded = true;
            expressParcelsRef.current = pubParcels;
          } catch (err) {
            expressFailureReason =
              err instanceof Error ? err.message : 'Authoritative Express/Supabase API unreachable.';
          }
        }

        // 2. Fetch Cloud Firestore collections when Cloud Admin is signed in (secondary / cross-device fallback)
        if (isCloudAdmin || auth.currentUser?.emailVerified) {
          cloudSucceeded = true;

          // Mirror authoritative Express parcels to Cloud Firestore (avoid seeding stale INITIAL_PARCELS when Express is live)
          const initialBundle =
            !expressSucceeded && !seededInitialCloudRef.current ? INITIAL_PARCELS : [];
          const expressToSync = expressParcelsRef.current.filter(
            (p) => !deletedParcelIdsRef.current.has(p.id)
          );
          const toSeed = [...expressToSync, ...initialBundle];
          if (toSeed.length > 0) {
            await syncParcelsToFirestore(toSeed, { isAdminSync: true }).catch(() => undefined);
            seededInitialCloudRef.current = true;
          }

          const [cloudUsers, cloudInquiries, cloudAdmins] = await Promise.all([
            fetchAdminUsersFromFirestore().catch(() => [] as AuthUser[]),
            fetchInquiriesFromFirestore().catch(() => [] as AdminInquiryRecord[]),
            fetchAdminsFromFirestore().catch(() => [] as AdminUser[])
          ]);

          if (cloudUsers.length > 0) {
            setUsers((prev) => {
              const map = new Map<string, AuthUser>();
              for (const u of cloudUsers) map.set(u.id, u);
              for (const u of prev) if (!map.has(u.id)) map.set(u.id, u);
              return Array.from(map.values());
            });
          }
          if (cloudInquiries.length > 0) {
            setInquiries((prev) => {
              const map = new Map<string, AdminInquiryRecord>();
              for (const i of cloudInquiries) map.set(i.id, i);
              for (const i of prev) if (!map.has(i.id)) map.set(i.id, i);
              return Array.from(map.values()).sort((a, b) =>
                b.createdAt.localeCompare(a.createdAt)
              );
            });
          }
          if (cloudAdmins.length > 0) {
            setAdmins((prev) => {
              const map = new Map<string, AdminUser>();
              for (const a of cloudAdmins) map.set(a.email.toLowerCase(), a);
              for (const a of prev) {
                const k = a.email.toLowerCase();
                if (!map.has(k)) map.set(k, a);
              }
              return Array.from(map.values());
            });
          }
        }

        recomputeMergedParcels();
        setIsOfflineMode(!cloudSucceeded && !expressSucceeded);
        setIsUsingFirestoreFallback(!expressSucceeded && cloudSucceeded);
        setExpressSyncError(!expressSucceeded ? expressFailureReason : null);
        setLastSyncedAt(new Date().toLocaleTimeString());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to fetch monitoring data.';
        if (!quiet) {
          setFeedbackBanner({ type: 'error', text: message });
        }
      } finally {
        if (!quiet) setIsLoadingData(false);
      }
    },
    [clearSession, hasActiveExpressAdminToken, isCloudAdmin, recomputeMergedParcels]
  );

  // Restore Firebase Google Admin session cleanly across reloads & devices
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !fbUser.emailVerified) {
        return;
      }
      const allowed = await checkIsFirebaseAdmin(fbUser);
      if (!allowed) {
        return;
      }
      try {
        const profile = await ensureAdminProfileInFirestore(fbUser);
        setAdminUser(profile);
        setIsCloudAdmin(true);
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(profile));
        if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
          localStorage.setItem(ADMIN_TOKEN_KEY, 'firebase-cloud-session');
        }
      } catch {
        // Non-blocking
      }
    });
    return unsub;
  }, []);

  // Verify existing Express admin session on mount (if present)
  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token || token === 'firebase-cloud-session') return;
    if (token.startsWith('local-admin-')) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
      setAdminUser(null);
      return;
    }
    let active = true;
    apiAdminMe()
      .then((res) => {
        if (!active) return;
        setAdminUser(res.admin);
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.admin));
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof AdminAuthError) {
          if (!isCloudAdmin) {
            clearSession();
            setAuthError('Your admin session expired. Please sign in to view live registry applications.');
          } else {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [clearSession, isCloudAdmin]);

  // Real-time Cloud Firestore parcel & MQTT listeners + overview refresh
  const adminUserId = adminUser?.id;
  useEffect(() => {
    if (!adminUserId) return;

    const unsubParcels = subscribeFirestoreParcels(
      (cloudList) => {
        cloudParcelsRef.current = cloudList;
        recomputeMergedParcels();
        setIsOfflineMode(false);
        setLastSyncedAt(new Date().toLocaleTimeString());
      },
      () => {
        // Non-blocking error handler
      }
    );

    const unsubMqtt = subscribeFirestoreMqttEvents(
      (cloudEvents) => {
        if (cloudEvents.length === 0) return;
        setMqttMessages((prev) => {
          const map = new Map<string, MqttMessage>();
          for (const m of cloudEvents) map.set(m.id, m);
          for (const m of prev) if (!map.has(m.id)) map.set(m.id, m);
          return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
        });
      },
      () => {
        // Non-blocking
      }
    );

    void fetchOverview(false);
    if (!autoSync) {
      return () => {
        unsubParcels();
        unsubMqtt();
      };
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOverview(true);
      }
    };
    const timer = window.setInterval(() => {
      void fetchOverview(true);
    }, 8000);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      unsubParcels();
      unsubMqtt();
      window.clearInterval(timer);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [adminUserId, isCloudAdmin, autoSync, fetchOverview, recomputeMergedParcels]);

  const handleGoogleAdminLogin = async () => {
    setAuthError(null);
    setUnauthorizedDomainInfo(null);
    setFeedbackBanner(null);
    setIsAuthBusy(true);
    try {
      const fbUser = await signInWithGooglePopup();
      const allowed = await checkIsFirebaseAdmin(fbUser);
      if (!allowed) {
        await signOutFirebaseUser();
        setAuthError(
          `The Google account "${fbUser.email || 'selected account'}" is not yet authorized as a Registry Admin. Sign in with the owner account (${BOOTSTRAPPED_ADMIN_EMAIL}) or ask an authorized admin to add your email under Users & Admins.`
        );
        return;
      }
      const profile = await ensureAdminProfileInFirestore(fbUser);
      setIsCloudAdmin(true);
      setIsOfflineMode(false);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(profile));
      if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
        localStorage.setItem(ADMIN_TOKEN_KEY, 'firebase-cloud-session');
      }
      setAdminUser(profile);
    } catch (err) {
      if (err instanceof UnauthorizedAuthDomainError) {
        setUnauthorizedDomainInfo({ hostname: err.hostname, projectId: err.projectId });
      } else {
        const msg = err instanceof Error ? err.message : 'Google Admin sign-in failed.';
        setAuthError(msg);
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setUnauthorizedDomainInfo(null);
    setIsAuthBusy(true);
    try {
      const res = await apiAdminLogin(loginEmail, loginPassword);
      persistSession(res.admin, res.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  useEffect(() => {
    if (adminUser) return;
    let active = true;
    void apiAdminAuthStatus()
      .then((status) => {
        if (active) setAuthStatus(status);
      })
      .catch(() => {
        // Ignore if Express API is offline; Google Sign-In remains available
      });
    return () => {
      active = false;
    };
  }, [adminUser]);

  const canBootstrapFirstAdmin = Boolean(authStatus?.canBootstrapFirstAdmin);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setUnauthorizedDomainInfo(null);
    if (!signupFullName.trim() || !signupEmail.trim() || !signupPhone.trim()) {
      setAuthError('Please complete all required admin identity fields.');
      return;
    }
    if (!canBootstrapFirstAdmin && !signupInviteCode.trim()) {
      setAuthError(
        'An authorized Admin Invitation Code is required (set via ADMIN_INVITE_SECRET in your server/Vercel Environment Variables).'
      );
      return;
    }
    if (signupPassword.length < 8) {
      setAuthError('Admin password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== signupConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }
    setIsAuthBusy(true);
    try {
      const res = await apiAdminSignup({
        fullName: signupFullName.trim(),
        email: signupEmail.trim(),
        phone: signupPhone.trim(),
        department: signupDepartment.trim(),
        state: signupState,
        password: signupPassword,
        ...(signupInviteCode.trim() ? { inviteCode: signupInviteCode.trim() } : {})
      });
      persistSession(res.admin, res.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to register admin account.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleVerifyParcel = async (parcel: ParcelRecord) => {
    setActionBusyId(parcel.id);
    setFeedbackBanner(null);
    try {
      let updated: ParcelRecord;
      let usedFallbackOnly = false;
      if (hasActiveExpressAdminToken()) {
        // Express/Supabase is authoritative — persist there first, then mirror to Firestore if linked
        updated = await apiAdminVerifyParcel(parcel.id);
        expressParcelsRef.current = [
          updated,
          ...expressParcelsRef.current.filter((p) => p.id !== updated.id)
        ];
        if (isCloudAdmin) {
          void syncParcelsToFirestore([updated], { isAdminSync: true }).catch(() => undefined);
        }
      } else if (isCloudAdmin) {
        usedFallbackOnly = true;
        if (!cloudParcelsRef.current.some((p) => p.id === parcel.id)) {
          await syncParcelsToFirestore([parcel], { isAdminSync: true }).catch(() => undefined);
        }
        updated = await adminVerifyParcelInFirestore(parcel);
      } else {
        updated = await apiAdminVerifyParcel(parcel.id);
      }

      setParcels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (inspectParcel?.id === updated.id) setInspectParcel(updated);
      setFeedbackBanner({
        type: 'success',
        text: usedFallbackOnly
          ? `Verified ${updated.cadastralRef} in Cloud Firestore fallback (Express admin session inactive).`
          : `Verified ${updated.cadastralRef} — now published live as Approved on Access Lands.`
      });
      void fetchOverview(true);
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to verify parcel.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectParcel = async (parcel: ParcelRecord) => {
    setActionBusyId(parcel.id);
    setFeedbackBanner(null);
    try {
      let updated: ParcelRecord;
      let usedFallbackOnly = false;
      if (hasActiveExpressAdminToken()) {
        updated = await apiAdminRejectParcel(parcel.id, 'Rejected by Registry Admin');
        expressParcelsRef.current = [
          updated,
          ...expressParcelsRef.current.filter((p) => p.id !== updated.id)
        ];
        if (isCloudAdmin) {
          void syncParcelsToFirestore([updated], { isAdminSync: true }).catch(() => undefined);
        }
      } else if (isCloudAdmin) {
        usedFallbackOnly = true;
        if (!cloudParcelsRef.current.some((p) => p.id === parcel.id)) {
          await syncParcelsToFirestore([parcel], { isAdminSync: true }).catch(() => undefined);
        }
        updated = await adminRejectParcelInFirestore(parcel, 'Rejected by Registry Admin');
      } else {
        updated = await apiAdminRejectParcel(parcel.id, 'Rejected by Registry Admin');
      }

      setParcels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (inspectParcel?.id === updated.id) setInspectParcel(updated);
      setFeedbackBanner({
        type: 'success',
        text: usedFallbackOnly
          ? `Rejected ${updated.cadastralRef} in Cloud Firestore fallback (Express admin session inactive).`
          : `Rejected ${updated.cadastralRef}. It will remain hidden from Access Lands.`
      });
      void fetchOverview(true);
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reject parcel.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSetPending = async (parcel: ParcelRecord) => {
    setActionBusyId(parcel.id);
    setFeedbackBanner(null);
    try {
      let updated: ParcelRecord;
      let usedFallbackOnly = false;
      if (hasActiveExpressAdminToken()) {
        updated = await apiAdminSetParcelPending(parcel.id);
        expressParcelsRef.current = [
          updated,
          ...expressParcelsRef.current.filter((p) => p.id !== updated.id)
        ];
        if (isCloudAdmin) {
          void syncParcelsToFirestore([updated], { isAdminSync: true }).catch(() => undefined);
        }
      } else if (isCloudAdmin) {
        usedFallbackOnly = true;
        updated = await adminSetParcelPendingInFirestore(parcel);
      } else {
        updated = await apiAdminSetParcelPending(parcel.id);
      }
      setParcels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (inspectParcel?.id === updated.id) setInspectParcel(updated);
      setFeedbackBanner({
        type: 'success',
        text: usedFallbackOnly
          ? `Moved ${updated.cadastralRef} back to Pending in Cloud Firestore fallback.`
          : `Moved ${updated.cadastralRef} back to Pending Admin Verification.`
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update parcel status.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;
    setActionBusyId(revokeTarget.id);
    setFeedbackBanner(null);
    const reasonText =
      revokeReason.trim() || 'Administrative revocation executed from Admin Console';
    try {
      let updated: ParcelRecord;
      let usedFallbackOnly = false;
      if (hasActiveExpressAdminToken()) {
        updated = await apiAdminRevokeParcel(
          revokeTarget.id,
          revokeGround,
          revokeGazette.trim(),
          reasonText
        );
        expressParcelsRef.current = [
          updated,
          ...expressParcelsRef.current.filter((p) => p.id !== updated.id)
        ];
        if (isCloudAdmin) {
          void syncParcelsToFirestore([updated], { isAdminSync: true }).catch(() => undefined);
        }
      } else if (isCloudAdmin) {
        usedFallbackOnly = true;
        updated = await adminRevokeParcelInFirestore(
          revokeTarget,
          revokeGround,
          revokeGazette.trim(),
          reasonText
        );
      } else {
        updated = await apiAdminRevokeParcel(
          revokeTarget.id,
          revokeGround,
          revokeGazette.trim(),
          reasonText
        );
      }
      setParcels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setRevokeTarget(null);
      setRevokeReason('');
      setFeedbackBanner({
        type: 'success',
        text: usedFallbackOnly
          ? `Revoked statutory title for ${updated.cadastralRef} in Cloud Firestore fallback.`
          : `Revoked statutory title for ${updated.cadastralRef}.`
      });
      void fetchOverview(true);
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke title.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteParcel = async (parcel: ParcelRecord) => {
    setActionBusyId(parcel.id);
    try {
      deletedParcelIdsRef.current.add(parcel.id);
      if (hasActiveExpressAdminToken()) {
        await apiAdminDeleteParcel(parcel.id);
        expressParcelsRef.current = expressParcelsRef.current.filter((p) => p.id !== parcel.id);
        if (isCloudAdmin) {
          void adminDeleteParcelInFirestore(parcel.id).catch(() => undefined);
        }
      } else if (isCloudAdmin) {
        await adminDeleteParcelInFirestore(parcel.id);
      } else {
        await apiAdminDeleteParcel(parcel.id);
      }
      setParcels((prev) => prev.filter((p) => p.id !== parcel.id));
      if (inspectParcel?.id === parcel.id) setInspectParcel(null);
      setFeedbackBanner({
        type: 'success',
        text: `Removed parcel ${parcel.cadastralRef} from registry.`
      });
    } catch (err) {
      deletedParcelIdsRef.current.delete(parcel.id);
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete parcel.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleChangeUserRole = async (userId: string, role: AccessRoleId) => {
    setActionBusyId(userId);
    try {
      let updated: AuthUser;
      if (isCloudAdmin) {
        updated = await adminUpdateUserRoleInFirestore(userId, role);
        void apiAdminUpdateUserRole(userId, role).catch(() => undefined);
      } else {
        updated = await apiAdminUpdateUserRole(userId, role);
      }
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setFeedbackBanner({
        type: 'success',
        text: `Updated ${updated.fullName}'s role to ${role}.`
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update user role.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteUser = async (user: AuthUser) => {
    setActionBusyId(user.id);
    try {
      if (isCloudAdmin) {
        await adminDeleteUserInFirestore(user.id);
        void apiAdminDeleteUser(user.id).catch(() => undefined);
      } else {
        await apiAdminDeleteUser(user.id);
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setFeedbackBanner({
        type: 'success',
        text: `Removed user ${user.fullName}.`
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete user.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteInquiry = async (inquiryId: string) => {
    setActionBusyId(inquiryId);
    try {
      if (isCloudAdmin) {
        await adminDeleteInquiryInFirestore(inquiryId);
        void apiAdminDeleteInquiry(inquiryId).catch(() => undefined);
      } else {
        await apiAdminDeleteInquiry(inquiryId);
      }
      setInquiries((prev) => prev.filter((i) => i.id !== inquiryId));
      setFeedbackBanner({ type: 'success', text: 'Purchase/inquiry record archived.' });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove record.'
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleAuthorizeGoogleAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteAdminEmail.trim()) return;
    setIsInvitingAdmin(true);
    setFeedbackBanner(null);
    try {
      const added = await addAuthorizedAdminEmail({
        email: inviteAdminEmail.trim(),
        fullName: inviteAdminName.trim() || inviteAdminEmail.trim(),
        state: adminUser?.state
      });
      setAdmins((prev) => {
        const next = prev.filter((a) => a.email.toLowerCase() !== added.email.toLowerCase());
        return [added, ...next];
      });
      setInviteAdminEmail('');
      setInviteAdminName('');
      setFeedbackBanner({
        type: 'success',
        text: `Authorized ${added.email} to sign in with Google Admin on any PC.`
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to authorize admin email.'
      });
    } finally {
      setIsInvitingAdmin(false);
    }
  };

  // Derived metrics
  const pendingParcels = useMemo(
    () => parcels.filter((p) => isPendingAdminVerification(p.status)),
    [parcels]
  );
  const registeredParcels = useMemo(
    () => parcels.filter((p) => String(p.status).toLowerCase() === 'registered'),
    [parcels]
  );
  const rejectedParcels = useMemo(
    () => parcels.filter((p) => p.status === 'rejected'),
    [parcels]
  );
  const revokedParcels = useMemo(
    () => parcels.filter((p) => p.status === 'revoked'),
    [parcels]
  );
  const totalPortfolioUsd = useMemo(
    () =>
      registeredParcels.reduce(
        (sum, p) => sum + (p.priceUsd && p.priceUsd > 0 ? p.priceUsd : Math.round(p.areaSqm * 45)),
        0
      ),
    [registeredParcels]
  );

  const filteredParcels = useMemo(() => {
    let base = parcels;
    if (landFilter === 'pending') base = pendingParcels;
    else if (landFilter === 'registered') base = registeredParcels;
    else if (landFilter === 'rejected') base = rejectedParcels;
    else if (landFilter === 'revoked') base = revokedParcels;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) =>
        p.cadastralRef.toLowerCase().includes(q) ||
        p.applicantName.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q) ||
        p.lga.toLowerCase().includes(q) ||
        (p.sellerWallet || '').toLowerCase().includes(q)
    );
  }, [parcels, landFilter, pendingParcels, registeredParcels, rejectedParcels, revokedParcels, searchQuery]);

  // ============================================================================
  // UNAUTHENTICATED: ADMIN SIGN IN & ADMIN SIGN UP GATE
  // ============================================================================
  if (!adminUser) {
    return (
      <div className="min-h-screen w-full bg-[#060911] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
        <header className="border-b border-slate-800/80 bg-[#070b12]/95 px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400">
              <img
                src={ASSET_IMAGES.logoAvatar}
                alt="Anagu Emblem"
                className="w-full h-full object-cover rounded-full bg-slate-900"
              />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-none">
                Anagu Admin Control Center
              </div>
              <div className="text-[11px] text-amber-400 mt-0.5 font-medium">
                Restricted Sovereign Registry Operations Portal
              </div>
            </div>
          </div>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            <span>Public Site</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Separate Admin Portal</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {authMode === 'login' ? 'Admin Sign In' : 'Create Admin Account'}
                </h1>
              </div>

              <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl self-start">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setUnauthorizedDomainInfo(null);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    authMode === 'login'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                    setUnauthorizedDomainInfo(null);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    authMode === 'signup'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            </div>

            {/* Primary Cross-Device Cloud Database Admin Sign-In */}
            <div className="space-y-3">
              <button
                type="button"
                disabled={isAuthBusy}
                onClick={() => void handleGoogleAdminLogin()}
                className="w-full py-3 px-4 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-bold text-xs sm:text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2.5 min-h-[44px]"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Sign In with Google (Live Cloud Database)</span>
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Works from any PC or domain with real-time cross-device parcel sync.
              </p>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-800" />
                <span className="shrink-0 mx-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Or Express Server Credentials
                </span>
                <div className="flex-grow border-t border-slate-800" />
              </div>
            </div>

            {unauthorizedDomainInfo && (
              <FirebaseDomainHelpBanner
                hostname={unauthorizedDomainInfo.hostname}
                projectId={unauthorizedDomainInfo.projectId}
              />
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Admin Email *</span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@anagu.ng"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm text-white outline-none"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Password *</span>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isAuthBusy}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {isAuthBusy ? 'Signing In...' : 'Sign In to Admin Portal'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Admin Full Name *</span>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={signupFullName}
                        onChange={(e) => setSignupFullName(e.target.value)}
                        placeholder="e.g. Amina Danjuma"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                      />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Phone *</span>
                    <input
                      type="tel"
                      required
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                      placeholder="+234 803 000 0000"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Official Admin Email *</span>
                  <input
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="operator@anagu.ng"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Department / Unit *</span>
                    <input
                      type="text"
                      required
                      value={signupDepartment}
                      onChange={(e) => setSignupDepartment(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">State Jurisdiction *</span>
                    <select
                      value={signupState}
                      onChange={(e) => setSignupState(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    >
                      {NIGERIA_STATES_AND_LGAS.map((st) => (
                        <option key={st.name} value={st.name}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {canBootstrapFirstAdmin ? (
                  <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-100 text-[11px] leading-relaxed">
                    <span className="font-bold text-emerald-300">First-Run Admin Setup:</span> No
                    administrator account exists on this server yet. Claim the primary admin account
                    below without an invitation code — this one-time setup locks automatically once
                    created.
                  </div>
                ) : (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Admin Invitation Code *</span>
                    <input
                      type="password"
                      required
                      value={signupInviteCode}
                      onChange={(e) => setSignupInviteCode(e.target.value)}
                      placeholder="Enter administrator invitation code"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                    <span className="block text-[11px] text-slate-400">
                      Configured by the project owner via{' '}
                      <code className="text-emerald-300 font-mono">ADMIN_INVITE_SECRET</code> (16+
                      characters) in Vercel / server Environment Variables.
                    </span>
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Password (min 8) *</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Create password"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">Confirm Password *</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isAuthBusy}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isAuthBusy ? 'Creating Admin...' : 'Register Admin & Enter Dashboard'}</span>
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED ADMIN DASHBOARD
  // ============================================================================
  return (
    <div className="min-h-screen w-full bg-[#060911] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#070b12]/95 backdrop-blur-md px-3 sm:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shrink-0">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white leading-none truncate">
              Anagu Admin Control Center
            </div>
            <div className="text-[11px] text-emerald-400 mt-0.5 truncate">
              {adminUser.fullName} · {adminUser.department}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isCloudAdmin ? (
            <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-emerald-950/50 border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cloud Database Live</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleGoogleAdminLogin()}
              disabled={isAuthBusy}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-900 hover:bg-slate-800 border-emerald-500/40 text-emerald-300 text-[11px] font-semibold transition-colors"
              title="Link Google Cloud Admin for real-time cross-device verification & sync"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Link Google Cloud</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
              autoSync
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoSync ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{autoSync ? 'Live Monitor On' : 'Auto-Sync Paused'}</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchOverview(false)}
            disabled={isLoadingData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            title={lastSyncedAt ? `Last synced ${lastSyncedAt}` : 'Refresh live site data'}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoadingData ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            <span className="hidden sm:inline">Public Site</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
          </a>

          <button
            type="button"
            onClick={clearSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-xs font-semibold text-rose-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-4 sm:px-8">
        <nav className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto py-2">
          {(
            [
              { id: 'overview', label: 'Overview & Monitor', icon: LayoutDashboard },
              {
                id: 'lands',
                label: 'Land Verification',
                icon: FileCheck2,
                badge: pendingParcels.length
              },
              {
                id: 'purchases',
                label: 'Purchases & Wallets',
                icon: CreditCard,
                badge: inquiries.length
              },
              { id: 'users', label: 'Users & Admins', icon: Users, badge: users.length },
              { id: 'audit', label: 'Live Audit Feed', icon: Activity, badge: mqttMessages.length }
            ] as Array<{
              id: AdminTab;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
              badge?: number;
            }>
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : tab.id === 'lands' && tab.badge > 0
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {isUsingFirestoreFallback && (
          <div className="rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 border bg-amber-950/70 border-amber-500/60 text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Authoritative Express/Supabase Registry Unreachable</strong> — displaying
                cached Cloud Firestore snapshot only. Spatial verification and lifecycle statuses
                may be stale until backend connectivity is restored.
                {expressSyncError ? ` (${expressSyncError})` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void fetchOverview(false)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold transition-colors"
            >
              Retry Backend Sync
            </button>
          </div>
        )}
        {isOfflineMode && !isCloudAdmin && (
          <div className="rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 border bg-amber-950/60 border-amber-500/50 text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Unable to reach the live server endpoint from this host. Connect Google Cloud Admin for real-time cross-device parcel sync.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGoogleAdminLogin()}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Connect Google Cloud
              </button>
              <button
                type="button"
                onClick={() => void fetchOverview(false)}
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold"
              >
                Retry Live Sync
              </button>
            </div>
          </div>
        )}

        {feedbackBanner && (
          <div
            className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3 border ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/50 border-red-500/40 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{feedbackBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <PolygonAmoyContractsPanel
              parcels={parcels}
              onParcelMinted={(parcelId, tokenId, txHash) => {
                setParcels((prev) =>
                  prev.map((p) =>
                    p.id === parcelId
                      ? { ...p, tokenId, txHash, status: 'registered' }
                      : p
                  )
                );
              }}
            />

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <button
                type="button"
                onClick={() => {
                  setLandFilter('pending');
                  setActiveTab('lands');
                }}
                className="bg-slate-900 hover:bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="text-[11px] font-semibold text-amber-400">
                  Pending Verification
                </div>
                <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {pendingParcels.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Awaiting approval for Access Lands
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLandFilter('registered');
                  setActiveTab('lands');
                }}
                className="bg-slate-900 hover:bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="text-[11px] font-semibold text-emerald-400">
                  Live on Access Lands
                </div>
                <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {registeredParcels.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Verified value: {formatUsd(totalPortfolioUsd)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('purchases')}
                className="bg-slate-900 hover:bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="text-[11px] font-semibold text-sky-400">
                  Purchases &amp; Inquiries
                </div>
                <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {inquiries.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Buyer wallet reservations &amp; TXs
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className="bg-slate-900 hover:bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left transition-colors"
              >
                <div className="text-[11px] font-semibold text-slate-300">
                  Registered Users
                </div>
                <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {users.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Citizens, Surveyors &amp; Elders
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className="bg-slate-900 hover:bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left col-span-2 lg:col-span-1 transition-colors"
              >
                <div className="text-[11px] font-semibold text-purple-400">
                  Audit Events
                </div>
                <div className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {mqttMessages.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {lastSyncedAt ? `Synced ${lastSyncedAt}` : 'Live monitoring'}
                </div>
              </button>
            </div>

            {/* Pending Verification Queue Snapshot */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Lands Awaiting Admin Verification
                  </h2>
                  <p className="text-xs text-slate-400">
                    User-submitted registrations stay hidden from Access Lands until you verify and publish them here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLandFilter('pending');
                    setActiveTab('lands');
                  }}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
                >
                  Open Verification Queue →
                </button>
              </div>

              {pendingParcels.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  All user-submitted lands have been reviewed. No pending applications right now.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {pendingParcels.slice(0, 10).map((parcel) => (
                    <div
                      key={parcel.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-20 h-14 rounded-lg overflow-hidden border border-slate-700 shrink-0 bg-slate-950">
                          <LandRegistrySnapshot
                            coordinates={parcel.coordinates}
                            cadastralRef={parcel.cadastralRef}
                            areaSqm={parcel.areaSqm}
                            stateName={parcel.state}
                            title={parcel.district}
                            snapshotUrl={parcel.mapSnapshotUrl || undefined}
                            compact={true}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {parcel.district || parcel.lga}
                            </span>
                            <span className="font-mono text-[11px] text-emerald-400">
                              {parcel.cadastralRef}
                            </span>
                            <StatusBadge status={parcel.status} />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Applicant: <strong className="text-slate-200">{parcel.applicantName}</strong> ·{' '}
                            {parcel.lga}, {parcel.state} · Price:{' '}
                            <strong className="text-emerald-300">
                              {formatUsd(parcel.priceUsd || Math.round(parcel.areaSqm * 45))}
                            </strong>
                          </div>
                          {parcel.sellerWallet && (
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              Seller Wallet: {parcel.sellerWallet}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectParcel(parcel)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === parcel.id}
                          onClick={() => void handleVerifyParcel(parcel)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-bold text-white transition-colors"
                        >
                          {actionBusyId === parcel.id ? 'Verifying...' : 'Verify & Publish'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === parcel.id}
                          onClick={() => void handleRejectParcel(parcel)}
                          className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-xs font-semibold text-rose-200 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Site Activity Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Latest Land Purchases &amp; Inquiries
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('purchases')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    View All
                  </button>
                </div>
                {inquiries.length === 0 ? (
                  <div className="p-6 text-xs text-slate-400 text-center">
                    No purchase reservations or inquiries logged yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {inquiries.slice(0, 4).map((inq) => (
                      <div key={inq.id} className="p-4 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white">{inq.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(inq.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-400">
                          {inq.phone} · {inq.state}
                        </div>
                        {inq.message && (
                          <p className="text-[11px] text-slate-300 line-clamp-2">{inq.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Live Registry &amp; MQTT Events
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    Full Feed
                  </button>
                </div>
                <div className="divide-y divide-slate-800">
                  {mqttMessages.slice(0, 5).map((msg) => (
                    <div key={msg.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-mono font-semibold text-sky-400 truncate">
                          {msg.topic}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {JSON.stringify(msg.payload)}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {msg.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: LAND VERIFICATION & REGISTRY */}
        {activeTab === 'lands' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                {(
                  [
                    { id: 'pending', label: `Pending Verification (${pendingParcels.length})` },
                    { id: 'registered', label: `Verified · Access Lands (${registeredParcels.length})` },
                    { id: 'rejected', label: `Rejected (${rejectedParcels.length})` },
                    { id: 'revoked', label: `Revoked (${revokedParcels.length})` },
                    { id: 'all', label: `All (${parcels.length})` }
                  ] as Array<{ id: LandFilter; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLandFilter(item.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      landFilter === item.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ref, owner, state, wallet..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs text-white outline-none"
                />
              </div>
            </div>

            {filteredParcels.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3 text-xs text-slate-400">
                <div>
                  {searchQuery.trim()
                    ? `No land parcels match "${searchQuery.trim()}" under this filter.`
                    : 'No land parcels match this filter.'}
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                  >
                    Clear Search Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredParcels.map((parcel) => {
                  const isPending = isPendingAdminVerification(parcel.status);
                  const isRegistered = String(parcel.status).toLowerCase() === 'registered';
                  return (
                    <div
                      key={parcel.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-24 h-20 rounded-xl overflow-hidden border border-slate-700 shrink-0 bg-slate-950">
                          <LandRegistrySnapshot
                            coordinates={parcel.coordinates}
                            cadastralRef={parcel.cadastralRef}
                            areaSqm={parcel.areaSqm}
                            stateName={parcel.state}
                            title={parcel.district}
                            snapshotUrl={parcel.mapSnapshotUrl || undefined}
                            compact={true}
                          />
                        </div>

                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-white">
                              {parcel.district || `${parcel.lga} Land Parcel`}
                            </h3>
                            <span className="font-mono text-xs text-emerald-400">
                              {parcel.cadastralRef}
                            </span>
                            <StatusBadge status={parcel.status} />
                          </div>

                          <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>
                              Owner: <strong className="text-white">{parcel.applicantName}</strong> ({parcel.applicantNin})
                            </span>
                            <span>
                              Location: {parcel.lga}, {parcel.state}
                            </span>
                            <span>
                              Size: {parcel.areaSqm.toLocaleString()} m² · {parcel.intendedUse}
                            </span>
                            <span className="font-bold text-emerald-300">
                              Price: {formatUsd(parcel.priceUsd || Math.round(parcel.areaSqm * 45))}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
                            {parcel.sellerWallet && (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <Wallet className="w-3 h-3" />
                                <span>Seller Wallet: {parcel.sellerWallet}</span>
                              </span>
                            )}
                            <span>Survey Plan: {parcel.surveyPlanRef}</span>
                            {parcel.tokenId && <span>Token #{parcel.tokenId}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectParcel(parcel)}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                        >
                          Inspect Map &amp; Docs
                        </button>

                        {(isPending || parcel.status === 'rejected') && (
                          <button
                            type="button"
                            disabled={actionBusyId === parcel.id}
                            onClick={() => void handleVerifyParcel(parcel)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-bold text-white transition-colors inline-flex items-center gap-1.5"
                          >
                            {actionBusyId === parcel.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <BadgeCheck className="w-3.5 h-3.5" />
                            )}
                            <span>Verify &amp; Publish</span>
                          </button>
                        )}

                        {isPending && (
                          <button
                            type="button"
                            disabled={actionBusyId === parcel.id}
                            onClick={() => void handleRejectParcel(parcel)}
                            className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-xs font-semibold text-rose-200 transition-colors"
                          >
                            Reject
                          </button>
                        )}

                        {isRegistered && (
                          <>
                            <button
                              type="button"
                              disabled={actionBusyId === parcel.id}
                              onClick={() => void handleSetPending(parcel)}
                              className="px-3 py-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/30 text-xs font-semibold text-amber-200 transition-colors"
                            >
                              Unpublish
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevokeTarget(parcel);
                                setRevokeReason('');
                              }}
                              className="px-3 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/50 border border-red-500/40 text-xs font-semibold text-red-200 transition-colors"
                            >
                              Revoke
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          disabled={actionBusyId === parcel.id}
                          onClick={() => void handleDeleteParcel(parcel)}
                          className="p-2 rounded-xl bg-slate-950 hover:bg-red-950/50 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-300 transition-colors"
                          title="Delete parcel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PURCHASES & WALLET TRANSACTIONS */}
        {activeTab === 'purchases' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Buyer Reservations, Direct ETH Payments &amp; Inquiries
                </h2>
                <p className="text-xs text-slate-400">
                  Every Buy Land submission, Web3 wallet proof, direct payment TX hash, and public inquiry.
                </p>
              </div>
            </div>

            {inquiries.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                No purchase requests or inquiries have been submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {inquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">{inq.name}</span>
                        <span className="text-xs font-mono text-emerald-400">{inq.phone}</span>
                        {inq.email && <span className="text-xs text-slate-400">{inq.email}</span>}
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
                          {inq.state}
                        </span>
                      </div>
                      {inq.message && (
                        <div className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono break-all">
                          {inq.message}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500">
                        Submitted: {new Date(inq.createdAt).toLocaleString()} · ID: {inq.id}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={actionBusyId === inq.id}
                      onClick={() => void handleDeleteInquiry(inq.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-red-950/50 border border-slate-800 hover:border-red-500/40 text-xs font-semibold text-slate-300 hover:text-red-300 shrink-0 self-start transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: USERS & ADMINS */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-white">
                  Registered Platform Users ({users.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Manage Citizens, Licensed Surveyors, and Community Oracle Elders across all states.
                </p>
              </div>
              <div className="divide-y divide-slate-800">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-bold text-white">{u.fullName}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {u.email} · {u.phone} · {u.state}
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400">
                        Credential: {u.credentialId} · Joined {u.createdAt}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={u.role}
                        disabled={actionBusyId === u.id}
                        onChange={(e) =>
                          void handleChangeUserRole(u.id, e.target.value as AccessRoleId)
                        }
                        className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-none"
                      >
                        <option value="citizen">Citizen</option>
                        <option value="surveyor">Surveyor</option>
                        <option value="oracle">Community Elder</option>
                      </select>

                      <button
                        type="button"
                        disabled={actionBusyId === u.id}
                        onClick={() => void handleDeleteUser(u)}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-red-950/50 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-300 transition-colors"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden self-start">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-white">
                  Admin Operators ({admins.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Authorized administrators for this portal.
                </p>
              </div>
              {isCloudAdmin && (
                <form
                  onSubmit={handleAuthorizeGoogleAdmin}
                  className="p-4 border-b border-slate-800 bg-slate-950/60 space-y-2.5"
                >
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    Authorize Google Admin Email
                  </div>
                  <input
                    type="text"
                    value={inviteAdminName}
                    onChange={(e) => setInviteAdminName(e.target.value)}
                    placeholder="Admin full name"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg text-xs text-white outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={inviteAdminEmail}
                      onChange={(e) => setInviteAdminEmail(e.target.value)}
                      placeholder="colleague@gmail.com"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg text-xs text-white outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isInvitingAdmin}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-lg whitespace-nowrap shrink-0"
                    >
                      {isInvitingAdmin ? 'Adding...' : 'Authorize'}
                    </button>
                  </div>
                </form>
              )}
              <div className="divide-y divide-slate-800">
                {admins.map((adm) => (
                  <div key={adm.id} className="p-4 space-y-1 text-xs">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{adm.fullName}</span>
                    </div>
                    <div className="text-[11px] text-slate-300">{adm.email}</div>
                    <div className="text-[11px] text-slate-400">
                      {adm.department} · {adm.state}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: AUDIT & MQTT TELEMETRY */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">
                System-Wide Activity &amp; MQTT Audit Stream ({mqttMessages.length})
              </h2>
              <p className="text-xs text-slate-400">
                Real-time trace of land registrations, admin verifications, rejections, and statutory revocations.
              </p>
            </div>
            <div className="divide-y divide-slate-800">
              {mqttMessages.map((msg) => (
                <div key={msg.id} className="p-4 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sky-400">{msg.topic}</span>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span>QoS {msg.qos}</span>
                      <span>·</span>
                      <span>{msg.deliveryLatencyMs} ms</span>
                      <span>·</span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-2.5 overflow-x-auto">
                    {JSON.stringify(msg.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* INSPECT PARCEL MODAL */}
      {inspectParcel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Admin Parcel Inspection · {inspectParcel.cadastralRef}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {inspectParcel.district}, {inspectParcel.lga}, {inspectParcel.state}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectParcel(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 h-48">
                  <OpenStreetMapWidget
                    coordinates={inspectParcel.coordinates}
                    heightClassName="h-full"
                    interactive={false}
                    landmarkLabel={inspectParcel.district}
                  />
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 h-48">
                  <LandRegistrySnapshot
                    coordinates={inspectParcel.coordinates}
                    cadastralRef={inspectParcel.cadastralRef}
                    areaSqm={inspectParcel.areaSqm}
                    stateName={inspectParcel.state}
                    title={inspectParcel.district}
                    snapshotUrl={inspectParcel.mapSnapshotUrl || undefined}
                  />
                </div>
              </div>

              {(() => {
                const adminGeo = describeParcelGeography({
                  state: inspectParcel.state,
                  lga: inspectParcel.lga,
                  district: inspectParcel.district,
                  coordinates: inspectParcel.coordinates,
                  areaSqm: inspectParcel.areaSqm
                });
                return (
                  <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 space-y-1.5 text-[11px]">
                    <div className="font-bold uppercase tracking-wider text-emerald-400 text-[10px]">
                      Geometry Direction &amp; Geographical Area
                    </div>
                    <div className="text-slate-200 leading-relaxed">{adminGeo.fullDescription}</div>
                    <div className="font-mono text-[10px] text-slate-400 break-words">
                      {adminGeo.edgeSummary}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <div className="mt-1">
                    <StatusBadge status={inspectParcel.status} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">Asking Price</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    {formatUsd(inspectParcel.priceUsd || Math.round(inspectParcel.areaSqm * 45))} USD
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Applicant / Titleholder</span>
                  <span className="font-semibold text-white">
                    {inspectParcel.applicantName} ({inspectParcel.applicantNin})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Area &amp; Intended Use</span>
                  <span className="font-semibold text-white">
                    {inspectParcel.areaSqm.toLocaleString()} m² · {inspectParcel.intendedUse}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Seller&apos;s Receiving Wallet</span>
                  <span className="font-mono text-emerald-300 break-all">
                    {inspectParcel.sellerWallet || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Survey Plan Reference</span>
                  <span className="font-mono text-slate-200">{inspectParcel.surveyPlanRef}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Document Hash (SHA-256)</span>
                  <span className="font-mono text-slate-300 truncate block">
                    {inspectParcel.documentHash}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
                {isPendingAdminVerification(inspectParcel.status) ||
                inspectParcel.status === 'rejected' ? (
                  <button
                    type="button"
                    disabled={actionBusyId === inspectParcel.id}
                    onClick={() => void handleVerifyParcel(inspectParcel)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                  >
                    Verify &amp; Publish to Access Lands
                  </button>
                ) : null}

                {isPendingAdminVerification(inspectParcel.status) && (
                  <button
                    type="button"
                    disabled={actionBusyId === inspectParcel.id}
                    onClick={() => void handleRejectParcel(inspectParcel)}
                    className="px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 font-semibold transition-colors"
                  >
                    Reject Registration
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setInspectParcel(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE TITLE MODAL */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmRevoke}
            className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-red-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">
                Revoke Statutory Title · {revokeTarget.cadastralRef}
              </h3>
            </div>

            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-slate-300">Statutory Ground (LUA Section 28)</span>
              <select
                value={revokeGround}
                onChange={(e) => setRevokeGround(e.target.value as RevocationGround)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white outline-none"
              >
                <option value="OverridingPublicInterest">Overriding Public Interest</option>
                <option value="BreachOfStatutoryCondition">Breach of Statutory Condition</option>
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-slate-300">Gazette Notice Reference</span>
              <input
                type="text"
                required
                value={revokeGazette}
                onChange={(e) => setRevokeGazette(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white outline-none"
              />
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-slate-300">Reason / Administrative Order</span>
              <textarea
                rows={3}
                required
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="State reason for revocation..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white outline-none resize-none"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusyId === revokeTarget.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-xs font-bold text-white rounded-xl"
              >
                Confirm Revocation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
