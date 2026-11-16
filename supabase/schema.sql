-- ============================================================================
-- ANAGU LAND ADMINISTRATION PLATFORM — SUPABASE / POSTGRESQL SCHEMA
-- ============================================================================
-- How to apply in Supabase:
-- 1. Open your Supabase Project Dashboard -> SQL Editor -> New Query.
-- 2. Paste this entire file and click "Run".
-- 3. Copy your Postgres Connection String (Transaction Pooler or Direct URI)
--    from Project Settings -> Database -> Connection String into DATABASE_URL.
-- ============================================================================

-- 1. Registry User Accounts (Citizens, Licensed Surveyors, Community Elders)
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

CREATE INDEX IF NOT EXISTS idx_anagu_users_email ON public.anagu_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_anagu_users_role ON public.anagu_users (role);

-- 2. Land Parcels & Cadastral Records
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
  intended_use TEXT NOT NULL CHECK (intended_use IN ('Residential', 'Commercial', 'Agricultural', 'Industrial', 'Public Utility')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'spatial_verified', 'oracle_verified', 'legal_approved', 'registered', 'revoked', 'rejected')),
  token_id INTEGER,
  tx_hash TEXT,
  block_number INTEGER,
  issuance_timestamp TEXT,
  revocation_data JSONB,
  created_by_user_id TEXT REFERENCES public.anagu_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anagu_parcels_cadastral_ref ON public.anagu_parcels (cadastral_ref);
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_status ON public.anagu_parcels (status);
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_state ON public.anagu_parcels (state);
CREATE INDEX IF NOT EXISTS idx_anagu_parcels_created_at ON public.anagu_parcels (created_at DESC);

-- 3. Community Oracle Attestations (LUA Section 36 Customary Quorum)
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
  outcome TEXT NOT NULL CHECK (outcome IN ('Verified', 'PendingReview', 'CustomaryConflict')),
  attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anagu_oracle_parcel_id ON public.anagu_oracle_attestations (parcel_id);

