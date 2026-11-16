import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';

export const ADMIN_TOKEN_KEY = 'anagu_admin_token_v1';
export const ADMIN_USER_KEY = 'anagu_admin_user_v1';

export interface AdminOverviewResponse {
  parcels: ParcelRecord[];
  users: AuthUser[];
  inquiries: AdminInquiryRecord[];
  mqttMessages: MqttMessage[];
  admins: AdminUser[];
  serverTime: string;
}

async function adminRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${response.status})`);
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
