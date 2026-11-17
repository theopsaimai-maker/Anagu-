import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';
import { INITIAL_MQTT_MESSAGES, INITIAL_PARCELS } from '../data/mockData';
import { INITIAL_DEMO_ACCOUNTS } from '../components/screens/ScreenAuth';

export const ADMIN_TOKEN_KEY = 'anagu_admin_token_v1';
export const ADMIN_USER_KEY = 'anagu_admin_user_v1';

const LOCAL_ADMINS_KEY = 'anagu_admins_v1';
const LOCAL_PARCELS_KEY = 'anagu_parcels_v1';
const LOCAL_USERS_KEY = 'anagu_users_v1';
const LOCAL_INQUIRIES_KEY = 'anagu_inquiries_v1';
const LOCAL_MQTT_KEY = 'anagu_mqtt_v1';

const API_BASE = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export interface AdminOverviewResponse {
  parcels: ParcelRecord[];
  users: AuthUser[];
  inquiries: AdminInquiryRecord[];
  mqttMessages: MqttMessage[];
  admins: AdminUser[];
  serverTime: string;
  isOfflineFallback?: boolean;
}

interface StoredLocalAdmin extends AdminUser {
  password: string;
}

const DEFAULT_LOCAL_ADMINS: StoredLocalAdmin[] = [
  {
    id: 'adm-root-01',
    fullName: 'Chief Registry Administrator',
    email: 'admin@anagu.ng',
    phone: '+234 800 262 4800',
    department: 'Federal Ministry of Lands & Urban Development',
    state: 'Federal Capital Territory (Abuja)',
    password: 'anagu-admin',
    createdAt: '2026-01-15'
  }
];

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function getLocalAdmins(): StoredLocalAdmin[] {
  const saved = readJsonStorage<StoredLocalAdmin[]>(LOCAL_ADMINS_KEY, []);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  writeJsonStorage(LOCAL_ADMINS_KEY, DEFAULT_LOCAL_ADMINS);
  return DEFAULT_LOCAL_ADMINS;
}

function stripAdminPassword(admin: StoredLocalAdmin): AdminUser {
  return {
    id: admin.id,
    fullName: admin.fullName,
    email: admin.email,
    phone: admin.phone,
    department: admin.department,
    state: admin.state,
    createdAt: admin.createdAt
  };
}

function getLocalParcels(): ParcelRecord[] {
  const saved = readJsonStorage<ParcelRecord[]>(LOCAL_PARCELS_KEY, []);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return INITIAL_PARCELS;
}

function getLocalUsers(): AuthUser[] {
  const saved = readJsonStorage<Array<AuthUser & { password?: string }>>(LOCAL_USERS_KEY, []);
  const list = Array.isArray(saved) && saved.length > 0 ? saved : INITIAL_DEMO_ACCOUNTS;
  return list.map(({ password: _pw, ...user }) => user);
}

function getLocalInquiries(): AdminInquiryRecord[] {
  const saved = readJsonStorage<AdminInquiryRecord[]>(LOCAL_INQUIRIES_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

function getLocalMqtt(): MqttMessage[] {
  const saved = readJsonStorage<MqttMessage[]>(LOCAL_MQTT_KEY, []);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return INITIAL_MQTT_MESSAGES;
}

function emitLocalMqtt(topic: string, payload: Record<string, unknown>, qos: 1 | 2 = 1): void {
  const existing = getLocalMqtt();
  const nextMsg: MqttMessage = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    topic: topic as MqttMessage['topic'],
    payload,
    qos,
    timestamp: new Date().toLocaleTimeString(),
    deliveryLatencyMs: 36,
    status: 'delivered'
  };
  writeJsonStorage(LOCAL_MQTT_KEY, [nextMsg, ...existing]);
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

class AdminFallbackNeededError extends Error {
  constructor() {
    super('ADMIN_BACKEND_UNAVAILABLE');
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, init);
      if (
        attempt === 0 &&
        (response.status === 502 || response.status === 503 || response.status === 504)
      ) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }
  throw lastError || new Error('Network error');
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {})
      }
    });
  } catch {
    throw new AdminFallbackNeededError();
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const serverMsg = (data as { error?: string })?.error;
    if (response.status === 401 || response.status === 403) {
      throw new AdminAuthError(serverMsg || 'Admin authentication required. Please sign in.', response.status);
    }

    const isRouteMissing =
      !isJson ||
      (response.status === 404 &&
        serverMsg !== 'Parcel not found.' &&
        serverMsg !== 'User not found.' &&
        serverMsg !== 'Inquiry record not found.') ||
      response.status === 405 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    if (isRouteMissing) {
      throw new AdminFallbackNeededError();
    }

    throw new Error(serverMsg || `Request failed (${response.status})`);
  }

  return data as T;
}

