import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround,
  SpatialConflictRecord,
  SpatialVerificationResult
} from '../src/types/anagu.ts';
import { isDemoAccountsEnabled } from './auth.ts';

interface StoredUserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: AccessRoleId;
  state_jurisdiction: string;
  credential_id: string;
  password_hash: string;
  created_at: string;
}

interface StoredParcelRow {
  id: string;
  cadastral_ref: string;
  applicant_name: string;
  applicant_nin: string;
  state: string;
  lga: string;
  district: string;
  area_sqm: number;
  perimeter_m: number;
  coordinates: [number, number][];
  beacons: ParcelRecord['beacons'];
  spatial_hash: string;
  document_hash: string;
  survey_plan_ref: string;
  intended_use: ParcelRecord['intendedUse'];
  status: ParcelRecord['status'];
  token_id: number | null;
  tx_hash: string | null;
  block_number: number | null;
  issuance_timestamp: string | null;
  revocation_data: ParcelRecord['revocationData'] | null;
}

interface StoredMqttRow {
  id: string;
  topic: MqttMessage['topic'];
  payload: Record<string, unknown>;
  qos: 1 | 2;
  event_timestamp: string;
  delivery_latency_ms: number;
  status: MqttMessage['status'];
}

export interface SignupInput {
  fullName: string;
  email: string;
  phone: string;
  role: AccessRoleId;
  state: string;
  credentialId: string;
  password: string;
}

export interface InquiryInput {
  name: string;
  phone: string;
  email?: string;
  state: string;
  message?: string;
}

export interface OracleAttestationInput {
  affidavitRef?: string;
  familyWitness?: string;
  witnessNotes?: string;
  reviewerId?: string;
  quorumPercent?: number;
  attestationScore?: number;
}

export interface AdminSignupInput {
  fullName: string;
  email: string;
  phone: string;
  department: string;
  state: string;
  password: string;
}

interface StoredAdminRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  state_jurisdiction: string;
  password_hash: string;
  created_at: string;
}

interface StoredInquiryRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  state_jurisdiction: string;
  message: string | null;
  created_at: string;
}

const SEED_USERS: StoredUserRow[] = [
  {
    id: 'usr-citizen-01',
    full_name: 'Dr. Aminu Bello Abubakar',
    email: 'aminu.bello@anagu.ng',
    phone: '+234 803 412 8890',
    role: 'citizen',
    state_jurisdiction: 'Federal Capital Territory (Abuja)',
    credential_id: 'NIN-8921-4091-2311',
    password_hash:
      'anagu_salt_citizen_01:b88d9203d6dc1597bd5c15b35dee1ac64ff3d1e7fdd08e5aa17e42419a59d45eaca859310cfd1d15ce0d4d8e1561e0b70f9c9f14ad957a8c23668edef004b499',
    created_at: '2026-06-12'
  },
  {
    id: 'usr-surveyor-01',
    full_name: 'Musa Adeleke',
    email: 'musa.adeleke@nis-survey.ng',
    phone: '+234 805 901 3342',
    role: 'surveyor',
    state_jurisdiction: 'Federal Capital Territory (Abuja)',
    credential_id: 'SURCON-NIS-4821',
    password_hash:
      'anagu_salt_surveyor_01:2aa19634c2a5ac035cf3a021ce73f0031a00f20d2e3e3d1a7d1d5f2e4491ce79d553e767cc45ca98b2577c442510ba42091972ae2b802717ce6d78cfda5bb6c7',
    created_at: '2026-05-04'
  },
  {
    id: 'usr-oracle-01',
    full_name: 'Chief Chukwudi Nnamdi Eze',
    email: 'chief.eze@oracle-council.ng',
    phone: '+234 809 774 1120',
    role: 'oracle',
    state_jurisdiction: 'Enugu State',
    credential_id: 'Council Elder · Ogui Nike Royal Quorum',
    password_hash:
      'anagu_salt_oracle_01:4efcf73fd712e10a92ec4c6f88ba86a9d68c14f72fb7895f0d9b87410e229a84d29095c0172c3f6fabe55ec5e82a0372ce8c9bbefd496518af801de319dee00b',
    created_at: '2026-04-19'
  }
];

const SEED_PARCELS: ParcelRecord[] = [
  {
    id: 'PAR-2026-0891',
    cadastralRef: 'FCT/AMAC/KAT/0891-B',
    applicantName: 'Dr. Aminu Bello Abubakar',
    applicantNin: 'NIN-8921-4091-2311',
    state: 'Federal Capital Territory',
    lga: 'Abuja Municipal (AMAC)',
    district: 'Katampe Extension Diplomatic Zone',
    areaSqm: 1845.5,
    perimeterM: 178.4,
    intendedUse: 'Residential',
    status: 'registered',
    tokenId: 4092,
    txHash: '0x8f3c7a9b12e456d7890123456789abcdef0123456789abcdef0123456789abcd',
    blockNumber: 1892041,
    issuanceTimestamp: '2026-08-14 11:22:04 UTC',
    spatialHash: '0x3a9f0291e0a9d821fc003192019a8200192a01f8938210921938910293019283',
    documentHash: '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    surveyPlanRef: 'NIS/FCT/SP/2026/0411',
    coordinates: [
      [9.1025, 7.4521],
      [9.1038, 7.4539],
      [9.1029, 7.4552],
      [9.1016, 7.4534]
    ],
    beacons: [
      { id: 'SCN-101', name: 'PB 101', lat: 9.1025, lng: 7.4521, easting: 329841.2, northing: 1006520.4, elevation: 512.4 },
      { id: 'SCN-102', name: 'PB 102', lat: 9.1038, lng: 7.4539, easting: 330039.8, northing: 1006664.1, elevation: 514.1 },
      { id: 'SCN-103', name: 'PB 103', lat: 9.1029, lng: 7.4552, easting: 330182.5, northing: 1006564.7, elevation: 513.8 },
      { id: 'SCN-104', name: 'PB 104', lat: 9.1016, lng: 7.4534, easting: 329984.1, northing: 1006421.0, elevation: 511.9 }
    ]
  },
  {
    id: 'PAR-2026-0902',
    cadastralRef: 'LAG/ETI/LEK/0902-C',
    applicantName: 'Folashade Adeyemi Holdings Ltd',
    applicantNin: 'RC-1049281 / NIN-4401-2918',
    state: 'Lagos State',
    lga: 'Eti-Osa',
    district: 'Lekki Phase 1 Waterfront',
    areaSqm: 2420.0,
    perimeterM: 210.0,
    intendedUse: 'Commercial',
    status: 'spatial_verified',
    spatialHash: '0x7b210948ac019283f01928401928301928301928301928301928301928301928',
    documentHash: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    surveyPlanRef: 'SURV/LAG/2026/8991',
    coordinates: [
      [6.4421, 3.4812],
      [6.4435, 3.483],
      [6.4428, 3.4845],
      [6.4414, 3.4827]
    ],
    beacons: [
      { id: 'LKG-201', name: 'LB 201', lat: 6.4421, lng: 3.4812, easting: 553210.4, northing: 712390.1, elevation: 4.2 },
      { id: 'LKG-202', name: 'LB 202', lat: 6.4435, lng: 3.483, easting: 553409.2, northing: 712545.0, elevation: 4.5 },
      { id: 'LKG-203', name: 'LB 203', lat: 6.4428, lng: 3.4845, easting: 553575.1, northing: 712467.8, elevation: 4.3 },
      { id: 'LKG-204', name: 'LB 204', lat: 6.4414, lng: 3.4827, easting: 553376.5, northing: 712312.9, elevation: 4.1 }
    ]
  },
  {
    id: 'PAR-2026-0774',
    cadastralRef: 'ENU/ENN/IND/0774-A',
    applicantName: 'Chief Chukwudi Nnamdi Eze',
    applicantNin: 'NIN-1920-5819-2044',
    state: 'Enugu State',
    lga: 'Enugu North',
    district: 'Independence Layout Phase 2',
    areaSqm: 3100.2,
    perimeterM: 245.8,
    intendedUse: 'Residential',
    status: 'revoked',
    tokenId: 4078,
    txHash: '0x12a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
    blockNumber: 1889410,
    issuanceTimestamp: '2026-06-20 09:14:32 UTC',
    spatialHash: '0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    documentHash: '0x5544332211ffeeddccbbaa00998877665544332211ffeeddccbbaa0099887766',
    surveyPlanRef: 'EN/GIS/CAD/2026/0122',
    coordinates: [
      [6.452, 7.514],
      [6.4536, 7.5162],
      [6.4525, 7.5178],
      [6.4509, 7.5156]
    ],
    beacons: [
      { id: 'ENB-01', name: 'EB 01', lat: 6.452, lng: 7.514, easting: 335412.0, northing: 713420.5, elevation: 220.1 },
      { id: 'ENB-02', name: 'EB 02', lat: 6.4536, lng: 7.5162, easting: 335655.4, northing: 713597.2, elevation: 221.4 },
      { id: 'ENB-03', name: 'EB 03', lat: 6.4525, lng: 7.5178, easting: 335832.0, northing: 713475.9, elevation: 219.8 },
      { id: 'ENB-04', name: 'EB 04', lat: 6.4509, lng: 7.5156, easting: 335588.6, northing: 713298.7, elevation: 218.9 }
    ],
    revocationData: {
      ground: 'OverridingPublicInterest',
      revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      timestamp: '2026-09-02 14:45:10 UTC',
      gazetteNumber: 'State Gazette No. 44 Vol. 35 / Notice No. 892',
      reason: 'Public infrastructure expansion: Construction of the Eastern Light Rail Metropolitan Intermodal Transit Corridor.',
      revocationTxHash: '0xee92817401928374910293847581920394857102938475610293847561029384'
    }
  }
];

