import type {
  AccessRoleId,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function apiLogin(email: string, password: string): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
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
  const data = await requestJson<{ user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.user;
}

export async function apiDemoLogin(role: AccessRoleId): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>('/api/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ role })
  });
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
  await requestJson('/api/inquiries', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
