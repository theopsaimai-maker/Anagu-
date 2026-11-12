export type AppRole = 'citizen' | 'surveyor' | 'registrar' | 'land_administrator' | 'governor';

export type RevocationGround = 'OverridingPublicInterest' | 'BreachOfStatutoryCondition';

export interface BeaconPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  easting: number;
  northing: number;
  elevation: number;
}

export interface ParcelRecord {
  id: string;
  cadastralRef: string;
  applicantName: string;
  applicantNin: string;
  state: string;
  lga: string;
  district: string;
  areaSqm: number;
  perimeterM: number;
  coordinates: [number, number][]; // [lat, lng]
  beacons: BeaconPoint[];
  spatialHash: string; // keccak256 hash of geometry
  documentHash: string; // SHA-256
  surveyPlanRef: string;
  intendedUse: 'Residential' | 'Commercial' | 'Agricultural' | 'Industrial' | 'Public Utility';
  status: 'draft' | 'spatial_verified' | 'oracle_verified' | 'legal_approved' | 'registered' | 'revoked' | 'rejected';
  tokenId?: number;
  txHash?: string;
  blockNumber?: number;
  issuanceTimestamp?: string;
  revocationData?: {
    ground: RevocationGround;
    revokedBy: string;
    timestamp: string;
    gazetteNumber: string;
    reason: string;
    revocationTxHash: string;
  };
}

export interface MqttMessage {
  id: string;
  topic: 'land/registration/status' | 'land/title/issued' | 'land/title/revoked' | 'land/verification/oracle' | 'land/notification/titleholder';
  payload: Record<string, any>;
  qos: 1 | 2;
  timestamp: string;
  deliveryLatencyMs: number;
  status: 'delivered' | 'buffered_offline' | 'retransmitted';
}

export interface OracleAttestation {
  applicationId: string;
  cadastralRef: string;
  customaryClaimant: string;
  villageHead: string;
  eldersAffidavitRef: string;
  boundaryConflictDetected: boolean;
  conflictNotes?: string;
  outcome: 'Verified' | 'PendingReview' | 'CustomaryConflict';
  attestationScore: number; // 0 - 100
  attestedAt: string;
}

export interface FraudScenarioResult {
  id: number;
  title: string;
  targetLayer: string;
  attackVector: string;
  trials: number;
  anaguDetected: number;
  baselineDetected: number;
  notes: string;
}

export interface TimingStageResult {
  stage: string;
  key: 't_gis' | 't_oracle' | 't_contract' | 't_nft' | 't_sync';
  description: string;
  anaguMeanMs: number;
  anaguSd: number;
  baselineMeanMs: number;
  baselineSd: number;
}

export interface StorageOverheadField {
  symbol: string;
  name: string;
  description: string;
  anaguBits: number;
  baselineBits: number;
}

// Figma Design Environment Types
export type FigmaViewMode = 'canvas' | 'prototype' | 'specs' | 'landing';

export type FigmaPageId = 
  | 'screens' 
  | 'landing-page'
  | 'design-system' 
  | 'cadastral-gis' 
  | 'smart-contracts' 
  | 'benchmarks';

export type FigmaFrameId = 
  | 'frame-landing'
  | 'frame-citizen'
  | 'frame-surveyor'
  | 'frame-oracle'
  | 'frame-registrar'
  | 'frame-governor'
  | 'frame-mobile'
  | 'frame-mqtt'
  | 'frame-evaluation'
  | 'frame-tokens';

export interface FigmaFrame {
  id: FigmaFrameId;
  title: string;
  role: AppRole | 'system' | 'evaluator';
  device: 'Desktop 1440 × 900' | 'Mobile 390 × 844';
  width: number;
  height: number;
  x: number;
  y: number;
  category: string;
  badge: string;
}