export async function apiAdminSignup(payload: {
  fullName: string;
  email: string;
  phone: string;
  department: string;
  state: string;
  password: string;
}): Promise<{ admin: AdminUser; token: string }> {
  try {
    return await adminRequest<{ admin: AdminUser; token: string }>('/api/admin/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const admins = getLocalAdmins();
    const cleanEmail = payload.email.trim().toLowerCase();
    if (admins.some((a) => a.email.toLowerCase() === cleanEmail)) {
      throw new Error('An administrator account with this email already exists.');
    }

    const newAdmin: StoredLocalAdmin = {
      id: `adm-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
      fullName: payload.fullName.trim(),
      email: cleanEmail,
      phone: payload.phone.trim(),
      department: payload.department.trim() || 'Land Registry Administration',
      state: payload.state.trim() || 'Federal Capital Territory (Abuja)',
      password: payload.password,
      createdAt: new Date().toISOString().split('T')[0]
    };

    writeJsonStorage(LOCAL_ADMINS_KEY, [newAdmin, ...admins]);
    const token = `local-admin-${btoa(unescape(encodeURIComponent(cleanEmail)))}-${Date.now()}`;
    return { admin: stripAdminPassword(newAdmin), token };
  }
}

export async function apiAdminLogin(
  email: string,
  password: string
): Promise<{ admin: AdminUser; token: string }> {
  try {
    return await adminRequest<{ admin: AdminUser; token: string }>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const admins = getLocalAdmins();
    const cleanEmail = email.trim().toLowerCase();
    const found = admins.find(
      (a) => a.email.toLowerCase() === cleanEmail && a.password === password
    );
    if (!found) {
      throw new Error('Invalid administrator email or password.');
    }
    const token = `local-admin-${btoa(unescape(encodeURIComponent(cleanEmail)))}-${Date.now()}`;
    return { admin: stripAdminPassword(found), token };
  }
}

export async function apiAdminMe(): Promise<{ admin: AdminUser }> {
  try {
    return await adminRequest<{ admin: AdminUser }>('/api/admin/auth/me');
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const savedUser = readJsonStorage<AdminUser | null>(ADMIN_USER_KEY, null);
    if (!savedUser) {
      throw new AdminAuthError('Admin session expired.');
    }
    return { admin: savedUser };
  }
}

export async function apiAdminOverview(): Promise<AdminOverviewResponse> {
  try {
    return await adminRequest<AdminOverviewResponse>('/api/admin/overview');
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    return {
      parcels: getLocalParcels(),
      users: getLocalUsers(),
      inquiries: getLocalInquiries(),
      mqttMessages: getLocalMqtt(),
      admins: getLocalAdmins().map(stripAdminPassword),
      serverTime: new Date().toISOString(),
      isOfflineFallback: true
    };
  }
}

export async function apiAdminVerifyParcel(parcelId: string): Promise<ParcelRecord> {
  try {
    const data = await adminRequest<{ parcel: ParcelRecord }>(
      `/api/admin/parcels/${encodeURIComponent(parcelId)}/verify`,
      { method: 'PATCH', body: JSON.stringify({}) }
    );
    return data.parcel;
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const parcels = getLocalParcels();
    let updatedParcel: ParcelRecord | null = null;
    const next = parcels.map((p) => {
      if (p.id !== parcelId) return p;
      updatedParcel = {
        ...p,
        status: 'registered',
        tokenId: p.tokenId ?? Math.floor(4300 + Math.random() * 5000),
        txHash:
          p.txHash ||
          '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        blockNumber: p.blockNumber ?? Math.floor(1892100 + Math.random() * 1000),
        issuanceTimestamp: p.issuanceTimestamp || new Date().toISOString()
      };
      return updatedParcel;
    });
    if (!updatedParcel) throw new Error('Parcel not found.');
    writeJsonStorage(LOCAL_PARCELS_KEY, next);
    emitLocalMqtt('land/title/issued', {
      parcelId,
      cadastralRef: (updatedParcel as ParcelRecord).cadastralRef,
      publishedToAccessLands: true
    });
    return updatedParcel;
  }
}

export async function apiAdminRejectParcel(parcelId: string, reason?: string): Promise<ParcelRecord> {
  try {
    const data = await adminRequest<{ parcel: ParcelRecord }>(
      `/api/admin/parcels/${encodeURIComponent(parcelId)}/reject`,
      { method: 'PATCH', body: JSON.stringify({ reason }) }
    );
    return data.parcel;
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const parcels = getLocalParcels();
    let updatedParcel: ParcelRecord | null = null;
    const next = parcels.map((p) => {
      if (p.id !== parcelId) return p;
      updatedParcel = { ...p, status: 'rejected' };
      return updatedParcel;
    });
    if (!updatedParcel) throw new Error('Parcel not found.');
    writeJsonStorage(LOCAL_PARCELS_KEY, next);
    emitLocalMqtt('land/registration/status', {
      parcelId,
      status: 'rejected',
      reason: reason || 'Rejected during admin registry review'
    });
    return updatedParcel;
  }
}

export async function apiAdminSetParcelPending(parcelId: string): Promise<ParcelRecord> {
  try {
    const data = await adminRequest<{ parcel: ParcelRecord }>(
      `/api/admin/parcels/${encodeURIComponent(parcelId)}/pending`,
      { method: 'PATCH', body: JSON.stringify({}) }
    );
    return data.parcel;
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const parcels = getLocalParcels();
    let updatedParcel: ParcelRecord | null = null;
    const next = parcels.map((p) => {
      if (p.id !== parcelId) return p;
      updatedParcel = { ...p, status: 'draft' };
      return updatedParcel;
    });
    if (!updatedParcel) throw new Error('Parcel not found.');
    writeJsonStorage(LOCAL_PARCELS_KEY, next);
    return updatedParcel;
  }
}

export async function apiAdminRevokeParcel(
  parcelId: string,
  ground: RevocationGround,
  gazetteNumber: string,
  reason: string
): Promise<ParcelRecord> {
  try {
    const data = await adminRequest<{ parcel: ParcelRecord }>(
      `/api/admin/parcels/${encodeURIComponent(parcelId)}/revoke`,
      { method: 'PATCH', body: JSON.stringify({ ground, gazetteNumber, reason }) }
    );
    return data.parcel;
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const parcels = getLocalParcels();
    let updatedParcel: ParcelRecord | null = null;
    const next = parcels.map((p) => {
      if (p.id !== parcelId) return p;
      updatedParcel = {
        ...p,
        status: 'revoked',
        revocationData: {
          ground,
          revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (ADMIN_GOVERNANCE)',
          timestamp: new Date().toISOString(),
          gazetteNumber,
          reason,
          revocationTxHash:
            '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
        }
      };
      return updatedParcel;
    });
    if (!updatedParcel) throw new Error('Parcel not found.');
    writeJsonStorage(LOCAL_PARCELS_KEY, next);
    emitLocalMqtt('land/title/revoked', { parcelId, ground }, 2);
    return updatedParcel;
  }
}

export async function apiAdminDeleteParcel(parcelId: string): Promise<void> {
  try {
    await adminRequest(`/api/admin/parcels/${encodeURIComponent(parcelId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const parcels = getLocalParcels();
    writeJsonStorage(
      LOCAL_PARCELS_KEY,
      parcels.filter((p) => p.id !== parcelId)
    );
  }
}

export async function apiAdminUpdateUserRole(userId: string, role: AccessRoleId): Promise<AuthUser> {
  try {
    const data = await adminRequest<{ user: AuthUser }>(
      `/api/admin/users/${encodeURIComponent(userId)}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) }
    );
    return data.user;
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const saved = readJsonStorage<Array<AuthUser & { password?: string }>>(
      LOCAL_USERS_KEY,
      INITIAL_DEMO_ACCOUNTS
    );
    let updated: AuthUser | null = null;
    const next = saved.map((u) => {
      if (u.id !== userId) return u;
      const changed = { ...u, role };
      const { password: _pw, ...pub } = changed;
      updated = pub;
      return changed;
    });
    if (!updated) throw new Error('User not found.');
    writeJsonStorage(LOCAL_USERS_KEY, next);
    return updated;
  }
}

export async function apiAdminDeleteUser(userId: string): Promise<void> {
  try {
    await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const saved = readJsonStorage<Array<AuthUser & { password?: string }>>(
      LOCAL_USERS_KEY,
      INITIAL_DEMO_ACCOUNTS
    );
    writeJsonStorage(
      LOCAL_USERS_KEY,
      saved.filter((u) => u.id !== userId)
    );
  }
}

export async function apiAdminDeleteInquiry(inquiryId: string): Promise<void> {
  try {
    await adminRequest(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    if (!(err instanceof AdminFallbackNeededError)) throw err;

    const existing = getLocalInquiries();
    writeJsonStorage(
      LOCAL_INQUIRIES_KEY,
      existing.filter((item) => item.id !== inquiryId)
    );
  }
}
