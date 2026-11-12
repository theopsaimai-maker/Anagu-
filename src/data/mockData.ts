import { 
  ParcelRecord, 
  MqttMessage, 
  OracleAttestation, 
  FraudScenarioResult, 
  TimingStageResult, 
  StorageOverheadField,
  FigmaFrame 
} from '../types/anagu';

export const ASSET_IMAGES = {
  satelliteGrid: '/src/assets/images/cadastral_satellite_grid_1790243539472.jpg',
  titleSeal: '/src/assets/images/anagu_title_seal_1790243549784.jpg',
  governorDesk: '/src/assets/images/governor_executive_seal_1790243562677.jpg',
  oracleElders: '/src/assets/images/community_oracle_elders_1790243575375.jpg',
  heroArchitecture: '/src/assets/images/hero_cadastral_architecture_1794407019533.jpg',
  bentoCadastre: '/src/assets/images/bento_satellite_cadastre_1794407020714.jpg',
  bentoGovernance: '/src/assets/images/bento_executive_governance_1794407019288.jpg',
  logoAvatar: '/src/assets/images/anagu_logo_avatar_1794483457423.jpg',
  userAvatar: '/src/assets/images/user_profile_avatar_1794483470203.jpg',
};

export const INITIAL_PARCELS: ParcelRecord[] = [
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
      [9.1016, 7.4534],
    ],
    beacons: [
      { id: 'SCN-101', name: 'PB 101', lat: 9.1025, lng: 7.4521, easting: 329841.2, northing: 1006520.4, elevation: 512.4 },
      { id: 'SCN-102', name: 'PB 102', lat: 9.1038, lng: 7.4539, easting: 330039.8, northing: 1006664.1, elevation: 514.1 },
      { id: 'SCN-103', name: 'PB 103', lat: 9.1029, lng: 7.4552, easting: 330182.5, northing: 1006564.7, elevation: 513.8 },
      { id: 'SCN-104', name: 'PB 104', lat: 9.1016, lng: 7.4534, easting: 329984.1, northing: 1006421.0, elevation: 511.9 },
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
      [6.4435, 3.4830],
      [6.4428, 3.4845],
      [6.4414, 3.4827],
    ],
    beacons: [
      { id: 'LKG-201', name: 'LB 201', lat: 6.4421, lng: 3.4812, easting: 553210.4, northing: 712390.1, elevation: 4.2 },
      { id: 'LKG-202', name: 'LB 202', lat: 6.4435, lng: 3.4830, easting: 553409.2, northing: 712545.0, elevation: 4.5 },
      { id: 'LKG-203', name: 'LB 203', lat: 6.4428, lng: 3.4845, easting: 553575.1, northing: 712467.8, elevation: 4.3 },
      { id: 'LKG-204', name: 'LB 204', lat: 6.4414, lng: 3.4827, easting: 553376.5, northing: 712312.9, elevation: 4.1 },
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
      [6.4520, 7.5140],
      [6.4536, 7.5162],
      [6.4525, 7.5178],
      [6.4509, 7.5156],
    ],
    beacons: [
      { id: 'ENB-01', name: 'EB 01', lat: 6.4520, lng: 7.5140, easting: 335412.0, northing: 713420.5, elevation: 220.1 },
      { id: 'ENB-02', name: 'EB 02', lat: 6.4536, lng: 7.5162, easting: 335655.4, northing: 713597.2, elevation: 221.4 },
      { id: 'ENB-03', name: 'EB 03', lat: 6.4525, lng: 7.5178, easting: 335832.0, northing: 713475.9, elevation: 219.8 },
      { id: 'ENB-04', name: 'EB 04', lat: 6.4509, lng: 7.5156, easting: 335588.6, northing: 713298.7, elevation: 218.9 },
    ],
    revocationData: {
      ground: 'OverridingPublicInterest',
      revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Governor Executive Multisig
      timestamp: '2026-09-02 14:45:10 UTC',
      gazetteNumber: 'State Gazette No. 44 Vol. 35 / Notice No. 892',
      reason: 'Public infrastructure expansion: Construction of the Eastern Light Rail Metropolitan Intermodal Transit Corridor.',
      revocationTxHash: '0xee92817401928374910293847581920394857102938475610293847561029384'
    }
  }
];