const SEED_MQTT: MqttMessage[] = [
  {
    id: 'msg-901',
    topic: 'land/title/issued',
    payload: { tokenId: 4092, ownerId: 'NIN-8921-4091-2311', parcelId: 'PAR-2026-0891', txHash: '0x8f3c7a...abcd' },
    qos: 1,
    timestamp: '11:22:05',
    deliveryLatencyMs: 42,
    status: 'delivered'
  },
  {
    id: 'msg-902',
    topic: 'land/title/revoked',
    payload: { tokenId: 4078, ground: 'OverridingPublicInterest', revokedBy: 'GOVERNOR_ROLE:0x7099...79C8', gazette: 'Vol.35/No.892' },
    qos: 2,
    timestamp: '14:45:12',
    deliveryLatencyMs: 58,
    status: 'delivered'
  },
  {
    id: 'msg-903',
    topic: 'land/verification/oracle',
    payload: { applicationId: 'PAR-2026-0902', outcome: 'Verified', attestationScore: 98, reviewerId: 'ORACLE_OROD_ETIOSA' },
    qos: 1,
    timestamp: '16:04:19',
    deliveryLatencyMs: 38,
    status: 'delivered'
  },
  {
    id: 'msg-904',
    topic: 'land/registration/status',
    payload: { applicationId: 'PAR-2026-0902', status: 'spatial_verified', bufferToleranceM: 0.5, intersectsCollision: false },
    qos: 1,
    timestamp: '16:04:22',
    deliveryLatencyMs: 44,
    status: 'delivered'
  }
];

const globalStore = globalThis as unknown as {
  _anaguPgPool?: Pool | null;
  _anaguPgPoolUrl?: string;
  _anaguPgDisabledUntil?: number;
  _anaguPgWarned?: boolean;
  _anaguSupabaseDisabledUntil?: number;
  _anaguSupabaseWarned?: boolean;
  _anaguSchemaPromise?: Promise<void> | null;
  _anaguStoreLoaded?: boolean;
  _anaguStorePath?: string;
  _anaguMemoryUsers?: StoredUserRow[];
  _anaguMemoryAdmins?: StoredAdminRow[];
  _anaguMemoryParcels?: ParcelRecord[];
  _anaguMemoryMqtt?: MqttMessage[];
  _anaguMemoryInquiries?: Array<InquiryInput & { id: string; createdAt: string }>;
};

const SEED_ADMINS: StoredAdminRow[] = [
  {
    id: 'adm-chief-01',
    full_name: 'Registrar-General Chief Admin',
    email: 'admin@anagu.ng',
    phone: '+234 800 262 4800',
    department: 'Federal Land Registry Inspectorate',
    state_jurisdiction: 'Federal Capital Territory (Abuja)',
    password_hash: '',
    created_at: '2026-04-01'
  }
];

function isMemoryOnlyTestMode(): boolean {
  return process.env.ANAGU_STORAGE_MODE === 'memory' || process.env.NODE_ENV === 'test';
}

export function resetMemoryStoreForTests(): void {
  globalStore._anaguStoreLoaded = false;
  globalStore._anaguStorePath = undefined;
  globalStore._anaguSupabaseDisabledUntil = undefined;
  globalStore._anaguSupabaseWarned = false;
  globalStore._anaguMemoryUsers = undefined;
  globalStore._anaguMemoryAdmins = undefined;
  globalStore._anaguMemoryParcels = undefined;
  globalStore._anaguMemoryMqtt = undefined;
  globalStore._anaguMemoryInquiries = undefined;
}

function resolveStoreFilePath(): string {
  if (globalStore._anaguStorePath) return globalStore._anaguStorePath;
  const preferredDir = process.env.ANAGU_DATA_DIR?.trim() || path.join(process.cwd(), '.anagu-data');
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    fs.accessSync(preferredDir, fs.constants.W_OK);
    globalStore._anaguStorePath = path.join(preferredDir, 'store.json');
    return globalStore._anaguStorePath;
  } catch {
    globalStore._anaguStorePath = '/tmp/anagu-store.json';
    return globalStore._anaguStorePath;
  }
}

function loadDurableStoreOnce(): void {
  if (globalStore._anaguStoreLoaded) return;
  globalStore._anaguStoreLoaded = true;
  if (isMemoryOnlyTestMode() && !process.env.ANAGU_DATA_DIR) {
    return;
  }
  try {
    const filePath = resolveStoreFilePath();
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      users?: StoredUserRow[];
      admins?: StoredAdminRow[];
      parcels?: ParcelRecord[];
      mqtt?: MqttMessage[];
      inquiries?: Array<InquiryInput & { id: string; createdAt: string }>;
    };
    if (Array.isArray(parsed.users) && parsed.users.length > 0) {
      globalStore._anaguMemoryUsers = parsed.users;
    }
    if (Array.isArray(parsed.admins) && parsed.admins.length > 0) {
      globalStore._anaguMemoryAdmins = parsed.admins;
    }
    if (Array.isArray(parsed.parcels) && parsed.parcels.length > 0) {
      globalStore._anaguMemoryParcels = parsed.parcels;
    }
    if (Array.isArray(parsed.mqtt) && parsed.mqtt.length > 0) {
      globalStore._anaguMemoryMqtt = parsed.mqtt;
    }
    if (Array.isArray(parsed.inquiries)) {
      globalStore._anaguMemoryInquiries = parsed.inquiries;
    }
  } catch {
    // Fallback to clean seeds if store file is unreadable or corrupt
  }
}

function saveDurableStore(): void {
  if (isMemoryOnlyTestMode() && !process.env.ANAGU_DATA_DIR) {
    return;
  }
  try {
    const filePath = resolveStoreFilePath();
    const payload = {
      users: getMemoryUsers(),
      admins: getMemoryAdmins(),
      parcels: getMemoryParcels(),
      mqtt: getMemoryMqtt(),
      inquiries: getMemoryInquiries()
    };
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Ignore filesystem errors on read-only serverless targets
  }
}

function getMemoryAdmins(): StoredAdminRow[] {
  loadDurableStoreOnce();
  if (!globalStore._anaguMemoryAdmins) {
    if (isDemoAccountsEnabled()) {
      globalStore._anaguMemoryAdmins = SEED_ADMINS.map((a) => ({
        ...a,
        password_hash: a.password_hash || hashPassword('anagu-admin', 'anagu_salt_admin_01')
      }));
    } else {
      globalStore._anaguMemoryAdmins = [];
    }
  }
  return globalStore._anaguMemoryAdmins;
}

function getMemoryUsers(): StoredUserRow[] {
  loadDurableStoreOnce();
  if (!globalStore._anaguMemoryUsers) {
    globalStore._anaguMemoryUsers = isDemoAccountsEnabled()
      ? SEED_USERS.map((u) => ({ ...u }))
      : [];
  }
  return globalStore._anaguMemoryUsers;
}

function getMemoryParcels(): ParcelRecord[] {
  loadDurableStoreOnce();
  if (!globalStore._anaguMemoryParcels) {
    globalStore._anaguMemoryParcels = SEED_PARCELS.map((p) => ({ ...p }));
  }
  return globalStore._anaguMemoryParcels;
}

function getMemoryMqtt(): MqttMessage[] {
  loadDurableStoreOnce();
  if (!globalStore._anaguMemoryMqtt) {
    globalStore._anaguMemoryMqtt = SEED_MQTT.map((m) => ({ ...m }));
  }
  return globalStore._anaguMemoryMqtt;
}

function getMemoryInquiries(): Array<InquiryInput & { id: string; createdAt: string }> {
  loadDurableStoreOnce();
  if (!globalStore._anaguMemoryInquiries) {
    globalStore._anaguMemoryInquiries = [];
  }
  return globalStore._anaguMemoryInquiries;
}

export function isDatabaseConfigured(): boolean {
  if (isMemoryOnlyTestMode()) return false;
  const url = (process.env.DATABASE_URL || '').trim();
  return url.length > 0 && !url.includes('[YOUR-PASSWORD]') && !url.includes('MY_DATABASE_URL');
}

export function isSupabaseRestConfigured(): boolean {
  if (isMemoryOnlyTestMode()) return false;
  if (globalStore._anaguSupabaseDisabledUntil && Date.now() < globalStore._anaguSupabaseDisabledUntil) {
    return false;
  }
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || key.length <= 10 || url.includes('[PROJECT-REF]')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function getSupabaseConfig(): { url: string; key: string } | null {
  if (!isSupabaseRestConfigured()) return null;
  return {
    url: process.env.SUPABASE_URL!.trim().replace(/\/+$/, ''),
    key: (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  };
}

class SupabaseTableMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseTableMissingError';
  }
}

export class SpatialMigrationRequiredError extends Error {
  constructor(
    message = 'PostGIS spatial RPC functions are not installed yet. Run supabase/migrations/001_postgis_spatial.sql in Supabase SQL Editor.'
  ) {
    super(message);
    this.name = 'SpatialMigrationRequiredError';
  }
}

