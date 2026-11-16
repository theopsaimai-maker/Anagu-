import crypto from 'node:crypto';
import { Pool } from 'pg';
import type {
  AccessRoleId,
  AuthUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../src/types/anagu.ts';

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
  _anaguSchemaPromise?: Promise<void> | null;
  _anaguMemoryUsers?: StoredUserRow[];
  _anaguMemoryParcels?: ParcelRecord[];
  _anaguMemoryMqtt?: MqttMessage[];
  _anaguMemoryInquiries?: Array<InquiryInput & { id: string; createdAt: string }>;
};

function getMemoryUsers(): StoredUserRow[] {
  if (!globalStore._anaguMemoryUsers) {
    globalStore._anaguMemoryUsers = SEED_USERS.map((u) => ({ ...u }));
  }
  return globalStore._anaguMemoryUsers;
}

function getMemoryParcels(): ParcelRecord[] {
  if (!globalStore._anaguMemoryParcels) {
    globalStore._anaguMemoryParcels = SEED_PARCELS.map((p) => ({ ...p }));
  }
  return globalStore._anaguMemoryParcels;
}

function getMemoryMqtt(): MqttMessage[] {
  if (!globalStore._anaguMemoryMqtt) {
    globalStore._anaguMemoryMqtt = SEED_MQTT.map((m) => ({ ...m }));
  }
  return globalStore._anaguMemoryMqtt;
}

function getMemoryInquiries(): Array<InquiryInput & { id: string; createdAt: string }> {
  if (!globalStore._anaguMemoryInquiries) {
    globalStore._anaguMemoryInquiries = [];
  }
  return globalStore._anaguMemoryInquiries;
}

export function isDatabaseConfigured(): boolean {
  const url = (process.env.DATABASE_URL || '').trim();
  return url.length > 0 && !url.includes('[YOUR-PASSWORD]') && !url.includes('MY_DATABASE_URL');
}