export const INITIAL_MQTT_MESSAGES: MqttMessage[] = [
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

export const FRAUD_SCENARIO_RESULTS: FraudScenarioResult[] = [
  {
    id: 1,
    title: 'Forged or altered supporting document',
    targetLayer: 'Application / Document Layer',
    attackVector: 'Submitting doctored survey deed with altered coordinates and mismatched cryptographic signature',
    trials: 30,
    anaguDetected: 30,
    baselineDetected: 4,
    notes: 'SHA-256 document hashing + registrar signature cross-verification guarantees 100% rejection. Baseline only checks file presence.'
  },
  {
    id: 2,
    title: 'Duplicate or overlapping parcel claim',
    targetLayer: 'Spatial / GIS Cadastral Layer',
    attackVector: 'Submitting coordinates intentionally overlapping registered parcels within 0.5m buffer',
    trials: 30,
    anaguDetected: 30,
    baselineDetected: 0,
    notes: 'PostGIS ST_Intersects(ST_Buffer(geom, 0.5)) detects 100% of overlaps. Baseline has no automated spatial cross-check.'
  },
  {
    id: 3,
    title: 'Colluding verification informant',
    targetLayer: 'Oracle / Community Attestation Layer',
    attackVector: 'Submitting falsified customary ownership claims with corrupted local informant sign-off',
    trials: 30,
    anaguDetected: 28,
    baselineDetected: 2,
    notes: 'Dual-institutional reconciliation + council consensus catches 93.3% of colluding informants compared to 6.7% in manual systems.'
  },
  {
    id: 4,
    title: 'Post-revocation NFT reuse',
    targetLayer: 'Blockchain / Smart Contract Layer',
    attackVector: 'Attempting to transfer, mortgage or verify a title after Section 28 statutory revocation',
    trials: 30,
    anaguDetected: 30,
    baselineDetected: 0,
    notes: 'Solidity _beforeTokenTransfer hook enforces require(!isRevoked[tokenId]). Transfer reverts deterministically 100% on Hyperledger Besu.'
  }
];

export const TIMING_STAGE_RESULTS: TimingStageResult[] = [
  {
    stage: 'Spatial verification (PostGIS)',
    key: 't_gis',
    description: 'ST_IsValid, ST_Intersects & 0.5m buffer overlap calculation',
    anaguMeanMs: 412,
    anaguSd: 38,
    baselineMeanMs: 86400000 * 14, // 14 days manual survey inspection
    baselineSd: 86400000 * 3
  },
  {
    stage: 'Ownership / oracle verification',
    key: 't_oracle',
    description: 'Customary tenure reconciliation & council attestation check',
    anaguMeanMs: 1850,
    anaguSd: 210,
    baselineMeanMs: 86400000 * 21, // 21 days community inquiry
    baselineSd: 86400000 * 5
  },
  {
    stage: 'Smart contract execution',
    key: 't_contract',
    description: 'Hyperledger Besu permissioned ledger validation & state write',
    anaguMeanMs: 820,
    anaguSd: 65,
    baselineMeanMs: 86400000 * 30, // 30 days physical registry ledger entry
    baselineSd: 86400000 * 7
  },
  {
    stage: 'NFT issuance & minting',
    key: 't_nft',
    description: 'ERC-721 token minting with keccak256 spatial hash binding',
    anaguMeanMs: 460,
    anaguSd: 45,
    baselineMeanMs: 86400000 * 10, // 10 days certificate printing & signing
    baselineSd: 86400000 * 2
  },
  {
    stage: 'MQTT synchronisation',
    key: 't_sync',
    description: 'Event broadcast across web, mobile, and offline client queues',
    anaguMeanMs: 48,
    anaguSd: 8,
    baselineMeanMs: 86400000 * 5, // 5 days postal dispatch
    baselineSd: 86400000 * 1
  }
];

export const STORAGE_OVERHEAD_FIELDS: StorageOverheadField[] = [
  { symbol: 'S_id', name: 'Parcel Identity Hash', description: 'keccak256 cryptographic cadastral identifier', anaguBits: 256, baselineBits: 4096 },
  { symbol: 'S_geom', name: 'Spatial Geometry Reference', description: 'PostGIS spatial bounding hash on-chain (full vector off-chain)', anaguBits: 256, baselineBits: 65536 },
  { symbol: 'S_owner', name: 'Ownership / NFT-Holder Reference', description: '160-bit Ethereum address (20 bytes)', anaguBits: 160, baselineBits: 2048 },
  { symbol: 'S_oracle', name: 'Attestation Outcome Digest', description: 'Digest of verified customary community proof', anaguBits: 256, baselineBits: 16384 },
  { symbol: 'S_time', name: 'Block Timestamp', description: 'uint64 Unix epoch timestamp (8 bytes)', anaguBits: 64, baselineBits: 256 },
  { symbol: 'S_sig', name: 'Registrar & Governor Signature', description: 'ECDSA secp256k1 signature bytes (r, s, v)', anaguBits: 520, baselineBits: 4096 },
  { symbol: 'S_merkle', name: 'Merkle Root Proof', description: 'Off-chain deed MinIO Merkle leaf proof', anaguBits: 256, baselineBits: 8192 }
];

export const FIGMA_FRAMES: FigmaFrame[] = [
  {
    id: 'frame-landing',
    title: 'Anagu Sovereign Platform — Public Portal & Enterprise Landing',
    role: 'citizen',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: -1600,
    y: 0,
    category: 'Public Portal & Landing',
    badge: 'Master Platform Showcase'
  },
  {
    id: 'frame-citizen',
    title: 'Citizen Portal — Cadastral Survey & Title Tracker',
    role: 'citizen',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 0,
    y: 0,
    category: 'Application Workflow',
    badge: 'Stage 1: Citizen Submission'
  },
  {
    id: 'frame-surveyor',
    title: 'Surveyor Cadastral Station — PostGIS Spatial Verification',
    role: 'surveyor',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 1600,
    y: 0,
    category: 'GIS & Spatial Engine',
    badge: 'Component 1: Spatial Verification'
  },
  {
    id: 'frame-oracle',
    title: 'Community Verification Oracle & Customary Tenure Desk',
    role: 'land_administrator',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 3200,
    y: 0,
    category: 'Oracle & Attestation',
    badge: 'Component 3A: Community Oracle'
  },
  {
    id: 'frame-registrar',
    title: 'Registrar Approval & Hyperledger Besu Blockchain Console',
    role: 'registrar',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 4800,
    y: 0,
    category: 'Blockchain Ledger',
    badge: 'Component 2: NFT Issuance'
  },
  {
    id: 'frame-governor',
    title: 'Governor Executive Suite — Section 28 Statutory Revocation',
    role: 'governor',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 0,
    y: 1040,
    category: 'Statutory Governance',
    badge: 'Part C: Statutory Revocation'
  },
  {
    id: 'frame-mobile',
    title: 'Mobile Field App — Offline Beacon Logger & QR Verification',
    role: 'citizen',
    device: 'Mobile 390 × 844',
    width: 390,
    height: 844,
    x: 1600,
    y: 1040,
    category: 'Mobile & Field App',
    badge: 'React Native / Expo PWA'
  },
  {
    id: 'frame-mqtt',
    title: 'MQTT Messaging Event Bus & Offline Queue Telemetry',
    role: 'system',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 2150,
    y: 1040,
    category: 'Real-Time Messaging',
    badge: 'Component 3B: MQTT Telemetry'
  },
  {
    id: 'frame-evaluation',
    title: 'Component 4 — Cross-Cutting Evaluation & Fraud Benchmarks',
    role: 'evaluator',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 3750,
    y: 1040,
    category: 'Verification & Performance',
    badge: 'Component 4: Empirical Tables'
  },
  {
    id: 'frame-tokens',
    title: 'Anagu Master Design System & Cadastral Token Library',
    role: 'system',
    device: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
    x: 5350,
    y: 1040,
    category: 'Design System & Tokens',
    badge: 'Design Tokens & UI Kit'
  }
];