export const FINALIZED_PARCEL_STATUSES: ReadonlySet<ParcelRecord['status']> = new Set([
  'oracle_verified',
  'legal_approved',
  'registered',
  'revoked',
  'rejected'
]);

export class ParcelGeometryImmutableError extends Error {
  parcelId: string;
  status: ParcelRecord['status'];

  constructor(parcelId: string, status: ParcelRecord['status'], message?: string) {
    super(
      message ||
        `Coordinate modification rejected: parcel "${parcelId}" is in finalized lifecycle state "${status}" and its coordinates/geometry are immutable.`
    );
    this.name = 'ParcelGeometryImmutableError';
    this.parcelId = parcelId;
    this.status = status;
  }
}

export class SpatialVerificationFailedError extends Error {
  spatial: SpatialVerificationResult;

  constructor(message: string, spatial: SpatialVerificationResult) {
    super(message);
    this.name = 'SpatialVerificationFailedError';
    this.spatial = spatial;
  }
}

function isTransientConnectionError(err: unknown, depth = 0): boolean {
  if (!err || depth > 2) return false;
  const anyErr = err as { name?: string; code?: string; message?: string; cause?: unknown };
  const name = String(anyErr.name || '');
  const code = String(anyErr.code || '');
  const msg = String(anyErr.message || err || '').toLowerCase();

  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (
    [
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '57P01',
      '57P02',
      '57P03'
    ].includes(code)
  ) {
    return true;
  }
  if (
    msg.includes('connection terminated') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('ehostunreach') ||
    msg.includes('enetunreach') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('socket hang up') ||
    msg.includes('connection reset') ||
    msg.includes('too many clients') ||
    msg.includes('aborted')
  ) {
    return true;
  }
  if (anyErr.cause) {
    return isTransientConnectionError(anyErr.cause, depth + 1);
  }
  return false;
}

function tripPgCircuit(err: unknown, context: string): void {
  globalStore._anaguPgDisabledUntil = Date.now() + 600_000;
  globalStore._anaguSchemaPromise = null;
  if (!globalStore._anaguPgWarned) {
    globalStore._anaguPgWarned = true;
    if (process.env.ANAGU_DEBUG_DB === 'true') {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[anagu/db] Switched to fallback store during ${context} (${msg}).`);
    }
  }
}

function tripSupabaseCircuit(err: unknown, context: string): void {
  globalStore._anaguSupabaseDisabledUntil = Date.now() + 600_000;
  if (!globalStore._anaguSupabaseWarned) {
    globalStore._anaguSupabaseWarned = true;
    if (process.env.ANAGU_DEBUG_DB === 'true') {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[anagu/db] Switched to resilient local store during ${context} (${msg}).`);
    }
  }
}

