import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import type {
  AccessRoleId,
  AdminInquiryRecord,
  AdminUser,
  AuthUser,
  BeaconPoint,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../types/anagu';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'theophilussamuel100@gmail.com';
const ETH_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ALLOWED_INTENDED_USES: ReadonlySet<ParcelRecord['intendedUse']> = new Set([
  'Residential',
  'Commercial',
  'Agricultural',
  'Industrial',
  'Public Utility'
]);

interface FirestoreCoord {
  lat: number;
  lng: number;
}

function toTimestampIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

function maskCredential(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'VERIFIED';
  if (trimmed.length <= 4) return '••••';
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

function cleanSafeParcelId(id: string): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 120);
  return cleaned || `PAR-${Date.now()}`;
}

function cleanSafeDocId(id: string, prefix = 'DOC'): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 120);
  return cleaned || `${prefix}-${Date.now()}`;
}

function serializeCoordinates(coords: [number, number][] | undefined): FirestoreCoord[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .slice(0, 100)
    .filter(
      (c): c is [number, number] =>
        Array.isArray(c) &&
        c.length >= 2 &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number' &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1])
    )
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
}

function deserializeCoordinates(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      'lat' in item &&
      'lng' in item &&
      typeof (item as FirestoreCoord).lat === 'number' &&
      typeof (item as FirestoreCoord).lng === 'number'
    ) {
      out.push([(item as FirestoreCoord).lat, (item as FirestoreCoord).lng]);
    } else if (
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number'
    ) {
      out.push([item[0], item[1]]);
    }
  }
  return out;
}

function serializeBeacons(beacons: BeaconPoint[] | undefined): BeaconPoint[] {
  if (!Array.isArray(beacons)) return [];
  return beacons.slice(0, 100).map((b, idx) => ({
    id: String(b.id || `BC-${idx + 1}`).slice(0, 64),
    name: String(b.name || `PB ${idx + 1}`).slice(0, 64),
    lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : 0,
    lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : 0,
    easting: Number.isFinite(Number(b.easting)) ? Number(b.easting) : 0,
    northing: Number.isFinite(Number(b.northing)) ? Number(b.northing) : 0,
    elevation: Number.isFinite(Number(b.elevation)) ? Number(b.elevation) : 0
  }));
}

function fromFirestoreParcelDoc(data: Record<string, unknown>, id: string): ParcelRecord {
  const parcel: ParcelRecord = {
    id: String(data.id || id),
    cadastralRef: String(data.cadastralRef || id),
    applicantName: String(data.applicantName || 'Registered Titleholder'),
    applicantNin: String(data.applicantNinMasked || 'NIN-VERIFIED'),
    state: String(data.state || 'Federal Capital Territory (Abuja)'),
    lga: String(data.lga || 'Abuja Municipal (AMAC)'),
    district: String(data.district || ''),
    areaSqm: typeof data.areaSqm === 'number' && Number.isFinite(data.areaSqm) ? data.areaSqm : 1200,
    perimeterM: typeof data.perimeterM === 'number' && Number.isFinite(data.perimeterM) ? data.perimeterM : 140,
    coordinates: deserializeCoordinates(data.coordinates),
    beacons: serializeBeacons(data.beacons as BeaconPoint[] | undefined),
    spatialHash: String(data.spatialHash || ''),
    documentHash: String(data.documentHash || ''),
    surveyPlanRef: String(data.surveyPlanRef || ''),
    intendedUse: ALLOWED_INTENDED_USES.has(data.intendedUse as ParcelRecord['intendedUse'])
      ? (data.intendedUse as ParcelRecord['intendedUse'])
      : 'Residential',
    status: (data.status as ParcelRecord['status']) || 'draft'
  };

  if (typeof data.priceUsd === 'number' && Number.isFinite(data.priceUsd) && data.priceUsd > 0) {
    parcel.priceUsd = data.priceUsd;
  }
  if (typeof data.sellerWallet === 'string' && ETH_ADDRESS_PATTERN.test(data.sellerWallet)) {
    parcel.sellerWallet = data.sellerWallet;
  }
  if (typeof data.mapSnapshotUrl === 'string' && data.mapSnapshotUrl.trim().length > 0) {
    parcel.mapSnapshotUrl = data.mapSnapshotUrl;
  }
  if (typeof data.tokenId === 'number' && Number.isFinite(data.tokenId)) {
    parcel.tokenId = data.tokenId;
  }
  if (typeof data.txHash === 'string' && data.txHash) {
    parcel.txHash = data.txHash;
  }
  if (typeof data.blockNumber === 'number' && Number.isFinite(data.blockNumber)) {
    parcel.blockNumber = data.blockNumber;
  }
  if (typeof data.issuanceTimestamp === 'string' && data.issuanceTimestamp) {
    parcel.issuanceTimestamp = data.issuanceTimestamp;
  }
  if (data.revocationData && typeof data.revocationData === 'object') {
    parcel.revocationData = data.revocationData as ParcelRecord['revocationData'];
  }

  return parcel;
}