-- 4. MQTT Synchronisation & Event Audit Log
CREATE TABLE IF NOT EXISTS public.anagu_mqtt_events (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  qos SMALLINT NOT NULL DEFAULT 1 CHECK (qos IN (1, 2)),
  event_timestamp TEXT NOT NULL,
  delivery_latency_ms INTEGER NOT NULL DEFAULT 42,
  status TEXT NOT NULL CHECK (status IN ('delivered', 'buffered_offline', 'retransmitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anagu_mqtt_created_at ON public.anagu_mqtt_events (created_at DESC);

-- 5. Landing Page Contact & Registry Onboarding Inquiries
CREATE TABLE IF NOT EXISTS public.anagu_inquiries (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  state_jurisdiction TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anagu_inquiries_created_at ON public.anagu_inquiries (created_at DESC);

-- 6. Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_anagu_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anagu_users_updated_at ON public.anagu_users;
CREATE TRIGGER trg_anagu_users_updated_at
  BEFORE UPDATE ON public.anagu_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_anagu_updated_at();

DROP TRIGGER IF EXISTS trg_anagu_parcels_updated_at ON public.anagu_parcels;
CREATE TRIGGER trg_anagu_parcels_updated_at
  BEFORE UPDATE ON public.anagu_parcels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_anagu_updated_at();

-- ============================================================================
-- INITIAL SEED DATA (Idempotent - Safe to Re-run)
-- ============================================================================

-- Demo Accounts (passwords: anagu-citizen / anagu-surveyor / anagu-oracle)
INSERT INTO public.anagu_users (id, full_name, email, phone, role, state_jurisdiction, credential_id, password_hash, created_at)
VALUES
  (
    'usr-citizen-01',
    'Dr. Aminu Bello Abubakar',
    'aminu.bello@anagu.ng',
    '+234 803 412 8890',
    'citizen',
    'Federal Capital Territory (Abuja)',
    'NIN-8921-4091-2311',
    'anagu_salt_citizen_01:b88d9203d6dc1597bd5c15b35dee1ac64ff3d1e7fdd08e5aa17e42419a59d45eaca859310cfd1d15ce0d4d8e1561e0b70f9c9f14ad957a8c23668edef004b499',
    '2026-06-12T00:00:00Z'
  ),
  (
    'usr-surveyor-01',
    'Musa Adeleke',
    'musa.adeleke@nis-survey.ng',
    '+234 805 901 3342',
    'surveyor',
    'Federal Capital Territory (Abuja)',
    'SURCON-NIS-4821',
    'anagu_salt_surveyor_01:2aa19634c2a5ac035cf3a021ce73f0031a00f20d2e3e3d1a7d1d5f2e4491ce79d553e767cc45ca98b2577c442510ba42091972ae2b802717ce6d78cfda5bb6c7',
    '2026-05-04T00:00:00Z'
  ),
  (
    'usr-oracle-01',
    'Chief Chukwudi Nnamdi Eze',
    'chief.eze@oracle-council.ng',
    '+234 809 774 1120',
    'oracle',
    'Enugu State',
    'Council Elder · Ogui Nike Royal Quorum',
    'anagu_salt_oracle_01:4efcf73fd712e10a92ec4c6f88ba86a9d68c14f72fb7895f0d9b87410e229a84d29095c0172c3f6fabe55ec5e82a0372ce8c9bbefd496518af801de319dee00b',
    '2026-04-19T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Initial Registered, Spatial-Verified, and Statutory-Revoked Land Parcels
INSERT INTO public.anagu_parcels (
  id, cadastral_ref, applicant_name, applicant_nin, state, lga, district,
  area_sqm, perimeter_m, coordinates, beacons, spatial_hash, document_hash,
  survey_plan_ref, intended_use, status, token_id, tx_hash, block_number,
  issuance_timestamp, revocation_data, created_at
)
VALUES
  (
    'PAR-2026-0891',
    'FCT/AMAC/KAT/0891-B',
    'Dr. Aminu Bello Abubakar',
    'NIN-8921-4091-2311',
    'Federal Capital Territory',
    'Abuja Municipal (AMAC)',
    'Katampe Extension Diplomatic Zone',
    1845.5,
    178.4,
    '[[9.1025, 7.4521], [9.1038, 7.4539], [9.1029, 7.4552], [9.1016, 7.4534]]'::jsonb,
    '[{"id":"SCN-101","name":"PB 101","lat":9.1025,"lng":7.4521,"easting":329841.2,"northing":1006520.4,"elevation":512.4},{"id":"SCN-102","name":"PB 102","lat":9.1038,"lng":7.4539,"easting":330039.8,"northing":1006664.1,"elevation":514.1},{"id":"SCN-103","name":"PB 103","lat":9.1029,"lng":7.4552,"easting":330182.5,"northing":1006564.7,"elevation":513.8},{"id":"SCN-104","name":"PB 104","lat":9.1016,"lng":7.4534,"easting":329984.1,"northing":1006421.0,"elevation":511.9}]'::jsonb,
    '0x3a9f0291e0a9d821fc003192019a8200192a01f8938210921938910293019283',
    '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'NIS/FCT/SP/2026/0411',
    'Residential',
    'registered',
    4092,
    '0x8f3c7a9b12e456d7890123456789abcdef0123456789abcdef0123456789abcd',
    1892041,
    '2026-08-14 11:22:04 UTC',
    NULL,
    '2026-08-14T11:22:04Z'
  ),
  (
    'PAR-2026-0902',
    'LAG/ETI/LEK/0902-C',
    'Folashade Adeyemi Holdings Ltd',
    'RC-1049281 / NIN-4401-2918',
    'Lagos State',
    'Eti-Osa',
    'Lekki Phase 1 Waterfront',
    2420.0,
    210.0,
    '[[6.4421, 3.4812], [6.4435, 3.483], [6.4428, 3.4845], [6.4414, 3.4827]]'::jsonb,
    '[{"id":"LKG-201","name":"LB 201","lat":6.4421,"lng":3.4812,"easting":553210.4,"northing":712390.1,"elevation":4.2},{"id":"LKG-202","name":"LB 202","lat":6.4435,"lng":3.483,"easting":553409.2,"northing":712545.0,"elevation":4.5},{"id":"LKG-203","name":"LB 203","lat":6.4428,"lng":3.4845,"easting":553575.1,"northing":712467.8,"elevation":4.3},{"id":"LKG-204","name":"LB 204","lat":6.4414,"lng":3.4827,"easting":553376.5,"northing":712312.9,"elevation":4.1}]'::jsonb,
    '0x7b210948ac019283f01928401928301928301928301928301928301928301928',
    '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    'SURV/LAG/2026/8991',
    'Commercial',
    'spatial_verified',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-08-20T10:00:00Z'
  ),
  (
    'PAR-2026-0774',
    'ENU/ENN/IND/0774-A',
    'Chief Chukwudi Nnamdi Eze',
    'NIN-1920-5819-2044',
    'Enugu State',
    'Enugu North',
    'Independence Layout Phase 2',
    3100.2,
    245.8,
    '[[6.452, 7.514], [6.4536, 7.5162], [6.4525, 7.5178], [6.4509, 7.5156]]'::jsonb,
    '[{"id":"ENB-01","name":"EB 01","lat":6.452,"lng":7.514,"easting":335412.0,"northing":713420.5,"elevation":220.1},{"id":"ENB-02","name":"EB 02","lat":6.4536,"lng":7.5162,"easting":335655.4,"northing":713597.2,"elevation":221.4},{"id":"ENB-03","name":"EB 03","lat":6.4525,"lng":7.5178,"easting":335832.0,"northing":713475.9,"elevation":219.8},{"id":"ENB-04","name":"EB 04","lat":6.4509,"lng":7.5156,"easting":335588.6,"northing":713298.7,"elevation":218.9}]'::jsonb,
    '0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    '0x5544332211ffeeddccbbaa00998877665544332211ffeeddccbbaa0099887766',
    'EN/GIS/CAD/2026/0122',
    'Residential',
    'revoked',
    4078,
    '0x12a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
    1889410,
    '2026-06-20 09:14:32 UTC',
    '{"ground":"OverridingPublicInterest","revokedBy":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","timestamp":"2026-09-02 14:45:10 UTC","gazetteNumber":"State Gazette No. 44 Vol. 35 / Notice No. 892","reason":"Public infrastructure expansion: Construction of the Eastern Light Rail Metropolitan Intermodal Transit Corridor.","revocationTxHash":"0xee92817401928374910293847581920394857102938475610293847561029384"}'::jsonb,
    '2026-06-20T09:14:32Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Initial MQTT Events
INSERT INTO public.anagu_mqtt_events (id, topic, payload, qos, event_timestamp, delivery_latency_ms, status, created_at)
VALUES
  ('msg-901', 'land/title/issued', '{"tokenId":4092,"ownerId":"NIN-8921-4091-2311","parcelId":"PAR-2026-0891","txHash":"0x8f3c7a...abcd"}'::jsonb, 1, '11:22:05', 42, 'delivered', '2026-08-14T11:22:05Z'),
  ('msg-902', 'land/title/revoked', '{"tokenId":4078,"ground":"OverridingPublicInterest","revokedBy":"GOVERNOR_ROLE:0x7099...79C8","gazette":"Vol.35/No.892"}'::jsonb, 2, '14:45:12', 58, 'delivered', '2026-09-02T14:45:12Z'),
  ('msg-903', 'land/verification/oracle', '{"applicationId":"PAR-2026-0902","outcome":"Verified","attestationScore":98,"reviewerId":"ORACLE_OROD_ETIOSA"}'::jsonb, 1, '16:04:19', 38, 'delivered', '2026-09-02T16:04:19Z'),
  ('msg-904', 'land/registration/status', '{"applicationId":"PAR-2026-0902","status":"spatial_verified","bufferToleranceM":0.5,"intersectsCollision":false}'::jsonb, 1, '16:04:22', 44, 'delivered', '2026-09-02T16:04:22Z')
ON CONFLICT (id) DO NOTHING;