function shouldFallbackFromSupabase(err: unknown, context: string): boolean {
  if (err instanceof SupabaseTableMissingError) {
    return true;
  }
  const status = (err as { status?: number })?.status;
  if (
    isTransientConnectionError(err) ||
    (typeof status === 'number' && status >= 500)
  ) {
    tripSupabaseCircuit(err, context);
    return true;
  }
  return false;
}

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function supabaseRest<T>(
  path: string,
  options?: { method?: string; body?: unknown; prefer?: string }
): Promise<T> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase REST configuration is not set.');
  }
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json'
  };
  if (options?.prefer) {
    headers['Prefer'] = options.prefer;
  }

  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method: options?.method || 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(4000)
  });

  const text = await res.text();
  const parsed = tryParseJson(text) as { code?: string; message?: string; error?: string } | null;

  if (!res.ok) {
    const code = parsed?.code;
    if (res.status === 404 || code === 'PGRST205' || code === '42P01') {
      throw new SupabaseTableMissingError(parsed?.message || 'Supabase tables not initialized yet.');
    }
    const err = new Error(parsed?.message || parsed?.error || `Supabase error (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return parsed as T;
}

async function supabaseRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase REST configuration is not set.');
  }
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${encodeURIComponent(fnName)}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(5000)
  });

  const text = await res.text();
  const parsed = tryParseJson(text) as { code?: string; message?: string; error?: string } | null;

  if (!res.ok) {
    const code = parsed?.code;
    const msg = String(parsed?.message || parsed?.error || `Supabase RPC error (${res.status})`);
    if (res.status === 404 || code === 'PGRST202' || code === '42883') {
      throw new SpatialMigrationRequiredError(
        `PostGIS RPC "${fnName}" is not installed in Supabase yet. Apply supabase/migrations/001_postgis_spatial.sql first.`
      );
    }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return parsed as T;
}

function shouldUseSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  if (lower.includes('sslmode=disable')) return false;
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  return true;
}

function getPool(): Pool | null {
  if (!isDatabaseConfigured()) {
    return null;
  }
  if (globalStore._anaguPgDisabledUntil && Date.now() < globalStore._anaguPgDisabledUntil) {
    return null;
  }
  const url = process.env.DATABASE_URL!.trim();
  if (!globalStore._anaguPgPool || globalStore._anaguPgPoolUrl !== url) {
    const pool = new Pool({
      connectionString: url,
      ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 4000,
      query_timeout: 5000
    });
    pool.on('error', (err) => {
      tripPgCircuit(err, 'idle client');
    });
    globalStore._anaguPgPool = pool;
    globalStore._anaguPgPoolUrl = url;
    globalStore._anaguSchemaPromise = null;
  }
  return globalStore._anaguPgPool;
}

export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex || !/^[a-f0-9]+$/i.test(originalHex) || originalHex.length % 2 !== 0) {
    return false;
  }
  try {
    const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(originalHex, 'hex');
    const b = Buffer.from(derivedHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function mapUserRow(row: StoredUserRow): AuthUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    state: row.state_jurisdiction,
    credentialId: row.credential_id,
    createdAt: typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : new Date(row.created_at).toISOString().slice(0, 10)
  };
}

function encodeBeaconsWithPrice(
  beacons: ParcelRecord['beacons'],
  priceUsd?: number,
  mapSnapshotUrl?: string,
  sellerWallet?: string
): Array<Record<string, unknown>> {
  const safeBeacons = Array.isArray(beacons) ? beacons : [];
  const hasPrice = typeof priceUsd === 'number' && Number.isFinite(priceUsd) && priceUsd > 0;
  const hasSnapshot = typeof mapSnapshotUrl === 'string' && mapSnapshotUrl.trim().length > 0;
  const hasSellerWallet = typeof sellerWallet === 'string' && sellerWallet.trim().length > 0;
  if (!hasPrice && !hasSnapshot && !hasSellerWallet) {
    return safeBeacons.map((b) => ({ ...b }));
  }
  const extra: Record<string, unknown> = {};
  if (hasPrice) extra.priceUsd = priceUsd;
  if (hasSnapshot) extra.mapSnapshotUrl = mapSnapshotUrl;
  if (hasSellerWallet) extra.sellerWallet = sellerWallet.trim();

  if (safeBeacons.length === 0) {
    return [{ id: 'META-1', name: 'PB 1', lat: 0, lng: 0, easting: 0, northing: 0, elevation: 0, ...extra }];
  }
  return safeBeacons.map((b, idx) => (idx === 0 ? { ...b, ...extra } : { ...b }));
}

function mapParcelRow(row: StoredParcelRow): ParcelRecord {
  const rawBeacons = Array.isArray(row.beacons)
    ? (row.beacons as Array<
        ParcelRecord['beacons'][number] & {
          priceUsd?: unknown;
          mapSnapshotUrl?: unknown;
          sellerWallet?: unknown;
        }
      >)
    : [];
  const extractedPrice =
    typeof rawBeacons[0]?.priceUsd === 'number' && Number.isFinite(rawBeacons[0].priceUsd) && rawBeacons[0].priceUsd > 0
      ? rawBeacons[0].priceUsd
      : undefined;
  const extractedSnapshot =
    typeof rawBeacons[0]?.mapSnapshotUrl === 'string' && rawBeacons[0].mapSnapshotUrl.trim().length > 0
      ? rawBeacons[0].mapSnapshotUrl
      : undefined;
  const extractedSellerWallet =
    typeof rawBeacons[0]?.sellerWallet === 'string' && rawBeacons[0].sellerWallet.trim().length > 0
      ? rawBeacons[0].sellerWallet.trim()
      : undefined;

  const cleanBeacons: ParcelRecord['beacons'] = rawBeacons
    .filter((b) => b.id !== 'META-1')
    .map(({ priceUsd: _ignoredPrice, mapSnapshotUrl: _ignoredSnap, sellerWallet: _ignoredWallet, ...rest }) => rest);

  const parcel: ParcelRecord = {
    id: row.id,
    cadastralRef: row.cadastral_ref,
    applicantName: row.applicant_name,
    applicantNin: row.applicant_nin,
    state: row.state,
    lga: row.lga,
    district: row.district,
    areaSqm: Number(row.area_sqm),
    perimeterM: Number(row.perimeter_m),
    coordinates: Array.isArray(row.coordinates) ? row.coordinates : [],
    beacons: cleanBeacons,
    spatialHash: row.spatial_hash,
    documentHash: row.document_hash,
    surveyPlanRef: row.survey_plan_ref,
    intendedUse: row.intended_use,
    status: row.status
  };

  if (extractedPrice !== undefined) parcel.priceUsd = extractedPrice;
  if (extractedSnapshot !== undefined) parcel.mapSnapshotUrl = extractedSnapshot;
  if (extractedSellerWallet !== undefined) parcel.sellerWallet = extractedSellerWallet;
  if (row.token_id !== null && row.token_id !== undefined) parcel.tokenId = Number(row.token_id);
  if (row.tx_hash) parcel.txHash = row.tx_hash;
  if (row.block_number !== null && row.block_number !== undefined) parcel.blockNumber = Number(row.block_number);
  if (row.issuance_timestamp) parcel.issuanceTimestamp = row.issuance_timestamp;
  if (row.revocation_data) parcel.revocationData = row.revocation_data;
  return parcel;
}

function toParcelDbRecord(parcel: ParcelRecord, userId?: string): Record<string, unknown> {
  return {
    id: parcel.id,
    cadastral_ref: parcel.cadastralRef,
    applicant_name: parcel.applicantName,
    applicant_nin: parcel.applicantNin,
    state: parcel.state,
    lga: parcel.lga,
    district: parcel.district,
    area_sqm: parcel.areaSqm,
    perimeter_m: parcel.perimeterM,
    coordinates: parcel.coordinates,
    beacons: encodeBeaconsWithPrice(
      parcel.beacons,
      parcel.priceUsd,
      parcel.mapSnapshotUrl,
      parcel.sellerWallet
    ),
    spatial_hash: parcel.spatialHash,
    document_hash: parcel.documentHash,
    survey_plan_ref: parcel.surveyPlanRef,
    intended_use: parcel.intendedUse,
    status: parcel.status,
    token_id: parcel.tokenId ?? null,
    tx_hash: parcel.txHash ?? null,
    block_number: parcel.blockNumber ?? null,
    issuance_timestamp: parcel.issuanceTimestamp ?? null,
    revocation_data: parcel.revocationData ?? null,
    created_by_user_id: userId ?? null
  };
}

function mapMqttRow(row: StoredMqttRow): MqttMessage {
  return {
    id: row.id,
    topic: row.topic,
    payload: row.payload || {},
    qos: row.qos === 2 ? 2 : 1,
    timestamp: row.event_timestamp,
    deliveryLatencyMs: Number(row.delivery_latency_ms),
    status: row.status
  };
}

async function ensureSchema(pool: Pool): Promise<void> {
  if (!globalStore._anaguSchemaPromise) {
    globalStore._anaguSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('citizen', 'surveyor', 'oracle')),
          state_jurisdiction TEXT NOT NULL,
          credential_id TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_anagu_users_email ON public.anagu_users (LOWER(email));
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_parcels (
          id TEXT PRIMARY KEY,
          cadastral_ref TEXT NOT NULL UNIQUE,
          applicant_name TEXT NOT NULL,
          applicant_nin TEXT NOT NULL,
          state TEXT NOT NULL,
          lga TEXT NOT NULL,
          district TEXT NOT NULL,
          area_sqm DOUBLE PRECISION NOT NULL,
          perimeter_m DOUBLE PRECISION NOT NULL,
          coordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
          beacons JSONB NOT NULL DEFAULT '[]'::jsonb,
          spatial_hash TEXT NOT NULL,
          document_hash TEXT NOT NULL,
          survey_plan_ref TEXT NOT NULL,
          intended_use TEXT NOT NULL,
          status TEXT NOT NULL,
          token_id INTEGER,
          tx_hash TEXT,
          block_number INTEGER,
          issuance_timestamp TEXT,
          revocation_data JSONB,
          created_by_user_id TEXT REFERENCES public.anagu_users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_anagu_parcels_status ON public.anagu_parcels (status);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_oracle_attestations (
          id TEXT PRIMARY KEY,
          parcel_id TEXT NOT NULL REFERENCES public.anagu_parcels(id) ON DELETE CASCADE,
          cadastral_ref TEXT NOT NULL,
          affidavit_ref TEXT,
          family_witness TEXT,
          witness_notes TEXT,
          reviewer_id TEXT,
          quorum_percent INTEGER NOT NULL DEFAULT 100,
          attestation_score INTEGER NOT NULL DEFAULT 98,
          outcome TEXT NOT NULL,
          attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_mqtt_events (
          id TEXT PRIMARY KEY,
          topic TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          qos SMALLINT NOT NULL DEFAULT 1,
          event_timestamp TEXT NOT NULL,
          delivery_latency_ms INTEGER NOT NULL DEFAULT 42,
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_inquiries (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          state_jurisdiction TEXT NOT NULL,
          message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.anagu_admins (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT NOT NULL,
          department TEXT NOT NULL,
          state_jurisdiction TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_anagu_admins_email ON public.anagu_admins (LOWER(email));
      `);

      if (isDemoAccountsEnabled()) {
        const defaultAdminHash = hashPassword('anagu-admin', 'anagu_salt_admin_01');
        for (const admin of SEED_ADMINS) {
          await pool.query(
            `
            INSERT INTO public.anagu_admins (
              id, full_name, email, phone, department, state_jurisdiction, password_hash, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
            `,
            [
              admin.id,
              admin.full_name,
              admin.email,
              admin.phone,
              admin.department,
              admin.state_jurisdiction,
              defaultAdminHash,
              admin.created_at
            ]
          );
        }

        for (const user of SEED_USERS) {
          await pool.query(
            `
            INSERT INTO public.anagu_users (
              id, full_name, email, phone, role, state_jurisdiction, credential_id, password_hash, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
            `,
            [
              user.id,
              user.full_name,
              user.email,
              user.phone,
              user.role,
              user.state_jurisdiction,
              user.credential_id,
              user.password_hash,
              user.created_at
            ]
          );
        }
      }

      for (const p of SEED_PARCELS) {
        await pool.query(
          `
          INSERT INTO public.anagu_parcels (
            id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
            area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
            survey_plan_ref, intended_use, status, token_id, tx_hash, block_number,
            issuance_timestamp, revocation_data
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10::jsonb, $11::jsonb, $12, $13,
            $14, $15, $16, $17, $18, $19,
            $20, $21::jsonb
          )
          ON CONFLICT (id) DO NOTHING
          `,
          [
            p.id,
            p.cadastralRef,
            p.applicantName,
            p.applicantNin,
            p.state,
            p.lga,
            p.district,
            p.areaSqm,
            p.perimeterM,
            JSON.stringify(p.coordinates),
            JSON.stringify(p.beacons),
            p.spatialHash,
            p.documentHash,
            p.surveyPlanRef,
            p.intendedUse,
            p.status,
            p.tokenId ?? null,
            p.txHash ?? null,
            p.blockNumber ?? null,
            p.issuanceTimestamp ?? null,
            p.revocationData ? JSON.stringify(p.revocationData) : null
          ]
        );
      }

      for (const m of SEED_MQTT) {
        await pool.query(
          `
          INSERT INTO public.anagu_mqtt_events (
            id, topic, payload, qos, event_timestamp, delivery_latency_ms, status
          ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
          `,
          [m.id, m.topic, JSON.stringify(m.payload), m.qos, m.timestamp, m.deliveryLatencyMs, m.status]
        );
      }
    })().catch((err) => {
      globalStore._anaguSchemaPromise = null;
      throw err;
    });
  }
  await globalStore._anaguSchemaPromise;
}

export async function getDatabaseHealth(): Promise<{
  ok: boolean;
  mode: 'postgresql' | 'supabase_rest' | 'supabase_pending_schema' | 'memory';
}> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      await pool.query('SELECT 1');
      return { ok: true, mode: 'postgresql' };
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'health check');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest<Array<{ id: string }>>('anagu_parcels?select=id&limit=1');
      return { ok: true, mode: 'supabase_rest' };
    } catch (err) {
      if (err instanceof SupabaseTableMissingError) {
        return { ok: true, mode: 'supabase_pending_schema' };
      }
      if (shouldFallbackFromSupabase(err, 'health check')) {
        return { ok: true, mode: 'memory' };
      }
      throw err;
    }
  }

  return { ok: true, mode: 'memory' };
}

export async function listParcels(): Promise<ParcelRecord[]> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `SELECT * FROM public.anagu_parcels ORDER BY created_at DESC, id ASC`
      );
      return res.rows.map(mapParcelRow);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'listParcels');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        'anagu_parcels?select=*&order=created_at.desc,id.asc'
      );
      return rows.map(mapParcelRow);
    } catch (err) {
      if (shouldFallbackFromSupabase(err, 'listParcels')) {
        return getMemoryParcels();
      }
      throw err;
    }
  }

  return getMemoryParcels();
}

