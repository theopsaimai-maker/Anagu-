import type {
  AccessRoleId,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';

const API_BASE = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const USER_TOKEN_KEY = 'anagu_user_token_v1';

export function clearUserSessionToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

function saveUserSessionToken(token?: string): void {
  if (!token || typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

function getActiveBearerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      localStorage.getItem(USER_TOKEN_KEY) ||
      localStorage.getItem('anagu_admin_token_v1') ||
      null
    );
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  isBackendUnavailable: boolean;

  constructor(message: string, status: number, isBackendUnavailable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isBackendUnavailable = isBackendUnavailable;
  }
}

let backendUnavailableUntil = 0;

export function resetBackendAvailability(): void {
  backendUnavailableUntil = 0;
}

export function isBackendUnavailableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.isBackendUnavailable;
  }
  if (err instanceof TypeError) {
    return true;
  }
  return false;
}

export async function checkBackendAvailable(force = false): Promise<boolean> {
  if (!force && Date.now() < backendUnavailableUntil) return false;

  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      backendUnavailableUntil = Date.now() + 4000;
      return false;
    }
    const data = await response.json().catch(() => null);
    if (data && typeof data === 'object' && 'ok' in data) {
      backendUnavailableUntil = 0;
      return true;
    }
    backendUnavailableUntil = Date.now() + 4000;
    return false;
  } catch {
    backendUnavailableUntil = Date.now() + 2500;
    return false;
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getActiveBearerToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {})
      },
      ...options
    });
  } catch {
    backendUnavailableUntil = Date.now() + 2500;
    throw new ApiError('Unable to reach backend service.', 0, true);
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const serverErrorMsg = (data as { error?: string })?.error;
    const isParcelNotFound = response.status === 404 && serverErrorMsg === 'Parcel not found.';
    const unavailable =
      !isParcelNotFound &&
      (response.status === 404 ||
        response.status === 405 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        !isJson);
    if (unavailable) {
      backendUnavailableUntil = Date.now() + (response.status >= 500 ? 1500 : 4000);
    }
    throw new ApiError(
      serverErrorMsg || `Request failed (${response.status})`,
      response.status,
      unavailable
    );
  }

  backendUnavailableUntil = 0;
  return data as T;
}

export async function apiLogin(email: string, password: string): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser; token?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  saveUserSessionToken(data.token);
  return data.user;
}

export async function apiSignup(payload: {
  fullName: string;
  email: string;
  phone: string;
  role: AccessRoleId;
  state: string;
  credentialId: string;
  password: string;
}): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser; token?: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  saveUserSessionToken(data.token);
  return data.user;
}

export async function apiDemoLogin(role: AccessRoleId): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser; token?: string }>('/api/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ role })
  });
  saveUserSessionToken(data.token);
  return data.user;
}

export async function apiListParcels(): Promise<ParcelRecord[]> {
  const data = await requestJson<{ parcels: ParcelRecord[] }>('/api/parcels');
  return data.parcels;
}

export async function apiCreateParcel(parcel: ParcelRecord, userId?: string): Promise<ParcelRecord> {
  const data = await requestJson<{ parcel: ParcelRecord }>('/api/parcels', {
    method: 'POST',
    body: JSON.stringify({ parcel, userId })
  });
  return data.parcel;
}

export async function apiApproveSpatial(parcelId: string): Promise<ParcelRecord> {
  const data = await requestJson<{ parcel: ParcelRecord }>(`/api/parcels/${encodeURIComponent(parcelId)}/spatial`, {
    method: 'PATCH',
    body: JSON.stringify({})
  });
  return data.parcel;
}

export async function apiApproveOracle(
  parcelId: string,
  details?: {
    affidavitRef?: string;
    familyWitness?: string;
    witnessNotes?: string;
    reviewerId?: string;
    quorumPercent?: number;
    attestationScore?: number;
  }
): Promise<ParcelRecord> {
  const data = await requestJson<{ parcel: ParcelRecord }>(`/api/parcels/${encodeURIComponent(parcelId)}/oracle`, {
    method: 'PATCH',
    body: JSON.stringify(details || {})
  });
  return data.parcel;
}

export async function apiMintTitle(
  parcelId: string,
  tokenId: number,
  txHash: string,
  blockNumber: number,
  issuanceTimestamp: string
): Promise<ParcelRecord> {
  const data = await requestJson<{ parcel: ParcelRecord }>(`/api/parcels/${encodeURIComponent(parcelId)}/mint`, {
    method: 'PATCH',
    body: JSON.stringify({ tokenId, txHash, blockNumber, issuanceTimestamp })
  });
  return data.parcel;
}

export async function apiRevokeTitle(
  parcelId: string,
  ground: RevocationGround,
  gazetteNumber: string,
  reason: string
): Promise<ParcelRecord> {
  const data = await requestJson<{ parcel: ParcelRecord }>(`/api/parcels/${encodeURIComponent(parcelId)}/revoke`, {
    method: 'PATCH',
    body: JSON.stringify({ ground, gazetteNumber, reason })
  });
  return data.parcel;
}

export async function apiListMqttMessages(): Promise<MqttMessage[]> {
  const data = await requestJson<{ messages: MqttMessage[] }>('/api/mqtt');
  return data.messages;
}

export async function apiCreateMqttMessage(message: MqttMessage): Promise<MqttMessage> {
  const data = await requestJson<{ message: MqttMessage }>('/api/mqtt', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  return data.message;
}

export async function apiCreateInquiry(payload: {
  name: string;
  phone: string;
  email?: string;
  state: string;
  message?: string;
}): Promise<void> {
  try {
    await requestJson('/api/inquiries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (!isBackendUnavailableError(err)) {
      throw err;
    }
    try {
      const existing = JSON.parse(localStorage.getItem('anagu_inquiries_v1') || '[]');
      const next = Array.isArray(existing) ? existing : [];
      next.unshift({ ...payload, id: `inq-${Date.now()}`, createdAt: new Date().toISOString() });
      localStorage.setItem('anagu_inquiries_v1', JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
}