function buildParcelFirestorePayload(
  parcel: ParcelRecord,
  ownerUid: string,
  options?: { allowPrivilegedFields?: boolean }
): Record<string, unknown> {
  const cleanWallet =
    typeof parcel.sellerWallet === 'string' && ETH_ADDRESS_PATTERN.test(parcel.sellerWallet.trim())
      ? parcel.sellerWallet.trim()
      : undefined;

  const safeSnapshot =
    typeof parcel.mapSnapshotUrl === 'string' &&
    parcel.mapSnapshotUrl.trim().length > 0 &&
    parcel.mapSnapshotUrl.trim().length <= 340000
      ? parcel.mapSnapshotUrl.trim()
      : undefined;

  const payload: Record<string, unknown> = {
    id: cleanSafeParcelId(parcel.id),
    cadastralRef: String(parcel.cadastralRef || parcel.id).trim().slice(0, 100),
    applicantName: String(parcel.applicantName || 'Applicant').trim().slice(0, 160),
    applicantNinMasked: maskCredential(String(parcel.applicantNin || '')).slice(0, 100),
    state: String(parcel.state || 'Federal Capital Territory (Abuja)').trim().slice(0, 100),
    lga: String(parcel.lga || 'Abuja Municipal (AMAC)').trim().slice(0, 100),
    district: String(parcel.district || '').trim().slice(0, 200),
    areaSqm:
      typeof parcel.areaSqm === 'number' && Number.isFinite(parcel.areaSqm) && parcel.areaSqm > 0
        ? parcel.areaSqm
        : 1200,
    perimeterM:
      typeof parcel.perimeterM === 'number' &&
      Number.isFinite(parcel.perimeterM) &&
      parcel.perimeterM > 0
        ? parcel.perimeterM
        : 140,
    coordinates: serializeCoordinates(parcel.coordinates),
    beacons: serializeBeacons(parcel.beacons),
    spatialHash: String(parcel.spatialHash || '').trim().slice(0, 128),
    documentHash: String(parcel.documentHash || '').trim().slice(0, 128),
    surveyPlanRef: String(parcel.surveyPlanRef || '').trim().slice(0, 120),
    intendedUse: ALLOWED_INTENDED_USES.has(parcel.intendedUse) ? parcel.intendedUse : 'Residential',
    status: options?.allowPrivilegedFields ? parcel.status : 'draft',
    visibility: 'public',
    ownerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (typeof parcel.priceUsd === 'number' && Number.isFinite(parcel.priceUsd) && parcel.priceUsd > 0) {
    payload.priceUsd = parcel.priceUsd;
  }
  if (cleanWallet) {
    payload.sellerWallet = cleanWallet;
  }
  if (safeSnapshot) {
    payload.mapSnapshotUrl = safeSnapshot;
  }

  if (options?.allowPrivilegedFields) {
    if (typeof parcel.tokenId === 'number' && Number.isFinite(parcel.tokenId)) {
      payload.tokenId = parcel.tokenId;
    }
    if (typeof parcel.txHash === 'string' && parcel.txHash.trim()) {
      payload.txHash = parcel.txHash.trim().slice(0, 128);
    }
    if (typeof parcel.blockNumber === 'number' && Number.isFinite(parcel.blockNumber)) {
      payload.blockNumber = parcel.blockNumber;
    }
    if (typeof parcel.issuanceTimestamp === 'string' && parcel.issuanceTimestamp.trim()) {
      payload.issuanceTimestamp = parcel.issuanceTimestamp.trim().slice(0, 80);
    }
    if (parcel.revocationData) {
      payload.revocationData = {
        ground: parcel.revocationData.ground,
        revokedBy: String(parcel.revocationData.revokedBy || '').slice(0, 160),
        timestamp: String(parcel.revocationData.timestamp || '').slice(0, 80),
        gazetteNumber: String(parcel.revocationData.gazetteNumber || '').slice(0, 200),
        reason: String(parcel.revocationData.reason || '').slice(0, 2000),
        revocationTxHash: String(parcel.revocationData.revocationTxHash || '').slice(0, 128)
      };
    }
  }

  return payload;
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth);
}