export async function createParcel(parcel: ParcelRecord, userId?: string): Promise<ParcelRecord> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `
        INSERT INTO public.anagu_parcels (
          id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
          area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
          survey_plan_ref, intended_use, status, token_id, tx_hash, block_number,
          issuance_timestamp, revocation_data, created_by_user_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10::jsonb, $11::jsonb, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21::jsonb, $22
        )
        ON CONFLICT (id) DO UPDATE SET
          applicant_name = EXCLUDED.applicant_name,
          applicant_nin = EXCLUDED.applicant_nin,
          state = EXCLUDED.state,
          lga = EXCLUDED.lga,
          district = EXCLUDED.district,
          area_sqm = EXCLUDED.area_sqm,
          perimeter_m = EXCLUDED.perimeter_m,
          coordinates = EXCLUDED.coordinates,
          beacons = EXCLUDED.beacons,
          intended_use = EXCLUDED.intended_use,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING *
        `,
        [
          parcel.id,
          parcel.cadastralRef,
          parcel.applicantName,
          parcel.applicantNin,
          parcel.state,
          parcel.lga,
          parcel.district,
          parcel.areaSqm,
          parcel.perimeterM,
          JSON.stringify(parcel.coordinates),
          JSON.stringify(
            encodeBeaconsWithPrice(
              parcel.beacons,
              parcel.priceUsd,
              parcel.mapSnapshotUrl,
              parcel.sellerWallet
            )
          ),
          parcel.spatialHash,
          parcel.documentHash,
          parcel.surveyPlanRef,
          parcel.intendedUse,
          parcel.status,
          parcel.tokenId ?? null,
          parcel.txHash ?? null,
          parcel.blockNumber ?? null,
          parcel.issuanceTimestamp ?? null,
          parcel.revocationData ? JSON.stringify(parcel.revocationData) : null,
          userId ?? null
        ]
      );
      return mapParcelRow(res.rows[0]);
    } catch (err) {
      const anyErr = err as { code?: string; message?: string };
      if (
        anyErr?.code === '23514' &&
        typeof anyErr?.message === 'string' &&
        (anyErr.message.includes('Coordinate modification rejected') ||
          anyErr.message.includes('Geometry modification rejected'))
      ) {
        throw new ParcelGeometryImmutableError(parcel.id, parcel.status, anyErr.message);
      }
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'createParcel');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>('anagu_parcels?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: toParcelDbRecord(parcel, userId)
      });
      return rows[0] ? mapParcelRow(rows[0]) : parcel;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Coordinate modification rejected') || msg.includes('Geometry modification rejected')) {
        throw new ParcelGeometryImmutableError(parcel.id, parcel.status, msg);
      }
      if (!shouldFallbackFromSupabase(err, 'createParcel')) throw err;
    }
  }

  const list = getMemoryParcels();
  const existingIdx = list.findIndex((p) => p.id === parcel.id);
  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    const coordsChanged =
      JSON.stringify(existing.coordinates ?? []) !== JSON.stringify(parcel.coordinates ?? []);
    if (coordsChanged && FINALIZED_PARCEL_STATUSES.has(existing.status)) {
      throw new ParcelGeometryImmutableError(existing.id, existing.status);
    }
    const nextStatus: ParcelRecord['status'] =
      coordsChanged && (existing.status === 'draft' || existing.status === 'spatial_verified')
        ? 'draft'
        : parcel.status;
    const saved: ParcelRecord = { ...parcel, status: nextStatus };
    list[existingIdx] = saved;
    saveDurableStore();
    return saved;
  }
  list.unshift(parcel);
  saveDurableStore();
  return parcel;
}

function normalizeRingLngLat(coords: [number, number][] | undefined): Array<[number, number]> | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts: Array<[number, number]> = [];
  for (const pair of coords) {
    if (
      !Array.isArray(pair) ||
      pair.length < 2 ||
      typeof pair[0] !== 'number' ||
      typeof pair[1] !== 'number' ||
      !Number.isFinite(pair[0]) ||
      !Number.isFinite(pair[1]) ||
      pair[0] < -90 ||
      pair[0] > 90 ||
      pair[1] < -180 ||
      pair[1] > 180
    ) {
      return null;
    }
    const prev = pts[pts.length - 1];
    if (prev && prev[0] === pair[1] && prev[1] === pair[0]) continue;
    pts.push([pair[1], pair[0]]); // [lng, lat]
  }
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    pts.push([first[0], first[1]]);
  }
  return pts.length >= 4 ? pts : null;
}

function projectToLocalMeters(
  ring: Array<[number, number]>,
  originLng: number,
  originLat: number
): Array<[number, number]> {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;
  return ring.map(([lng, lat]) => [(lng - originLng) * mPerDegLng, (lat - originLat) * mPerDegLat]);
}

function polygonSignedArea(ring: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function polygonPerimeter(ring: Array<[number, number]>): number {
  let perim = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    perim += Math.hypot(dx, dy);
  }
  return perim;
}

function segmentsProperlyIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const orient = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = orient(a1, a2, b1);
  const d2 = orient(a1, a2, b2);
  const d3 = orient(b1, b2, a1);
  const d4 = orient(b1, b2, a2);
  const eps = 1e-9;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