export function isSupabaseRestConfigured(): boolean {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url.startsWith('https://') && key.length > 10 && !url.includes('[PROJECT-REF]');
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
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = parsed?.code;
    if (res.status === 404 || code === 'PGRST205' || code === '42P01') {
      throw new SupabaseTableMissingError(parsed?.message || 'Supabase tables not initialized yet.');
    }
    throw new Error(parsed?.message || parsed?.error || `Supabase error (${res.status})`);
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
  const url = process.env.DATABASE_URL!.trim();
  if (!globalStore._anaguPgPool || globalStore._anaguPgPoolUrl !== url) {
    globalStore._anaguPgPool = new Pool({
      connectionString: url,
      ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
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
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derivedHex = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(originalHex, 'hex');
  const b = Buffer.from(derivedHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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

function mapParcelRow(row: StoredParcelRow): ParcelRecord {
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
    beacons: Array.isArray(row.beacons) ? row.beacons : [],
    spatialHash: row.spatial_hash,
    documentHash: row.document_hash,
    surveyPlanRef: row.survey_plan_ref,
    intendedUse: row.intended_use,
    status: row.status
  };

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
    beacons: parcel.beacons,
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
    await ensureSchema(pool);
    await pool.query('SELECT 1');
    return { ok: true, mode: 'postgresql' };
  }

  if (isSupabaseRestConfigured()) {
    try {
      await supabaseRest<Array<{ id: string }>>('anagu_parcels?select=id&limit=1');
      return { ok: true, mode: 'supabase_rest' };
    } catch (err) {
      if (err instanceof SupabaseTableMissingError) {
        return { ok: true, mode: 'supabase_pending_schema' };
      }
      throw err;
    }
  }

  return { ok: true, mode: 'memory' };
}

export async function listParcels(): Promise<ParcelRecord[]> {
  const pool = getPool();
  if (pool) {
    await ensureSchema(pool);
    const res = await pool.query<StoredParcelRow>(
      `SELECT * FROM public.anagu_parcels ORDER BY created_at DESC, id ASC`
    );
    return res.rows.map(mapParcelRow);
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        'anagu_parcels?select=*&order=created_at.desc,id.asc'
      );
      return rows.map(mapParcelRow);
    } catch (err) {
      if (err instanceof SupabaseTableMissingError) {
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
        JSON.stringify(parcel.beacons),
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const list = getMemoryParcels();
  list.unshift(parcel);
  return parcel;
}

export async function updateParcelSpatial(parcelId: string): Promise<ParcelRecord | null> {
  const pool = getPool();
  if (pool) {
    await ensureSchema(pool);
    const res = await pool.query<StoredParcelRow>(
      `
      UPDATE public.anagu_parcels
      SET status = 'spatial_verified', updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [parcelId]
    );
    return res.rows[0] ? mapParcelRow(res.rows[0]) : null;
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredParcelRow[]>(
        `anagu_parcels?id=eq.${encodeURIComponent(parcelId)}`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { status: 'spatial_verified' }
        }
      );
      return rows[0] ? mapParcelRow(rows[0]) : null;
    } catch (err) {
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'spatial_verified';
  return found;
}

export async function recordOracleAttestation(
  parcelId: string,
  input?: OracleAttestationInput
): Promise<ParcelRecord | null> {
  const pool = getPool();
  if (pool) {
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'oracle_verified';
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const list = getMemoryParcels();
  const found = list.find((p) => p.id === parcelId);
  if (!found) return null;
  found.status = 'revoked';
  found.revocationData = revocationData;
  return found;
}

export async function listMqttMessages(): Promise<MqttMessage[]> {
  const pool = getPool();
  if (pool) {
    await ensureSchema(pool);
    const res = await pool.query<StoredMqttRow>(
      `SELECT * FROM public.anagu_mqtt_events ORDER BY created_at DESC LIMIT 100`
    );
    return res.rows.map(mapMqttRow);
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredMqttRow[]>(
        'anagu_mqtt_events?select=*&order=created_at.desc&limit=100'
      );
      return rows.map(mapMqttRow);
    } catch (err) {
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  return getMemoryMqtt();
}

export async function createMqttMessage(msg: MqttMessage): Promise<MqttMessage> {
  const pool = getPool();
  if (pool) {
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const list = getMemoryMqtt();
  list.unshift(msg);
  return msg;
}

export async function createInquiry(input: InquiryInput): Promise<{ id: string; createdAt: string }> {
  const id = `inq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString();

  const pool = getPool();
  if (pool) {
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  getMemoryInquiries().unshift({ ...input, id, createdAt });
  return { id, createdAt };
}

export async function signupUser(input: SignupInput): Promise<{ user?: AuthUser; error?: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const id = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString().slice(0, 10);
  const passwordHash = hashPassword(input.password);

  const pool = getPool();
  if (pool) {
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
        input.role,
        input.state,
        input.credentialId.trim(),
        passwordHash
      ]
    );
    return { user: mapUserRow(res.rows[0]) };
  }

  if (isSupabaseRestConfigured()) {
    try {
      const existing = await supabaseRest<Array<{ id: string }>>(
        `anagu_users?select=id&email=ilike.${encodeURIComponent(normalizedEmail)}&limit=1`
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
          role: input.role,
          state_jurisdiction: input.state,
          credential_id: input.credentialId.trim(),
          password_hash: passwordHash
        }
      });
      return { user: mapUserRow(rows[0]) };
    } catch (err) {
      if (!(err instanceof SupabaseTableMissingError)) throw err;
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
    role: input.role,
    state_jurisdiction: input.state,
    credential_id: input.credentialId.trim(),
    password_hash: passwordHash,
    created_at: createdAt
  };
  users.unshift(row);
  return { user: mapUserRow(row) };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user?: AuthUser; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = getPool();

  if (pool) {
    await ensureSchema(pool);
    const res = await pool.query<StoredUserRow>(
      `SELECT * FROM public.anagu_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );
    const found = res.rows[0];
    if (!found) {
      return { error: 'No Anagu account was found for that email. Switch to Create Account to register.' };
    }
    if (!verifyPassword(password, found.password_hash)) {
      return { error: 'Incorrect password. Please check your password or use a verified sample profile below.' };
    }
    return { user: mapUserRow(found) };
  }

  if (isSupabaseRestConfigured()) {
    try {
      const rows = await supabaseRest<StoredUserRow[]>(
        `anagu_users?select=*&email=ilike.${encodeURIComponent(normalizedEmail)}&limit=1`
      );
      const found = rows[0];
      if (!found) {
        return { error: 'No Anagu account was found for that email. Switch to Create Account to register.' };
      }
      if (!verifyPassword(password, found.password_hash)) {
        return { error: 'Incorrect password. Please check your password or use a verified sample profile below.' };
      }
      return { user: mapUserRow(found) };
    } catch (err) {
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!found) {
    return { error: 'No Anagu account was found for that email. Switch to Create Account to register.' };
  }
  if (!verifyPassword(password, found.password_hash)) {
    return { error: 'Incorrect password. Please check your password or use a verified sample profile below.' };
  }
  return { user: mapUserRow(found) };
}

export async function loginDemoRole(role: AccessRoleId): Promise<AuthUser> {
  const pool = getPool();
  if (pool) {
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
      if (!(err instanceof SupabaseTableMissingError)) throw err;
    }
  }

  const found = getMemoryUsers().find((u) => u.role === role) || SEED_USERS[0];
  return mapUserRow(found);
}