export async function checkIsFirebaseAdmin(user: FirebaseUser | null): Promise<boolean> {
  if (!user || !user.emailVerified || !user.email) return false;
  const email = user.email.trim().toLowerCase();
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) return true;

  try {
    const byEmail = await getDoc(doc(db, 'admins', email));
    if (byEmail.exists()) return true;
    const byUid = await getDoc(doc(db, 'admins', user.uid));
    return byUid.exists();
  } catch {
    return false;
  }
}

export async function ensureAdminProfileInFirestore(
  user: FirebaseUser,
  overrides?: Partial<AdminUser>
): Promise<AdminUser> {
  const email = (user.email || '').trim().toLowerCase();
  const docId = email === BOOTSTRAPPED_ADMIN_EMAIL ? user.uid : email;
  const ref = doc(db, 'admins', docId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data();
      return {
        id: String(data.id || docId),
        fullName: String(data.fullName || user.displayName || 'Registry Administrator'),
        email: String(data.email || email),
        phone: String(data.phone || '+234 800 262 4800'),
        department: String(data.department || 'Federal Land Registry Inspectorate'),
        state: String(data.state || 'Federal Capital Territory (Abuja)'),
        createdAt: toTimestampIso(data.createdAt).slice(0, 10)
      };
    }

    const adminRecord: AdminUser = {
      id: docId,
      fullName: (overrides?.fullName || user.displayName || 'Registrar-General Chief Admin').slice(0, 160),
      email,
      phone: (overrides?.phone || '+234 800 262 4800').slice(0, 40),
      department: (overrides?.department || 'Federal Land Registry Inspectorate').slice(0, 160),
      state: (overrides?.state || 'Federal Capital Territory (Abuja)').slice(0, 100),
      createdAt: new Date().toISOString().slice(0, 10)
    };

    await setDoc(ref, {
      id: adminRecord.id,
      fullName: adminRecord.fullName,
      email: adminRecord.email,
      phone: adminRecord.phone,
      department: adminRecord.department,
      state: adminRecord.state,
      createdAt: serverTimestamp()
    });
    return adminRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${docId}`);
  }
}

export async function fetchFirestoreParcels(): Promise<ParcelRecord[]> {
  try {
    const q = query(collection(db, 'parcels'), where('visibility', '==', 'public'));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => fromFirestoreParcelDoc(d.data() as Record<string, unknown>, d.id));
    return list.sort((a, b) => b.id.localeCompare(a.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'parcels');
  }
}

export function subscribeFirestoreParcels(
  onData: (parcels: ParcelRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, 'parcels'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => fromFirestoreParcelDoc(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => b.id.localeCompare(a.id));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'parcels');
      } catch (formatted) {
        if (onError && formatted instanceof Error) {
          onError(formatted);
        }
      }
    }
  );
}

export async function saveParcelToFirestore(
  parcel: ParcelRecord,
  options?: { allowPrivilegedFields?: boolean }
): Promise<ParcelRecord> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('FIREBASE_AUTH_REQUIRED');
  }
  const safeId = cleanSafeParcelId(parcel.id);
  const parcelRef = doc(db, 'parcels', safeId);
  const identityRef = doc(db, 'parcel_identities', safeId);

  try {
    const batch = writeBatch(db);
    batch.set(
      parcelRef,
      buildParcelFirestorePayload({ ...parcel, id: safeId }, user.uid, options)
    );
    batch.set(identityRef, {
      parcelId: safeId,
      applicantNin: String(parcel.applicantNin || 'NIN-PENDING').trim().slice(0, 100) || 'NIN-PENDING',
      ownerUid: user.uid,
      createdAt: serverTimestamp()
    });
    await batch.commit();
    return {
      ...parcel,
      id: safeId,
      status: options?.allowPrivilegedFields ? parcel.status : 'draft'
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `parcels/${safeId}`);
  }
}

export async function syncParcelsToFirestore(
  parcels: ParcelRecord[],
  options?: { isAdminSync?: boolean }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || parcels.length === 0) return;

  const isAdmin = options?.isAdminSync || (await checkIsFirebaseAdmin(user));
  if (!isAdmin) return;

  const existing = await fetchFirestoreParcels();
  const existingIds = new Set(existing.map((p) => p.id));

  for (const parcel of parcels) {
    const safeId = cleanSafeParcelId(parcel.id);
    if (existingIds.has(safeId)) continue;
    try {
      await saveParcelToFirestore({ ...parcel, id: safeId }, { allowPrivilegedFields: true });
    } catch {
      // Continue syncing remaining parcels even if one fails validation
    }
  }
}

export async function adminVerifyParcelInFirestore(parcel: ParcelRecord): Promise<ParcelRecord> {
  const safeId = cleanSafeParcelId(parcel.id);
  const tokenId = parcel.tokenId ?? Math.floor(4300 + Math.random() * 5000);
  const txHash =
    parcel.txHash ||
    '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const blockNumber = parcel.blockNumber ?? Math.floor(1892100 + Math.random() * 1000);
  const issuanceTimestamp = parcel.issuanceTimestamp || new Date().toISOString();

  try {
    await updateDoc(doc(db, 'parcels', safeId), {
      status: 'registered',
      tokenId,
      txHash,
      blockNumber,
      issuanceTimestamp,
      updatedAt: serverTimestamp()
    });

    await saveMqttEventToFirestore({
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      topic: 'land/title/issued',
      payload: {
        parcelId: safeId,
        cadastralRef: parcel.cadastralRef,
        tokenId,
        verifiedByAdmin: auth.currentUser?.email || 'admin',
        publishedToAccessLands: true
      },
      qos: 1,
      timestamp: new Date().toLocaleTimeString(),
      deliveryLatencyMs: 36,
      status: 'delivered'
    });

    return {
      ...parcel,
      id: safeId,
      status: 'registered',
      tokenId,
      txHash,
      blockNumber,
      issuanceTimestamp
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${safeId}`);
  }
}