function isSelfIntersectingRing(ring: Array<[number, number]>): boolean {
  const edgeCount = ring.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    for (let j = i + 2; j < edgeCount; j++) {
      if (i === 0 && j === edgeCount - 1) continue;
      if (segmentsProperlyIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function pointToSegmentDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function pointStrictlyInsidePolygon(pt: [number, number], ring: Array<[number, number]>): boolean {
  for (let i = 0; i < ring.length - 1; i++) {
    if (pointToSegmentDist(pt, ring[i], ring[i + 1]) < 1e-4) return false;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringsMinDistanceMeters(a: Array<[number, number]>, b: Array<[number, number]>): number {
  let minD = Infinity;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsProperlyIntersect(a[i], a[i + 1], b[j], b[j + 1])) return 0;
      minD = Math.min(
        minD,
        pointToSegmentDist(a[i], b[j], b[j + 1]),
        pointToSegmentDist(b[j], a[i], a[i + 1])
      );
    }
  }
  return minD;
}

function evaluateParcelSpatialInMemory(
  parcelId: string,
  bufferMeters: number,
  enforceBuffer: boolean,
  persist: boolean
): { parcel: ParcelRecord | null; spatial: SpatialVerificationResult } {
  const started = Date.now();
  const clampedBuffer = Math.min(Math.max(Number.isFinite(bufferMeters) ? bufferMeters : 0.5, 0), 500);
  const list = getMemoryParcels();
  const target = list.find((p) => p.id === parcelId);

  if (!target) {
    return {
      parcel: null,
      spatial: {
        found: false,
        engine: 'memory_test',
        parcelId,
        srid: 4326,
        bufferMeters: clampedBuffer,
        enforceBuffer,
        hasGeometry: false,
        isValid: false,
        validReason: 'Parcel not found.',
        vertexCount: 0,
        computedAreaSqm: null,
        computedPerimeterM: null,
        centroidLat: null,
        centroidLng: null,
        hasTrueOverlap: false,
        trueOverlapCount: 0,
        boundaryContactCount: 0,
        bufferBreachCount: 0,
        trueOverlaps: [],
        boundaryContacts: [],
        bufferBreaches: [],
        passed: false,
        persisted: false,
        queryDurationMs: Math.max(Date.now() - started, 1),
        error: 'Parcel not found.'
      }
    };
  }

  const targetRing = normalizeRingLngLat(target.coordinates);
  if (!targetRing) {
    return {
      parcel: target,
      spatial: {
        found: true,
        engine: 'memory_test',
        parcelId,
        srid: 4326,
        bufferMeters: clampedBuffer,
        enforceBuffer,
        hasGeometry: false,
        isValid: false,
        validReason: 'Parcel has no valid polygon geometry (minimum 3 valid [lat, lng] vertices required)',
        vertexCount: 0,
        computedAreaSqm: null,
        computedPerimeterM: null,
        centroidLat: null,
        centroidLng: null,
        hasTrueOverlap: false,
        trueOverlapCount: 0,
        boundaryContactCount: 0,
        bufferBreachCount: 0,
        trueOverlaps: [],
        boundaryContacts: [],
        bufferBreaches: [],
        passed: false,
        persisted: false,
        status: target.status,
        queryDurationMs: Math.max(Date.now() - started, 1)
      }
    };
  }

  const originLng = targetRing.slice(0, -1).reduce((s, p) => s + p[0], 0) / (targetRing.length - 1);
  const originLat = targetRing.slice(0, -1).reduce((s, p) => s + p[1], 0) / (targetRing.length - 1);
  const targetM = projectToLocalMeters(targetRing, originLng, originLat);
  const areaSqm = Number(Math.abs(polygonSignedArea(targetM)).toFixed(2));
  const perimeterM = Number(polygonPerimeter(targetM).toFixed(2));
  const selfIntersects = isSelfIntersectingRing(targetM);
  const isValid = !selfIntersects && areaSqm > 0.01;
  const validReason = !isValid
    ? selfIntersects
      ? 'Self-intersection detected in polygon boundary'
      : 'Degenerate zero-area polygon'
    : 'Valid Geometry';

  const trueOverlaps: SpatialConflictRecord[] = [];
  const boundaryContacts: SpatialConflictRecord[] = [];
  const bufferBreaches: SpatialConflictRecord[] = [];

  if (isValid) {
    for (const other of list) {
      if (other.id === target.id || other.status === 'revoked' || other.status === 'rejected') {
        continue;
      }
      const otherRing = normalizeRingLngLat(other.coordinates);
      if (!otherRing) continue;
      const otherM = projectToLocalMeters(otherRing, originLng, originLat);
      if (isSelfIntersectingRing(otherM) || Math.abs(polygonSignedArea(otherM)) <= 0.01) continue;

      const minDist = ringsMinDistanceMeters(targetM, otherM);
      let hasProperCross = false;
      for (let i = 0; i < targetM.length - 1 && !hasProperCross; i++) {
        for (let j = 0; j < otherM.length - 1; j++) {
          if (segmentsProperlyIntersect(targetM[i], targetM[i + 1], otherM[j], otherM[j + 1])) {
            hasProperCross = true;
            break;
          }
        }
      }
      const targetCentroid: [number, number] = [0, 0];
      const otherCentroid: [number, number] = [
        otherM.slice(0, -1).reduce((s, p) => s + p[0], 0) / (otherM.length - 1),
        otherM.slice(0, -1).reduce((s, p) => s + p[1], 0) / (otherM.length - 1)
      ];
      const strictlyInside =
        targetM.slice(0, -1).some((p) => pointStrictlyInsidePolygon(p, otherM)) ||
        otherM.slice(0, -1).some((p) => pointStrictlyInsidePolygon(p, targetM)) ||
        pointStrictlyInsidePolygon(targetCentroid, otherM) ||
        pointStrictlyInsidePolygon(otherCentroid, targetM);

      const identicalVertices =
        targetM.length === otherM.length &&
        targetM.slice(0, -1).every((pt) => otherM.some((o) => Math.hypot(pt[0] - o[0], pt[1] - o[1]) < 1e-4));

      const isTrueOverlap = hasProperCross || strictlyInside || identicalVertices;
      const isBoundaryContact = !isTrueOverlap && minDist < 1e-3;
      const isBufferBreach = !isTrueOverlap && !isBoundaryContact && clampedBuffer > 0 && minDist <= clampedBuffer;

      if (isTrueOverlap) {
        trueOverlaps.push({
          parcelId: other.id,
          cadastralRef: other.cadastralRef,
          status: other.status,
          classification: 'true_overlap',
          overlapAreaSqm: Number(Math.min(areaSqm, Math.abs(polygonSignedArea(otherM))).toFixed(2)),
          bufferOverlapSqm: Number(Math.min(areaSqm, Math.abs(polygonSignedArea(otherM))).toFixed(2)),
          distanceMeters: 0
        });
      } else if (isBoundaryContact) {
        boundaryContacts.push({
          parcelId: other.id,
          cadastralRef: other.cadastralRef,
          status: other.status,
          classification: 'boundary_contact',
          overlapAreaSqm: 0,
          bufferOverlapSqm: 0,
          distanceMeters: 0
        });
      } else if (isBufferBreach) {
        bufferBreaches.push({
          parcelId: other.id,
          cadastralRef: other.cadastralRef,
          status: other.status,
          classification: 'buffer_breach',
          overlapAreaSqm: 0,
          bufferOverlapSqm: 0,
          distanceMeters: Number(minDist.toFixed(4))
        });
      }
    }
  }

  const passed = isValid && trueOverlaps.length === 0 && (!enforceBuffer || bufferBreaches.length === 0);
  const eligibleForSpatialPersist = target.status === 'draft' || target.status === 'spatial_verified';
  let persisted = false;
  let persistenceRefused = false;
  let persistenceRefusedReason: string | null = null;

  if (persist && passed) {
    if (eligibleForSpatialPersist) {
      target.status = 'spatial_verified';
      saveDurableStore();
      persisted = true;
    } else {
      persisted = false;
      persistenceRefused = true;
      persistenceRefusedReason = `Persistence refused: parcel is currently in "${target.status}" lifecycle state. Only "draft" or "spatial_verified" parcels can persist spatial_verified.`;
    }
  }

  return {
    parcel: target,
    spatial: {
      found: true,
      engine: 'memory_test',
      parcelId,
      srid: 4326,
      bufferMeters: clampedBuffer,
      enforceBuffer,
      hasGeometry: true,
      isValid,
      validReason,
      vertexCount: targetRing.length - 1,
      computedAreaSqm: isValid ? areaSqm : null,
      computedPerimeterM: isValid ? perimeterM : null,
      centroidLat: isValid ? Number(originLat.toFixed(6)) : null,
      centroidLng: isValid ? Number(originLng.toFixed(6)) : null,
      hasTrueOverlap: trueOverlaps.length > 0,
      trueOverlapCount: trueOverlaps.length,
      boundaryContactCount: boundaryContacts.length,
      bufferBreachCount: bufferBreaches.length,
      trueOverlaps,
      boundaryContacts,
      bufferBreaches,
      passed,
      persisted,
      persistenceRefused,
      persistenceRefusedReason,
      status: target.status,
      queryDurationMs: Math.max(Date.now() - started, 1)
    }
  };
}

export async function verifyParcelSpatial(
  parcelId: string,
  options?: { bufferMeters?: number; enforceBuffer?: boolean; persist?: boolean }
): Promise<{ parcel: ParcelRecord | null; spatial: SpatialVerificationResult }> {
  const bufferMeters =
    typeof options?.bufferMeters === 'number' && Number.isFinite(options.bufferMeters)
      ? Math.min(Math.max(options.bufferMeters, 0), 500)
      : 0.5;
  const enforceBuffer = Boolean(options?.enforceBuffer);
  const persist = Boolean(options?.persist);

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<{ result: SpatialVerificationResult }>(
        `SELECT public.anagu_verify_parcel_spatial($1, $2, $3, $4) AS result`,
        [parcelId, bufferMeters, enforceBuffer, persist]
      );
      const spatial = res.rows[0]?.result;
      if (!spatial || !spatial.found) {
        return {
          parcel: null,
          spatial: spatial || {
            found: false,
            engine: 'postgis',
            parcelId,
            srid: 4326,
            bufferMeters,
            enforceBuffer,
            hasGeometry: false,
            isValid: false,
            validReason: 'Parcel not found.',
            vertexCount: 0,
            computedAreaSqm: null,
            computedPerimeterM: null,
            centroidLat: null,
            centroidLng: null,
            hasTrueOverlap: false,
            trueOverlapCount: 0,
            boundaryContactCount: 0,
            bufferBreachCount: 0,
            trueOverlaps: [],
            boundaryContacts: [],
            bufferBreaches: [],
            passed: false,
            persisted: false,
            queryDurationMs: 1
          }
        };
      }
      const parcelRes = await pool.query<StoredParcelRow>(
        `SELECT * FROM public.anagu_parcels WHERE id = $1 LIMIT 1`,
        [parcelId]
      );
      return {
        parcel: parcelRes.rows[0] ? mapParcelRow(parcelRes.rows[0]) : null,
        spatial
      };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '42883') {
        throw new SpatialMigrationRequiredError(
          'PostGIS spatial RPC functions are not installed yet. Run supabase/migrations/001_postgis_spatial.sql first.'
        );
      }
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'verifyParcelSpatial');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const spatial = await supabaseRpc<SpatialVerificationResult>('anagu_verify_parcel_spatial', {
        p_parcel_id: parcelId,
        p_buffer_meters: bufferMeters,
        p_enforce_buffer: enforceBuffer,
        p_persist_verification: persist
      });
      if (!spatial || !spatial.found) {
        return {
          parcel: null,
          spatial: spatial || {
            found: false,
            engine: 'postgis',
            parcelId,
            srid: 4326,
            bufferMeters,
            enforceBuffer,
            hasGeometry: false,
            isValid: false,
            validReason: 'Parcel not found.',
            vertexCount: 0,
            computedAreaSqm: null,
            computedPerimeterM: null,
            centroidLat: null,
            centroidLng: null,
            hasTrueOverlap: false,
            trueOverlapCount: 0,
            boundaryContactCount: 0,
            bufferBreachCount: 0,
            trueOverlaps: [],
            boundaryContacts: [],
            bufferBreaches: [],
            passed: false,
            persisted: false,
            queryDurationMs: 1
          }
        };
      }
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?select=*&id=eq.${encodeURIComponent(parcelId)}&limit=1`
      );
      return {
        parcel: rows[0] ? mapParcelRow(rows[0]) : null,
        spatial
      };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'verifyParcelSpatial')) throw err;
    }
  }

  if (isMemoryOnlyTestMode()) {
    return evaluateParcelSpatialInMemory(parcelId, bufferMeters, enforceBuffer, persist);
  }

  throw new SpatialMigrationRequiredError(
    'PostGIS spatial verification requires an active Supabase/PostgreSQL connection with supabase/migrations/001_postgis_spatial.sql applied.'
  );
}

export async function updateParcelSpatial(
  parcelId: string,
  options?: { bufferMeters?: number; enforceBuffer?: boolean }
): Promise<{ parcel: ParcelRecord | null; spatial: SpatialVerificationResult }> {
  const result = await verifyParcelSpatial(parcelId, {
    bufferMeters: options?.bufferMeters,
    enforceBuffer: options?.enforceBuffer,
    persist: true
  });
  if (!result.parcel || !result.spatial.found) {
    return result;
  }
  if (!result.spatial.passed) {
    const reason = !result.spatial.isValid
      ? `Invalid parcel polygon geometry: ${result.spatial.validReason}`
      : result.spatial.hasTrueOverlap
        ? `Spatial overlap detected with ${result.spatial.trueOverlapCount} existing active parcel(s).`
        : `Buffer clearance violation (${result.spatial.bufferMeters}m) with ${result.spatial.bufferBreachCount} neighboring parcel(s).`;
    throw new SpatialVerificationFailedError(reason, result.spatial);
  }
  if (result.spatial.persistenceRefused || !result.spatial.persisted) {
    const reason =
      result.spatial.persistenceRefusedReason ||
      result.spatial.error ||
      `Spatial verification persistence was refused because parcel is currently in "${result.spatial.status ?? result.parcel.status}" lifecycle state.`;
    throw new SpatialVerificationFailedError(reason, result.spatial);
  }
  return result;
}

export async function recordOracleAttestation(
  parcelId: string,
  input?: OracleAttestationInput
): Promise<ParcelRecord | null> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `
        UPDATE public.anagu_parcels
        SET status = 'oracle_verified', updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [parcelId]
      );
      if (!res.rows[0]) return null;
      const updated = mapParcelRow(res.rows[0]);

      await pool.query(
        `
        INSERT INTO public.anagu_oracle_attestations (
          id, parcel_id, cadastral_ref, affidavit_ref, family_witness, witness_notes,
          reviewer_id, quorum_percent, attestation_score, outcome
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Verified')
        `,
        [
          `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          updated.id,
          updated.cadastralRef,
          input?.affidavitRef ?? null,
          input?.familyWitness ?? null,
          input?.witnessNotes ?? null,
          input?.reviewerId ?? 'ORACLE_COUNCIL_DEFAULT',
          input?.quorumPercent ?? 100,
          input?.attestationScore ?? 98
        ]
      );
      return updated;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'recordOracleAttestation');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { status: 'oracle_verified' }
        }
      );
      if (!rows[0]) return null;
      const updated = mapParcelRow(rows[0]);
      await supabaseRest('anagu_oracle_attestations', {
        method: 'POST',
        body: {
          id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          parcel_id: updated.id,
          cadastral_ref: updated.cadastralRef,
          affidavit_ref: input?.affidavitRef ?? null,
          family_witness: input?.familyWitness ?? null,
          witness_notes: input?.witnessNotes ?? null,
          reviewer_id: input?.reviewerId ?? 'ORACLE_COUNCIL_DEFAULT',
          quorum_percent: input?.quorumPercent ?? 100,
          attestation_score: input?.attestationScore ?? 98,
          outcome: 'Verified'
        }
      });
      return updated;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'recordOracleAttestation')) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'oracle_verified';
  saveDurableStore();
  return found;
}

export async function mintParcelTitle(
  parcelId: string,
  tokenId: number,
  txHash: string,
  blockNumber?: number,
  issuanceTimestamp?: string
): Promise<ParcelRecord | null> {
  const finalBlock = blockNumber ?? Math.floor(1892040 + Math.random() * 100);
  const finalTs = issuanceTimestamp ?? new Date().toISOString();

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `
        UPDATE public.anagu_parcels
        SET status = 'registered',
            token_id = $2,
            tx_hash = $3,
            block_number = $4,
            issuance_timestamp = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [parcelId, tokenId, txHash, finalBlock, finalTs]
      );
      return res.rows[0] ? mapParcelRow(res.rows[0]) : null;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'mintParcelTitle');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            status: 'registered',
            token_id: tokenId,
            tx_hash: txHash,
            block_number: finalBlock,
            issuance_timestamp: finalTs
          }
        }
      );
      return rows[0] ? mapParcelRow(rows[0]) : null;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'mintParcelTitle')) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'registered';
  found.tokenId = tokenId;
  found.txHash = txHash;
  found.blockNumber = finalBlock;
  found.issuanceTimestamp = finalTs;
  saveDurableStore();
  return found;
}

