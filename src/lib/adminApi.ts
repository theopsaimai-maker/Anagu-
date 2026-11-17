import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';
import { buildApiUrl, getCandidateApiBases, setResolvedApiBase } from './apiBase';

export const ADMIN_TOKEN_KEY = 'anagu_admin_token_v1';
export const ADMIN_USER_KEY = 'anagu_admin_user_v1';

export interface AdminOverviewResponse {
  parcels: ParcelRecord[];
  users: AuthUser[];
  inquiries: AdminInquiryRecord[];
  mqttMessages: MqttMessage[];
  admins: AdminUser[];
  serverTime: string;
  isOfflineFallback?: boolean;
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

export class AdminBackendUnavailableError extends Error {
  isBackendUnavailable = true;
  constructor(
    message = 'Live Express API is not reachable from this host. Use "Sign In with Google (Live Cloud Database)" to sync parcels and admin operations across all devices.'
  ) {
    super(message);
    this.name = 'AdminBackendUnavailableError';
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
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  throw lastError || new Error('Network error');
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  const bases = getCandidateApiBases();
  let lastUnavailable = false;

  for (const base of bases) {
    let response: Response;
    try {
      response = await fetchWithRetry(buildApiUrl(path, base), {
        cache: 'no-store',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options?.headers || {})
        }
      });
    } catch {
      lastUnavailable = true;
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
      const serverMsg = (data as { error?: string })?.error;
      if (response.status === 401 || response.status === 403) {
        setResolvedApiBase(base);
        throw new AdminAuthError(
          serverMsg || 'Admin authentication required. Please sign in.',
          response.status
        );
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
        lastUnavailable = true;
        continue;
      }

      setResolvedApiBase(base);
      throw new Error(serverMsg || `Request failed (${response.status})`);
    }

    setResolvedApiBase(base);
    return data as T;
  }

  void lastUnavailable;
  throw new AdminBackendUnavailableError();
}

export async function apiAdminSignup(payload: {
  fullName: string;
  email: string;
  phone: string;
  department: string;
  state: string;
  password: string;
}): Promise<{ admin: AdminUser; token: string }> {
  return adminRequest<{ admin: AdminUser; token: string }>('/api/admin/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function apiAdminLogin(
  email: string,
  password: string
): Promise<{ admin: AdminUser; token: string }> {
  return adminRequest<{ admin: AdminUser; token: string }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function apiAdminMe(): Promise<{ admin: AdminUser }> {
  return adminRequest<{ admin: AdminUser }>('/api/admin/auth/me');
}

export async function apiAdminOverview(): Promise<AdminOverviewResponse> {
  return adminRequest<AdminOverviewResponse>('/api/admin/overview');
}

export async function apiAdminVerifyParcel(parcelId: string): Promise<ParcelRecord> {
  const data = await adminRequest<{ parcel: ParcelRecord }>(
    `/api/admin/parcels/${encodeURIComponent(parcelId)}/verify`,
    { method: 'PATCH', body: JSON.stringify({}) }
  );
  return data.parcel;
}

export async function apiAdminRejectParcel(parcelId: string, reason?: string): Promise<ParcelRecord> {
  const data = await adminRequest<{ parcel: ParcelRecord }>(
    `/api/admin/parcels/${encodeURIComponent(parcelId)}/reject`,
    { method: 'PATCH', body: JSON.stringify({ reason }) }
  );
  return data.parcel;
}

export async function apiAdminSetParcelPending(parcelId: string): Promise<ParcelRecord> {
  const data = await adminRequest<{ parcel: ParcelRecord }>(
    `/api/admin/parcels/${encodeURIComponent(parcelId)}/pending`,
    { method: 'PATCH', body: JSON.stringify({}) }
  );
  return data.parcel;
}

export async function apiAdminRevokeParcel(
  parcelId: string,
  ground: RevocationGround,
  gazetteNumber: string,
  reason: string
): Promise<ParcelRecord> {
  const data = await adminRequest<{ parcel: ParcelRecord }>(
    `/api/admin/parcels/${encodeURIComponent(parcelId)}/revoke`,
    { method: 'PATCH', body: JSON.stringify({ ground, gazetteNumber, reason }) }
  );
  return data.parcel;
}

export async function apiAdminDeleteParcel(parcelId: string): Promise<void> {
  await adminRequest(`/api/admin/parcels/${encodeURIComponent(parcelId)}`, {
    method: 'DELETE'
  });
}

export async function apiAdminUpdateUserRole(userId: string, role: AccessRoleId): Promise<AuthUser> {
  const data = await adminRequest<{ user: AuthUser }>(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) }
  );
  return data.user;
}

export async function apiAdminDeleteUser(userId: string): Promise<void> {
  await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE'
  });
}

export async function apiAdminDeleteInquiry(inquiryId: string): Promise<void> {
  await adminRequest(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, {
    method: 'DELETE'
  });
}