export async function adminRejectParcelInFirestore(
  parcel: ParcelRecord,
  reason?: string
): Promise<ParcelRecord> {
  const safeId = cleanSafeParcelId(parcel.id);
  try {
    await updateDoc(doc(db, 'parcels', safeId), {
      status: 'rejected',
      updatedAt: serverTimestamp()
    });

    await saveMqttEventToFirestore({
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      topic: 'land/registration/status',
      payload: {
        parcelId: safeId,
        cadastralRef: parcel.cadastralRef,
        status: 'rejected',
        rejectedByAdmin: auth.currentUser?.email || 'admin',
        reason: reason || 'Rejected during admin registry review'
      },
      qos: 1,
      timestamp: new Date().toLocaleTimeString(),
      deliveryLatencyMs: 38,
      status: 'delivered'
    });

    return { ...parcel, id: safeId, status: 'rejected' };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${safeId}`);
  }
}

export async function adminSetParcelPendingInFirestore(parcel: ParcelRecord): Promise<ParcelRecord> {
  const safeId = cleanSafeParcelId(parcel.id);
  try {
    await updateDoc(doc(db, 'parcels', safeId), {
      status: 'draft',
      updatedAt: serverTimestamp()
    });
    return { ...parcel, id: safeId, status: 'draft' };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${safeId}`);
  }
}