export async function revokeParcelTitle(
  parcelId: string,
  ground: RevocationGround,
  gazetteNumber: string,
  reason: string
): Promise<ParcelRecord | null> {
  const revocationData = {
    ground,
    revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (GOVERNOR_ROLE)',
    timestamp: new Date().toISOString(),
    gazetteNumber,
    reason,
    revocationTxHash: '0x' + crypto.randomBytes(32).toString('hex')
  };

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `
        UPDATE public.anagu_parcels
        SET status = 'revoked',
            revocation_data = $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [parcelId, JSON.stringify(revocationData)]
      );
      return res.rows[0] ? mapParcelRow(res.rows[0]) : null;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'revokeParcelTitle');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            status: 'revoked',
            revocation_data: revocationData
          }
        }
      );
      return rows[0] ? mapParcelRow(rows[0]) : null;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'revokeParcelTitle')) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'revoked';
  found.revocationData = revocationData;
  saveDurableStore();
  return found;
}

export async function listMqttMessages(): Promise<MqttMessage[]> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredMqttRow>(
        `SELECT * FROM public.anagu_mqtt_events ORDER BY created_at DESC LIMIT 100`
      );
      return res.rows.map(mapMqttRow);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'listMqttMessages');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredMqttRow[]>(
        'anagu_mqtt_events?select=*&order=created_at.desc&limit=100'
      );
      return rows.map(mapMqttRow);
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'listMqttMessages')) throw err;
    }
  }

  return getMemoryMqtt();
}

export async function createMqttMessage(msg: MqttMessage): Promise<MqttMessage> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredMqttRow>(
        `
        INSERT INTO public.anagu_mqtt_events (
          id, topic, payload, qos, event_timestamp, delivery_latency_ms, status
        ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
        `,
        [
          msg.id,
          msg.topic,
          JSON.stringify(msg.payload),
          msg.qos,
          msg.timestamp,
          msg.deliveryLatencyMs,
          msg.status
        ]
      );
      return res.rows[0] ? mapMqttRow(res.rows[0]) : msg;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'createMqttMessage');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredMqttRow[]>('anagu_mqtt_events?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=representation',
        body: {
          id: msg.id,
          topic: msg.topic,
          payload: msg.payload,
          qos: msg.qos,
          event_timestamp: msg.timestamp,
          delivery_latency_ms: msg.deliveryLatencyMs,
          status: msg.status
        }
      });
      return rows[0] ? mapMqttRow(rows[0]) : msg;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'createMqttMessage')) throw err;
    }
  }

  const list = getMemoryMqtt();
  list.unshift(msg);
  saveDurableStore();
  return msg;
}

export async function createInquiry(input: InquiryInput): Promise<{ id: string; createdAt: string }> {
  const id = `inq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString();

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      await pool.query(
        `
        INSERT INTO public.anagu_inquiries (
          id, full_name, phone, email, state_jurisdiction, message
        ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [id, input.name, input.phone, input.email ?? null, input.state, input.message ?? null]
      );
      return { id, createdAt };
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'createInquiry');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest('anagu_inquiries', {
        method: 'POST',
        body: {
          id,
          full_name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          state_jurisdiction: input.state,
          message: input.message ?? null
        }
      });
      return { id, createdAt };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'createInquiry')) throw err;
    }
  }

  getMemoryInquiries().unshift({ ...input, id, createdAt });
  saveDurableStore();
  return { id, createdAt };
}

export async function signupUser(input: SignupInput): Promise<{ user?: AuthUser; error?: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const id = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString().slice(0, 10);
  const passwordHash = hashPassword(input.password);

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM public.anagu_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [normalizedEmail]
      );
      if (existing.rows.length > 0) {
        return { error: 'An account with this email already exists. Please sign in instead.' };
      }

      const res = await pool.query<StoredUserRow>(
        `
        INSERT INTO public.anagu_users (
          id, full_name, email, phone, role, state_jurisdiction, credential_id, password_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          id,
          input.fullName.trim(),
          normalizedEmail,
          input.phone.trim(),
          'citizen',
          input.state,
          input.credentialId.trim(),
          passwordHash
        ]
      );
      return { user: mapUserRow(res.rows[0]) };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return { error: 'An account with this email already exists. Please sign in instead.' };
      }
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'signupUser');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const existing = await supabaseRest<Array<{ id: string }>>(
        `anagu_users?select=id&email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`
      );
      if (existing.length > 0) {
        return { error: 'An account with this email already exists. Please sign in instead.' };
      }
      const rows = await supabaseRest<StoredUserRow[]>('anagu_users', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          id,
          full_name: input.fullName.trim(),
          email: normalizedEmail,
          phone: input.phone.trim(),
          role: 'citizen',
          state_jurisdiction: input.state,
          credential_id: input.credentialId.trim(),
          password_hash: passwordHash
        }
      });
      return { user: mapUserRow(rows[0]) };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'signupUser')) throw err;
    }
  }

  const users = getMemoryUsers();
  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }
  const row: StoredUserRow = {
    id,
    full_name: input.fullName.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    role: 'citizen',
    state_jurisdiction: input.state,
    credential_id: input.credentialId.trim(),
    password_hash: passwordHash,
    created_at: createdAt
  };
  users.unshift(row);
  saveDurableStore();
  return { user: mapUserRow(row) };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredUserRow>(
        `SELECT * FROM public.anagu_users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'getUserById');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredUserRow[]>(
        `anagu_users?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`
      );
      return rows[0] ? mapUserRow(rows[0]) : null;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'getUserById')) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.id === userId);
  return found ? mapUserRow(found) : null;
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user?: AuthUser; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = getPool();

  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredUserRow>(
        `SELECT * FROM public.anagu_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [normalizedEmail]
      );
      const found = res.rows[0];
      if (!found || !verifyPassword(password, found.password_hash)) {
        return { error: 'Invalid email or password.' };
      }
      return { user: mapUserRow(found) };
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'loginUser');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      let rows = await supabaseRest<StoredUserRow[]>(
        `anagu_users?select=*&email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`
      );
      if (rows.length === 0) {
        rows = await supabaseRest<StoredUserRow[]>(
          `anagu_users?select=*&email=ilike.${encodeURIComponent(normalizedEmail)}&limit=1`
        );
      }
      const found = rows.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
      if (!found || !verifyPassword(password, found.password_hash)) {
        return { error: 'Invalid email or password.' };
      }
      return { user: mapUserRow(found) };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'loginUser')) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!found || !verifyPassword(password, found.password_hash)) {
    return { error: 'Invalid email or password.' };
  }
  return { user: mapUserRow(found) };
}