export async function adminRevokeParcelInFirestore(
  parcel: ParcelRecord,
  ground: RevocationGround,
  gazetteNumber: string,
  reason: string
): Promise<ParcelRecord> {
  const safeId = cleanSafeParcelId(parcel.id);
  const revocationData: NonNullable<ParcelRecord['revocationData']> = {
    ground,
    revokedBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (ADMIN_GOVERNANCE)',
    timestamp: new Date().toISOString(),
    gazetteNumber: gazetteNumber.slice(0, 200),
    reason: reason.slice(0, 2000),
    revocationTxHash:
      '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  };

  try {
    await updateDoc(doc(db, 'parcels', safeId), {
      status: 'revoked',
      revocationData,
      updatedAt: serverTimestamp()
    });

    await saveMqttEventToFirestore({
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      topic: 'land/title/revoked',
      payload: {
        parcelId: safeId,
        cadastralRef: parcel.cadastralRef,
        ground
      },
      qos: 2,
      timestamp: new Date().toLocaleTimeString(),
      deliveryLatencyMs: 42,
      status: 'delivered'
    });

    return {
      ...parcel,
      id: safeId,
      status: 'revoked',
      revocationData
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${safeId}`);
  }
}

export async function adminDeleteParcelInFirestore(parcelId: string): Promise<void> {
  const safeId = cleanSafeParcelId(parcelId);
  try {
    await deleteDoc(doc(db, 'parcels', safeId));
    await deleteDoc(doc(db, 'parcel_identities', safeId)).catch(() => undefined);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `parcels/${safeId}`);
  }
}

export async function updateParcelStageInFirestore(
  parcelId: string,
  status: 'spatial_verified' | 'oracle_verified'
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const safeId = cleanSafeParcelId(parcelId);
  try {
    await updateDoc(doc(db, 'parcels', safeId), {
      status,
      updatedAt: serverTimestamp()
    });
  } catch {
    // Server endpoint or role guard handles unauthorized transitions cleanly
  }
}

export async function saveUserProfileToFirestore(
  firebaseUser: FirebaseUser,
  role: AccessRoleId,
  details?: { fullName?: string; phone?: string; state?: string; credentialId?: string }
): Promise<AuthUser> {
  const uid = firebaseUser.uid;
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'profile');

  try {
    const existingSnap = await getDoc(userRef);
    const existingPrivateSnap = await getDoc(privateRef).catch(() => null);

    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const existingPriv = existingPrivateSnap?.exists() ? existingPrivateSnap.data() : null;

    const finalRole: AccessRoleId =
      existingData?.role === 'citizen' ||
      existingData?.role === 'surveyor' ||
      existingData?.role === 'oracle'
        ? existingData.role
        : role;

    const fullName = String(
      details?.fullName || existingData?.fullName || firebaseUser.displayName || 'Anagu Citizen'
    ).slice(0, 160);
    const state = String(
      details?.state || existingData?.state || 'Federal Capital Territory (Abuja)'
    ).slice(0, 100);
    const email = String(firebaseUser.email || existingPriv?.email || '').slice(0, 180);
    const phone = String(details?.phone || existingPriv?.phone || '+234 800 000 0000').slice(0, 40);
    const credentialId = String(
      details?.credentialId || existingPriv?.credentialId || `NIN-${uid.slice(0, 8).toUpperCase()}`
    ).slice(0, 120);

    const batch = writeBatch(db);
    if (existingSnap.exists()) {
      batch.update(userRef, {
        fullName,
        state,
        credentialMask: maskCredential(credentialId),
        updatedAt: serverTimestamp()
      });
    } else {
      batch.set(userRef, {
        id: uid,
        fullName,
        role: finalRole,
        state,
        credentialMask: maskCredential(credentialId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    batch.set(privateRef, {
      email,
      phone,
      credentialId,
      ownerUid: uid,
      createdAt: existingPriv?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    return {
      id: uid,
      fullName,
      email,
      phone,
      role: finalRole,
      state,
      credentialId,
      createdAt: existingData?.createdAt
        ? toTimestampIso(existingData.createdAt).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function fetchAdminUsersFromFirestore(): Promise<AuthUser[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = await Promise.all(
      snap.docs.map(async (userDoc) => {
        const d = userDoc.data();
        let priv: Record<string, unknown> = {};
        try {
          const privSnap = await getDoc(doc(db, 'users', userDoc.id, 'private', 'profile'));
          if (privSnap.exists()) {
            priv = privSnap.data() as Record<string, unknown>;
          }
        } catch {
          // Non-bootstrapped secondary admin fallback
        }
        return {
          id: String(d.id || userDoc.id),
          fullName: String(d.fullName || 'User'),
          email: String(priv.email || ''),
          phone: String(priv.phone || ''),
          role: (d.role as AccessRoleId) || 'citizen',
          state: String(d.state || 'Federal Capital Territory (Abuja)'),
          credentialId: String(priv.credentialId || d.credentialMask || 'VERIFIED'),
          createdAt: toTimestampIso(d.createdAt).slice(0, 10)
        };
      })
    );
    return users;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function adminUpdateUserRoleInFirestore(
  userId: string,
  role: AccessRoleId
): Promise<AuthUser> {
  const safeId = cleanSafeDocId(userId);
  try {
    await updateDoc(doc(db, 'users', safeId), {
      role,
      updatedAt: serverTimestamp()
    });
    const snap = await getDoc(doc(db, 'users', safeId));
    const privSnap = await getDoc(doc(db, 'users', safeId, 'private', 'profile')).catch(() => null);
    const d = snap.data() || {};
    const priv = privSnap?.exists() ? privSnap.data() : {};
    return {
      id: safeId,
      fullName: String(d.fullName || 'User'),
      email: String(priv.email || ''),
      phone: String(priv.phone || ''),
      role,
      state: String(d.state || 'Federal Capital Territory (Abuja)'),
      credentialId: String(priv.credentialId || d.credentialMask || 'VERIFIED'),
      createdAt: toTimestampIso(d.createdAt).slice(0, 10)
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${safeId}`);
  }
}

export async function adminDeleteUserInFirestore(userId: string): Promise<void> {
  const safeId = cleanSafeDocId(userId);
  try {
    await deleteDoc(doc(db, 'users', safeId, 'private', 'profile')).catch(() => undefined);
    await deleteDoc(doc(db, 'users', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${safeId}`);
  }
}

export async function fetchAdminsFromFirestore(): Promise<AdminUser[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        fullName: String(data.fullName || 'Registry Admin'),
        email: String(data.email || ''),
        phone: String(data.phone || ''),
        department: String(data.department || 'Land Registry Administration'),
        state: String(data.state || 'Federal Capital Territory (Abuja)'),
        createdAt: toTimestampIso(data.createdAt).slice(0, 10)
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admins');
  }
}

export async function saveInquiryToFirestore(payload: {
  name: string;
  phone: string;
  email?: string;
  state: string;
  message?: string;
}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;

  const id = cleanSafeDocId(`inq-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`);
  try {
    const docData: Record<string, unknown> = {
      id,
      buyerUid: user.uid,
      name: payload.name.trim().slice(0, 160),
      phone: payload.phone.trim().slice(0, 40),
      state: (payload.state || 'Federal Capital Territory (Abuja)').trim().slice(0, 100),
      createdAt: serverTimestamp()
    };
    if (payload.email && payload.email.trim()) {
      docData.email = payload.email.trim().slice(0, 180);
    }
    if (payload.message && payload.message.trim()) {
      docData.message = payload.message.trim().slice(0, 4000);
    }
    await setDoc(doc(db, 'inquiries', id), docData);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `inquiries/${id}`);
  }
}

export async function fetchInquiriesFromFirestore(): Promise<AdminInquiryRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'inquiries'));
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          name: String(data.name || ''),
          phone: String(data.phone || ''),
          email: typeof data.email === 'string' ? data.email : undefined,
          state: String(data.state || ''),
          message: typeof data.message === 'string' ? data.message : undefined,
          createdAt: toTimestampIso(data.createdAt)
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'inquiries');
  }
}

export async function adminDeleteInquiryInFirestore(inquiryId: string): Promise<void> {
  const safeId = cleanSafeDocId(inquiryId);
  try {
    await deleteDoc(doc(db, 'inquiries', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `inquiries/${safeId}`);
  }
}

export async function saveMqttEventToFirestore(message: MqttMessage): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const safeId = cleanSafeDocId(message.id, 'msg');
  try {
    await setDoc(doc(db, 'mqtt_events', safeId), {
      id: safeId,
      topic: message.topic,
      payload:
        message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
          ? message.payload
          : {},
      qos: message.qos === 2 ? 2 : 1,
      timestamp: String(message.timestamp || new Date().toLocaleTimeString()).slice(0, 40),
      deliveryLatencyMs:
        typeof message.deliveryLatencyMs === 'number' && Number.isFinite(message.deliveryLatencyMs)
          ? Math.max(0, Math.min(60000, Math.round(message.deliveryLatencyMs)))
          : 40,
      status: message.status || 'delivered',
      visibility: 'public',
      ownerUid: user.uid,
      createdAt: serverTimestamp()
    });
  } catch {
    // Non-blocking audit telemetry
  }
}

export async function addAuthorizedAdminEmail(input: {
  email: string;
  fullName: string;
  phone?: string;
  department?: string;
  state?: string;
}): Promise<AdminUser> {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw new Error('Please enter a valid Google email address.');
  }

  const adminRecord: AdminUser = {
    id: cleanEmail,
    fullName: input.fullName.trim().slice(0, 160) || cleanEmail,
    email: cleanEmail,
    phone: (input.phone || '+234 800 262 4800').trim().slice(0, 40),
    department: (input.department || 'Registry Inspectorate').trim().slice(0, 160),
    state: (input.state || 'Federal Capital Territory (Abuja)').trim().slice(0, 100),
    createdAt: new Date().toISOString().slice(0, 10)
  };

  try {
    await setDoc(doc(db, 'admins', cleanEmail), {
      id: adminRecord.id,
      fullName: adminRecord.fullName,
      email: adminRecord.email,
      phone: adminRecord.phone,
      department: adminRecord.department,
      state: adminRecord.state,
      createdAt: serverTimestamp()
    });
    return adminRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admins/${cleanEmail}`);
  }
}

export async function fetchMqttEventsFromFirestore(): Promise<MqttMessage[]> {
  try {
    const q = query(collection(db, 'mqtt_events'), where('visibility', '==', 'public'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          topic: data.topic as MqttMessage['topic'],
          payload: (data.payload as Record<string, unknown>) || {},
          qos: data.qos === 2 ? 2 : 1,
          timestamp: String(data.timestamp || ''),
          deliveryLatencyMs: Number(data.deliveryLatencyMs || 40),
          status: (data.status as MqttMessage['status']) || 'delivered'
        } satisfies MqttMessage;
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'mqtt_events');
  }
}

export function subscribeFirestoreMqttEvents(
  onData: (messages: MqttMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, 'mqtt_events'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            topic: data.topic as MqttMessage['topic'],
            payload: (data.payload as Record<string, unknown>) || {},
            qos: data.qos === 2 ? 2 : 1,
            timestamp: String(data.timestamp || ''),
            deliveryLatencyMs: Number(data.deliveryLatencyMs || 40),
            status: (data.status as MqttMessage['status']) || 'delivered'
          } satisfies MqttMessage;
        })
        .sort((a, b) => b.id.localeCompare(a.id));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'mqtt_events');
      } catch (formatted) {
        if (onError && formatted instanceof Error) {
          onError(formatted);
        }
      }
    }
  );
}

/**
 * Merges parcel arrays by priority order (earlier lists win when IDs collide)
 * so Cloud Firestore remains canonical while preserving pending Express/local submissions.
 */
export function mergeParcelLists(...lists: ParcelRecord[][]): ParcelRecord[] {
  const map = new Map<string, ParcelRecord>();
  for (const list of lists) {
    for (const item of list) {
      if (!item || !item.id) continue;
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
}