export async function loginDemoRole(role: AccessRoleId): Promise<AuthUser> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredUserRow>(
        `SELECT * FROM public.anagu_users WHERE role = $1 ORDER BY created_at ASC LIMIT 1`,
        [role]
      );
      if (res.rows[0]) {
        return mapUserRow(res.rows[0]);
      }
      const fallback = SEED_USERS.find((u) => u.role === role) || SEED_USERS[0];
      return mapUserRow(fallback);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'loginDemoRole');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredUserRow[]>(
        `anagu_users?select=*&role=eq.${encodeURIComponent(role)}&order=created_at.asc&limit=1`
      );
      if (rows[0]) {
        return mapUserRow(rows[0]);
      }
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'loginDemoRole')) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.role === role) || SEED_USERS[0];
  return mapUserRow(found);
}

function mapAdminRow(row: StoredAdminRow): AdminUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    state: row.state_jurisdiction,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at.slice(0, 10)
        : new Date(row.created_at).toISOString().slice(0, 10)
  };
}

export async function signupAdmin(
  input: AdminSignupInput
): Promise<{ admin?: AdminUser; error?: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const id = `adm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString().slice(0, 10);
  const passwordHash = hashPassword(input.password);

  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM public.anagu_admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [normalizedEmail]
      );
      if (existing.rows.length > 0) {
        return { error: 'An admin account with this email already exists. Please sign in.' };
      }
      const res = await pool.query<StoredAdminRow>(
        `
        INSERT INTO public.anagu_admins (
          id, full_name, email, phone, department, state_jurisdiction, password_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          id,
          input.fullName.trim(),
          normalizedEmail,
          input.phone.trim(),
          input.department.trim(),
          input.state,
          passwordHash
        ]
      );
      return { admin: mapAdminRow(res.rows[0]) };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return { error: 'An admin account with this email already exists. Please sign in.' };
      }
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'signupAdmin');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const existing = await supabaseRest<Array<{ id: string }>>(
        `anagu_admins?select=id&email=ilike.${encodeURIComponent(normalizedEmail)}&limit=1`
      );
      if (existing.length > 0) {
        return { error: 'An admin account with this email already exists. Please sign in.' };
      }
      const rows = await supabaseRest<StoredAdminRow[]>('anagu_admins', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          id,
          full_name: input.fullName.trim(),
          email: normalizedEmail,
          phone: input.phone.trim(),
          department: input.department.trim(),
          state_jurisdiction: input.state,
          password_hash: passwordHash
        }
      });
      return { admin: mapAdminRow(rows[0]) };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'signupAdmin')) throw err;
    }
  }

  const admins = getMemoryAdmins();
  if (admins.some((a) => a.email.toLowerCase() === normalizedEmail)) {
    return { error: 'An admin account with this email already exists. Please sign in.' };
  }
  const row: StoredAdminRow = {
    id,
    full_name: input.fullName.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    department: input.department.trim(),
    state_jurisdiction: input.state,
    password_hash: passwordHash,
    created_at: createdAt
  };
  admins.unshift(row);
  saveDurableStore();
  return { admin: mapAdminRow(row) };
}

export async function loginAdmin(
  email: string,
  password: string
): Promise<{ admin?: AdminUser; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = getPool();

  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredAdminRow>(
        `SELECT * FROM public.anagu_admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [normalizedEmail]
      );
      const found = res.rows[0];
      if (!found || !verifyPassword(password, found.password_hash)) {
        return { error: 'Invalid admin email or password.' };
      }
      return { admin: mapAdminRow(found) };
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'loginAdmin');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      let rows = await supabaseRest<StoredAdminRow[]>(
        `anagu_admins?select=*&email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`
      );
      if (rows.length === 0) {
        rows = await supabaseRest<StoredAdminRow[]>(
          `anagu_admins?select=*&email=ilike.${encodeURIComponent(normalizedEmail)}&limit=1`
        );
      }
      const found = rows.find((a) => a.email.trim().toLowerCase() === normalizedEmail);
      if (!found || !verifyPassword(password, found.password_hash)) {
        return { error: 'Invalid admin email or password.' };
      }
      return { admin: mapAdminRow(found) };
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'loginAdmin')) throw err;
    }
  }

  const found = getMemoryAdmins().find((a) => a.email.toLowerCase() === normalizedEmail);
  if (!found || !verifyPassword(password, found.password_hash)) {
    return { error: 'Invalid admin email or password.' };
  }
  return { admin: mapAdminRow(found) };
}

export async function listAdmins(): Promise<AdminUser[]> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredAdminRow>(
        `SELECT * FROM public.anagu_admins ORDER BY created_at DESC`
      );
      return res.rows.map(mapAdminRow);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'listAdmins');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredAdminRow[]>(
        'anagu_admins?select=*&order=created_at.desc'
      );
      return rows.map(mapAdminRow);
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'listAdmins')) throw err;
    }
  }

  return getMemoryAdmins().map(mapAdminRow);
}

export async function listUsers(): Promise<AuthUser[]> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredUserRow>(
        `SELECT * FROM public.anagu_users ORDER BY created_at DESC`
      );
      return res.rows.map(mapUserRow);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'listUsers');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredUserRow[]>(
        'anagu_users?select=*&order=created_at.desc'
      );
      return rows.map(mapUserRow);
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'listUsers')) throw err;
    }
  }

  return getMemoryUsers().map(mapUserRow);
}

export async function updateUserRole(userId: string, role: AccessRoleId): Promise<AuthUser | null> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredUserRow>(
        `UPDATE public.anagu_users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [userId, role]
      );
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'updateUserRole');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredUserRow[]>(
        `anagu_users?id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { role }
        }
      );
      return rows[0] ? mapUserRow(rows[0]) : null;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'updateUserRole')) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.id === userId);
  if (!found) return null;
  found.role = role;
  saveDurableStore();
  return mapUserRow(found);
}

export async function deleteUser(userId: string): Promise<boolean> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query(`DELETE FROM public.anagu_users WHERE id = $1`, [userId]);
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'deleteUser');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest(`anagu_users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      return true;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'deleteUser')) throw err;
    }
  }

  const users = getMemoryUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  users.splice(idx, 1);
  saveDurableStore();
  return true;
}

export async function listInquiries(): Promise<AdminInquiryRecord[]> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredInquiryRow>(
        `SELECT * FROM public.anagu_inquiries ORDER BY created_at DESC LIMIT 200`
      );
      return res.rows.map((r) => ({
        id: r.id,
        name: r.full_name,
        phone: r.phone,
        email: r.email ?? undefined,
        state: r.state_jurisdiction,
        message: r.message ?? undefined,
        createdAt:
          typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString()
      }));
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'listInquiries');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredInquiryRow[]>(
        'anagu_inquiries?select=*&order=created_at.desc&limit=200'
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.full_name,
        phone: r.phone,
        email: r.email ?? undefined,
        state: r.state_jurisdiction,
        message: r.message ?? undefined,
        createdAt:
          typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString()
      }));
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'listInquiries')) throw err;
    }
  }

  return getMemoryInquiries().map((inq) => ({
    id: inq.id,
    name: inq.name,
    phone: inq.phone,
    email: inq.email,
    state: inq.state,
    message: inq.message,
    createdAt: inq.createdAt
  }));
}

export async function deleteInquiry(inquiryId: string): Promise<boolean> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query(`DELETE FROM public.anagu_inquiries WHERE id = $1`, [inquiryId]);
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'deleteInquiry');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest(`anagu_inquiries?id=eq.${encodeURIComponent(inquiryId)}`, {
        method: 'DELETE'
      });
      return true;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'deleteInquiry')) throw err;
    }
  }

  const list = getMemoryInquiries();
  const idx = list.findIndex((i) => i.id === inquiryId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  saveDurableStore();
  return true;
}

export async function adminSetParcelStatus(
  parcelId: string,
  status: ParcelRecord['status']
): Promise<ParcelRecord | null> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query<StoredParcelRow>(
        `UPDATE public.anagu_parcels SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [parcelId, status]
      );
      return res.rows[0] ? mapParcelRow(res.rows[0]) : null;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'adminSetParcelStatus');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { status }
        }
      );
      return rows[0] ? mapParcelRow(rows[0]) : null;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'adminSetParcelStatus')) throw err;
    }
  }

  const found = getMemoryParcels().find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = status;
  saveDurableStore();
  return found;
}

export async function adminDeleteParcel(parcelId: string): Promise<boolean> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureSchema(pool);
      const res = await pool.query(`DELETE FROM public.anagu_parcels WHERE id = $1`, [parcelId]);
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      tripPgCircuit(err, 'adminDeleteParcel');
    }
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest(`anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`, {
        method: 'DELETE'
      });
      return true;
    } catch (err) {
      if (!shouldFallbackFromSupabase(err, 'adminDeleteParcel')) throw err;
    }
  }

  const list = getMemoryParcels();
  const idx = list.findIndex((p) => p.id === parcelId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  saveDurableStore();
  return true;
}

