import 'dotenv/config';
import crypto from 'node:crypto';
import dns from 'node:dns';
import express from 'express';
import type {
  AccessRoleId,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from '../src/types/anagu.ts';
import {
  isDemoAccountsEnabled,
  isOriginAllowed,
  signAdminToken,
  signUserToken,
  validateAuthConfig,
  verifyAdminInviteCode,
  verifyAdminToken,
  verifyUserToken
} from './auth.ts';
import {
  adminDeleteParcel,
  adminSetParcelStatus,
  createInquiry,
  createMqttMessage,
  createParcel,
  deleteInquiry,
  deleteUser,
  getDatabaseHealth,
  getUserById,
  listAdmins,
  listInquiries,
  listMqttMessages,
  listParcels,
  listUsers,
  loginAdmin,
  loginDemoRole,
  loginUser,
  mintParcelTitle,
  ParcelGeometryImmutableError,
  recordOracleAttestation,
  revokeParcelTitle,
  signupAdmin,
  signupUser,
  SpatialMigrationRequiredError,
  SpatialVerificationFailedError,
  updateParcelSpatial,
  updateUserRole,
  verifyParcelSpatial
} from './db.ts';

dns.setDefaultResultOrder('ipv4first');

const globalRateStore = globalThis as unknown as {
  _anaguAuthRateMap?: Map<string, { count: number; resetAt: number }>;
};

export function resetRateLimitsForTests(): void {
  globalRateStore._anaguAuthRateMap?.clear();
}

const ETH_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const PHONE_PATTERN = /^[+0-9()\-\s]{6,40}$/;
const ALLOWED_MQTT_TOPICS: ReadonlySet<MqttMessage['topic']> = new Set([
  'land/registration/status',
  'land/verification/oracle',
  'land/notification/titleholder',
  'land/title/issued',
  'land/title/revoked'
]);
const ADMIN_ONLY_MQTT_TOPICS: ReadonlySet<MqttMessage['topic']> = new Set([
  'land/title/issued',
  'land/title/revoked'
]);

function checkRateLimit(
  req: express.Request,
  scope: string,
  maxAttempts = 30,
  windowMs = 5 * 60 * 1000
): boolean {
  if (!globalRateStore._anaguAuthRateMap) {
    globalRateStore._anaguAuthRateMap = new Map();
  }
  const map = globalRateStore._anaguAuthRateMap;
  const now = Date.now();
  if (map.size > 2000) {
    for (const [k, v] of map.entries()) {
      if (v.resetAt <= now) map.delete(k);
    }
  }
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : '') ||
    req.ip ||
    'unknown';
  const key = `${scope}:${ip}`;
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= maxAttempts;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_INTENDED_USES: ReadonlySet<ParcelRecord['intendedUse']> = new Set([
  'Residential',
  'Commercial',
  'Agricultural',
  'Industrial',
  'Public Utility'
]);

function isSafeSnapshotUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 1_500_000) return false;
  return (
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed) ||
    /^https:\/\/[^\s<>"']+$/i.test(trimmed) ||
    /^\/assets\/[^\s<>"']+$/i.test(trimmed)
  );
}

function extractBearerToken(req: express.Request): string {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function attachApiRoutes(app: express.Express): void {
  validateAuthConfig();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Strict CORS allowlist for /api routes
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (origin) {
      if (!isOriginAllowed(origin, req.headers.host)) {
        return res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  const requireAdminAuth: express.RequestHandler = (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required. Please sign in.' });
    }
    const decoded = verifyAdminToken(token);
    if (!decoded) {
      if (verifyUserToken(token)) {
        return res.status(403).json({ error: 'Administrator privileges are required for this action.' });
      }
      return res.status(401).json({ error: 'Invalid or expired administrator token. Please sign in again.' });
    }
    (req as express.Request & { adminSession?: typeof decoded }).adminSession = decoded;
    return next();
  };

  const requireAuthenticated: express.RequestHandler = async (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    const adminSession = verifyAdminToken(token);
    if (adminSession) {
      (req as express.Request & { adminSession?: typeof adminSession }).adminSession = adminSession;
      (req as express.Request & { authActor?: { sub: string; isAdmin: boolean; role?: AccessRoleId } }).authActor = {
        sub: adminSession.sub,
        isAdmin: true
      };
      return next();
    }
    const userSession = verifyUserToken(token);
    if (!userSession) {
      return res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
    }
    try {
      const dbUser = await getUserById(userSession.sub);
      if (!dbUser) {
        return res.status(401).json({ error: 'Account session is no longer valid. Please sign in again.' });
      }
      (req as express.Request & { authActor?: { sub: string; isAdmin: boolean; role: AccessRoleId } }).authActor = {
        sub: dbUser.id,
        isAdmin: false,
        role: dbUser.role
      };
      return next();
    } catch (err) {
      console.error('[anagu/api] Auth lookup error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to verify account session.' });
    }
  };

  const requireRoleOrAdmin = (allowedRoles: AccessRoleId[]): express.RequestHandler => {
    return async (req, res, next) => {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Authentication required for this registry action.' });
      }
      const adminSession = verifyAdminToken(token);
      if (adminSession) {
        (req as express.Request & { adminSession?: typeof adminSession }).adminSession = adminSession;
        return next();
      }
      const userSession = verifyUserToken(token);
      if (!userSession) {
        return res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
      }
      try {
        const dbUser = await getUserById(userSession.sub);
        if (!dbUser) {
          return res.status(401).json({ error: 'Account session is no longer valid. Please sign in again.' });
        }
        if (!allowedRoles.includes(dbUser.role)) {
          return res.status(403).json({
            error: `Restricted action: requires ${allowedRoles.join(' or ')} or administrator authorization.`
          });
        }
        return next();
      } catch (err) {
        console.error('[anagu/api] Role verification error:', err instanceof Error ? err.message : err);
        return res.status(500).json({ error: 'Unable to verify role authorization.' });
      }
    };
  };

  // Health Check
  app.get('/api/health', async (_req, res) => {
    try {
      const health = await getDatabaseHealth();
      res.json(health);
    } catch (err) {
      console.error('[anagu/api] Health check error:', err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, error: 'Database connectivity check failed' });
    }
  });

  // Authentication Routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      if (!checkRateLimit(req, 'user-login', 20, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
      }
      const { email, password } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !EMAIL_PATTERN.test(email.trim()) ||
        !password ||
        password.length > 256
      ) {
        return res.status(400).json({ error: 'Valid email and password are required.' });
      }
      const result = await loginUser(email, password);
      if (result.error || !result.user) {
        return res.status(401).json({ error: result.error || 'Authentication failed.' });
      }
      const token = signUserToken(result.user);
      return res.json({ user: result.user, token });
    } catch (err) {
      console.error('[anagu/api] Login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to sign in right now.' });
    }
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      if (!checkRateLimit(req, 'user-signup', 15, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many registration attempts. Please wait and try again.' });
      }
      const { fullName, email, phone, role, state, credentialId, password } = req.body ?? {};
      if (role !== undefined && role !== null && role !== '' && role !== 'citizen') {
        return res.status(403).json({
          error:
            'Self-assignment of privileged roles is not permitted. New accounts are created as citizen and require administrator approval for surveyor or oracle privileges.'
        });
      }
      if (
        typeof fullName !== 'string' ||
        typeof email !== 'string' ||
        typeof phone !== 'string' ||
        typeof credentialId !== 'string' ||
        typeof password !== 'string' ||
        !fullName.trim() ||
        fullName.trim().length > 160 ||
        !EMAIL_PATTERN.test(email.trim()) ||
        email.trim().length > 180 ||
        !PHONE_PATTERN.test(phone.trim()) ||
        !credentialId.trim() ||
        credentialId.trim().length > 120 ||
        password.length < 6 ||
        password.length > 256
      ) {
        return res.status(400).json({
          error: 'Valid name, email, phone, credential ID, and password (6–256 chars) are required.'
        });
      }
      const result = await signupUser({
        fullName,
        email,
        phone,
        role: 'citizen',
        state:
          typeof state === 'string' && state.trim()
            ? state.trim().slice(0, 100)
            : 'Federal Capital Territory (Abuja)',
        credentialId,
        password
      });
      if (result.error || !result.user) {
        return res.status(409).json({ error: result.error || 'Could not create account.' });
      }
      const token = signUserToken(result.user);
      return res.status(201).json({ user: result.user, token });
    } catch (err) {
      console.error('[anagu/api] Signup error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const token = extractBearerToken(req);
      const userSession = token ? verifyUserToken(token) : null;
      if (!userSession) {
        return res.status(401).json({ error: 'Invalid or expired user session.' });
      }
      const user = await getUserById(userSession.sub);
      if (!user) {
        return res.status(401).json({ error: 'User account no longer exists.' });
      }
      return res.json({ user });
    } catch (err) {
      console.error('[anagu/api] Session lookup error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to verify user session.' });
    }
  });

  app.post('/api/auth/demo', async (req, res) => {
    try {
      if (!isDemoAccountsEnabled()) {
        return res.status(403).json({
          error: 'Demo authentication is disabled in this environment. Please sign in with a registered account.'
        });
      }
      if (!checkRateLimit(req, 'user-demo', 20, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many demo sign-in requests. Please wait a moment.' });
      }
      const roleParam = req.body?.role;
      const validRole: AccessRoleId = roleParam === 'surveyor' || roleParam === 'oracle' ? roleParam : 'citizen';
      const user = await loginDemoRole(validRole);
      const token = signUserToken(user);
      return res.json({ user, token });
    } catch (err) {
      console.error('[anagu/api] Demo login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to sign in with sample profile.' });
    }
  });

  // Parcel Registry Routes (Public Read, Authenticated Write)
  app.get('/api/parcels', async (_req, res) => {
    try {
      const parcels = await listParcels();
      res.json({ parcels });
    } catch (err) {
      console.error('[anagu/api] List parcels error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Failed to load parcel records.' });
    }
  });

  app.post('/api/parcels', requireAuthenticated, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'parcel-create', 20, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many parcel submissions. Please wait before trying again.' });
      }
      const rawParcel = req.body?.parcel as ParcelRecord | undefined;
      const authActor = (
        req as express.Request & { authActor?: { sub: string; isAdmin: boolean; role?: AccessRoleId } }
      ).authActor;
      const authenticatedUserId = authActor?.sub;
      if (
        !rawParcel ||
        typeof rawParcel.id !== 'string' ||
        typeof rawParcel.cadastralRef !== 'string' ||
        typeof rawParcel.applicantName !== 'string' ||
        !rawParcel.id.trim() ||
        !rawParcel.cadastralRef.trim() ||
        !rawParcel.applicantName.trim()
      ) {
        return res.status(400).json({ error: 'Invalid parcel payload.' });
      }

      const intendedUse: ParcelRecord['intendedUse'] = ALLOWED_INTENDED_USES.has(rawParcel.intendedUse)
        ? rawParcel.intendedUse
        : 'Residential';
      const areaSqm =
        typeof rawParcel.areaSqm === 'number' && Number.isFinite(rawParcel.areaSqm) && rawParcel.areaSqm > 0
          ? rawParcel.areaSqm
          : 1200;
      const perimeterM =
        typeof rawParcel.perimeterM === 'number' && Number.isFinite(rawParcel.perimeterM) && rawParcel.perimeterM > 0
          ? rawParcel.perimeterM
          : 140;
      const priceUsd =
        typeof rawParcel.priceUsd === 'number' && Number.isFinite(rawParcel.priceUsd) && rawParcel.priceUsd > 0
          ? rawParcel.priceUsd
          : undefined;

      const rawWallet =
        typeof rawParcel.sellerWallet === 'string'
          ? rawParcel.sellerWallet.replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '').trim()
          : '';
      if (rawWallet && !ETH_ADDRESS_PATTERN.test(rawWallet)) {
        return res.status(400).json({ error: 'Invalid Seller Web3 wallet address format.' });
      }

      const validCoordinates: [number, number][] = Array.isArray(rawParcel.coordinates)
        ? rawParcel.coordinates
            .slice(0, 100)
            .filter(
              (c): c is [number, number] =>
                Array.isArray(c) &&
                c.length >= 2 &&
                typeof c[0] === 'number' &&
                typeof c[1] === 'number' &&
                Number.isFinite(c[0]) &&
                Number.isFinite(c[1]) &&
                c[0] >= -90 &&
                c[0] <= 90 &&
                c[1] >= -180 &&
                c[1] <= 180
            )
            .map((c) => [c[0], c[1]])
        : [];

      const existingParcels = await listParcels();
      const collision = existingParcels.find(
        (p) =>
          p.id === rawParcel.id.trim().slice(0, 80) &&
          (p.status !== 'draft' || p.cadastralRef !== rawParcel.cadastralRef.trim().slice(0, 80))
      );
      if (collision) {
        return res.status(409).json({
          error: 'A parcel with this identifier already exists and cannot be overwritten.'
        });
      }

      // Enforce mandatory pending-admin-verification gate server-side:
      // public submissions MUST start as 'draft' with no pre-minted title metadata.
      const sanitizedParcel: ParcelRecord = {
        id: rawParcel.id.trim().slice(0, 80),
        cadastralRef: rawParcel.cadastralRef.trim().slice(0, 80),
        applicantName: rawParcel.applicantName.trim().slice(0, 160),
        applicantNin: String(rawParcel.applicantNin || '').trim().slice(0, 100),
        state: String(rawParcel.state || 'Federal Capital Territory (Abuja)').trim().slice(0, 100),
        lga: String(rawParcel.lga || 'Abuja Municipal (AMAC)').trim().slice(0, 100),
        district: String(rawParcel.district || '').trim().slice(0, 200),
        areaSqm,
        perimeterM,
        coordinates: validCoordinates,
        beacons: Array.isArray(rawParcel.beacons) ? rawParcel.beacons.slice(0, 100) : [],
        spatialHash: String(rawParcel.spatialHash || '').trim().slice(0, 128),
        documentHash: String(rawParcel.documentHash || '').trim().slice(0, 128),
        surveyPlanRef: String(rawParcel.surveyPlanRef || '').trim().slice(0, 120),
        intendedUse,
        priceUsd,
        sellerWallet: rawWallet || undefined,
        mapSnapshotUrl: isSafeSnapshotUrl(rawParcel.mapSnapshotUrl) ? rawParcel.mapSnapshotUrl : undefined,
        status: 'draft'
      };

      const created = await createParcel(sanitizedParcel, authenticatedUserId);
      return res.status(201).json({ parcel: created });
    } catch (err) {
      if (err instanceof ParcelGeometryImmutableError) {
        return res.status(409).json({ error: err.message });
      }
      console.error('[anagu/api] Create parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to persist land parcel application.' });
    }
  });

  app.post('/api/parcels/:id/spatial/analyze', requireRoleOrAdmin(['surveyor']), async (req, res) => {
    try {
      if (!checkRateLimit(req, 'parcel-write', 60, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many spatial analysis requests. Please slow down.' });
      }
      const bufferMeters =
        typeof req.body?.bufferMeters === 'number' && Number.isFinite(req.body.bufferMeters)
          ? req.body.bufferMeters
          : 0.5;
      const enforceBuffer = Boolean(req.body?.enforceBuffer);
      const { parcel, spatial } = await verifyParcelSpatial(req.params.id, {
        bufferMeters,
        enforceBuffer,
        persist: false
      });
      if (!parcel || !spatial.found) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel, spatial });
    } catch (err) {
      if (err instanceof SpatialMigrationRequiredError) {
        return res.status(503).json({ error: err.message, migrationRequired: true });
      }
      console.error('[anagu/api] Spatial analysis error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to execute PostGIS spatial analysis.' });
    }
  });

  app.patch('/api/parcels/:id/spatial', requireRoleOrAdmin(['surveyor']), async (req, res) => {
    try {
      if (!checkRateLimit(req, 'parcel-write', 60, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many parcel verification requests. Please slow down.' });
      }
      const bufferMeters =
        typeof req.body?.bufferMeters === 'number' && Number.isFinite(req.body.bufferMeters)
          ? req.body.bufferMeters
          : 0.5;
      const enforceBuffer = Boolean(req.body?.enforceBuffer);
      const { parcel, spatial } = await updateParcelSpatial(req.params.id, {
        bufferMeters,
        enforceBuffer
      });
      if (!parcel || !spatial.found) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel, spatial });
    } catch (err) {
      if (err instanceof SpatialVerificationFailedError) {
        return res.status(409).json({ error: err.message, spatial: err.spatial });
      }
      if (err instanceof SpatialMigrationRequiredError) {
        return res.status(503).json({ error: err.message, migrationRequired: true });
      }
      console.error('[anagu/api] Spatial approval error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to update spatial verification status.' });
    }
  });

  app.patch('/api/parcels/:id/oracle', requireRoleOrAdmin(['oracle']), async (req, res) => {
    try {
      if (!checkRateLimit(req, 'parcel-write', 60, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many parcel attestation requests. Please slow down.' });
      }
      const updated = await recordOracleAttestation(req.params.id, req.body ?? {});
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/api] Oracle attestation error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to record Community Oracle attestation.' });
    }
  });

  app.patch('/api/parcels/:id/mint', requireAdminAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-write', 120, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrative write requests.' });
      }
      const { tokenId, txHash, blockNumber, issuanceTimestamp } = req.body ?? {};
      if (typeof tokenId !== 'number' || typeof txHash !== 'string' || !txHash.trim()) {
        return res.status(400).json({ error: 'tokenId and txHash are required.' });
      }
      const updated = await mintParcelTitle(req.params.id, tokenId, txHash, blockNumber, issuanceTimestamp);
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/api] Mint title error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to mint Certificate of Occupancy.' });
    }
  });

  app.patch('/api/parcels/:id/revoke', requireAdminAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-write', 120, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrative write requests.' });
      }
      const { ground, gazetteNumber, reason } = req.body ?? {};
      const validGround: RevocationGround =
        ground === 'BreachOfStatutoryCondition' ? 'BreachOfStatutoryCondition' : 'OverridingPublicInterest';
      const updated = await revokeParcelTitle(
        req.params.id,
        validGround,
        String(gazetteNumber || ''),
        String(reason || '')
      );
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/api] Revoke title error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to execute Section 28 statutory revocation.' });
    }
  });

  // MQTT Event Telemetry Routes (Authenticated Read & Write)
  app.get('/api/mqtt', requireAuthenticated, async (_req, res) => {
    try {
      const messages = await listMqttMessages();
      res.json({ messages });
    } catch (err) {
      console.error('[anagu/api] List MQTT error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Failed to fetch MQTT events.' });
    }
  });

  app.post('/api/mqtt', requireAuthenticated, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'mqtt-create', 60, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many telemetry events submitted. Please wait a moment.' });
      }
      const message = req.body?.message as MqttMessage | undefined;
      if (
        !message ||
        typeof message.id !== 'string' ||
        !message.id.trim() ||
        !ALLOWED_MQTT_TOPICS.has(message.topic)
      ) {
        return res.status(400).json({ error: 'Invalid MQTT event payload.' });
      }
      const authActor = (
        req as express.Request & { authActor?: { sub: string; isAdmin: boolean; role?: AccessRoleId } }
      ).authActor;
      if (ADMIN_ONLY_MQTT_TOPICS.has(message.topic) && !authActor?.isAdmin) {
        return res.status(403).json({ error: 'Restricted MQTT audit topic requires admin authorization.' });
      }
      const serializedPayload = JSON.stringify(message.payload ?? {});
      if (serializedPayload.length > 8192) {
        return res.status(400).json({ error: 'MQTT payload exceeds maximum size.' });
      }
      const sanitized: MqttMessage = {
        id: message.id.trim().slice(0, 80),
        topic: message.topic,
        payload:
          message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
            ? message.payload
            : {},
        qos: message.qos === 2 ? 2 : 1,
        timestamp:
          typeof message.timestamp === 'string' && message.timestamp.trim()
            ? message.timestamp.trim().slice(0, 40)
            : new Date().toLocaleTimeString(),
        deliveryLatencyMs:
          typeof message.deliveryLatencyMs === 'number' && Number.isFinite(message.deliveryLatencyMs)
            ? Math.max(1, Math.min(5000, Math.round(message.deliveryLatencyMs)))
            : 40,
        status: 'delivered'
      };
      const saved = await createMqttMessage(sanitized);
      return res.status(201).json({ message: saved });
    } catch (err) {
      console.error('[anagu/api] Create MQTT error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to log MQTT event.' });
    }
  });

  // Landing Page Contact Inquiries & Web3 Purchase Telemetry (Public Write with Strict Validation + Rate Limiting)
  app.post('/api/inquiries', async (req, res) => {
    try {
      if (!checkRateLimit(req, 'inquiry-create', 15, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many inquiries submitted. Please wait before submitting again.' });
      }
      const { name, phone, email, state, message } = req.body ?? {};
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
      const cleanEmail = typeof email === 'string' ? email.trim() : '';
      if (
        cleanName.length < 2 ||
        cleanName.length > 160 ||
        !PHONE_PATTERN.test(cleanPhone) ||
        (cleanEmail.length > 0 && (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 180))
      ) {
        return res.status(400).json({ error: 'Valid full name, phone number, and optional email are required.' });
      }
      const saved = await createInquiry({
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail ? cleanEmail.slice(0, 180) : undefined,
        state:
          typeof state === 'string' && state.trim()
            ? state.trim().slice(0, 100)
            : 'Federal Capital Territory (Abuja)',
        message: typeof message === 'string' && message.trim() ? message.trim().slice(0, 4000) : undefined
      });
      return res.status(201).json({ inquiry: saved });
    } catch (err) {
      console.error('[anagu/api] Create inquiry error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to submit inquiry.' });
    }
  });

  // ============================================================================
  // SEPARATE ADMIN PORTAL ROUTES (/api/admin/*)
  // ============================================================================
  app.post('/api/admin/auth/signup', async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-signup', 10, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrator registration attempts. Please wait.' });
      }

      const bearerToken = extractBearerToken(req);
      const authorizedByAdmin = bearerToken ? Boolean(verifyAdminToken(bearerToken)) : false;
      const authorizedByInvite = verifyAdminInviteCode(req.body?.inviteCode);

      if (!authorizedByAdmin && !authorizedByInvite) {
        return res.status(403).json({
          error:
            'Administrator registration is restricted. An existing authorized administrator session or valid invitation code is required.'
        });
      }

      const { fullName, email, phone, department, state, password } = req.body ?? {};
      if (
        typeof fullName !== 'string' ||
        typeof email !== 'string' ||
        typeof phone !== 'string' ||
        typeof password !== 'string' ||
        !fullName.trim() ||
        fullName.trim().length > 160 ||
        !EMAIL_PATTERN.test(email.trim()) ||
        email.trim().length > 180 ||
        !PHONE_PATTERN.test(phone.trim()) ||
        password.length < 8 ||
        password.length > 256
      ) {
        return res
          .status(400)
          .json({ error: 'Valid full name, email, phone, and password (8–256 chars) are required.' });
      }
      const result = await signupAdmin({
        fullName,
        email,
        phone,
        department:
          typeof department === 'string' && department.trim()
            ? department.trim().slice(0, 160)
            : 'Land Registry Administration',
        state:
          typeof state === 'string' && state.trim()
            ? state.trim().slice(0, 100)
            : 'Federal Capital Territory (Abuja)',
        password
      });
      if (result.error || !result.admin) {
        return res.status(409).json({ error: result.error || 'Could not create admin account.' });
      }
      const token = signAdminToken(result.admin);
      return res.status(201).json({ admin: result.admin, token });
    } catch (err) {
      console.error('[anagu/admin] Signup error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to create admin account right now.' });
    }
  });

  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-login', 15, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many admin sign-in attempts. Please wait a few minutes.' });
      }
      const { email, password } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !EMAIL_PATTERN.test(email.trim()) ||
        !password ||
        password.length > 256
      ) {
        return res.status(400).json({ error: 'Valid email and password are required.' });
      }
      const result = await loginAdmin(email, password);
      if (result.error || !result.admin) {
        return res.status(401).json({ error: result.error || 'Invalid admin credentials.' });
      }
      const token = signAdminToken(result.admin);
      return res.json({ admin: result.admin, token });
    } catch (err) {
      console.error('[anagu/admin] Login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to sign in right now.' });
    }
  });

  app.get('/api/admin/auth/me', requireAdminAuth, async (req, res) => {
    try {
      const session = (req as express.Request & { adminSession?: { email: string } }).adminSession;
      const admins = await listAdmins();
      const admin = admins.find((a) => a.email.toLowerCase() === session?.email.toLowerCase());
      if (!admin) {
        return res.status(401).json({ error: 'Admin session expired.' });
      }
      return res.json({ admin });
    } catch (err) {
      console.error('[anagu/admin] Session check error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to verify admin session.' });
    }
  });

  app.get('/api/admin/overview', requireAdminAuth, async (_req, res) => {
    try {
      const [parcels, users, inquiries, mqttMessages, admins] = await Promise.all([
        listParcels(),
        listUsers(),
        listInquiries(),
        listMqttMessages(),
        listAdmins()
      ]);
      return res.json({
        parcels,
        users,
        inquiries,
        mqttMessages,
        admins,
        serverTime: new Date().toISOString()
      });
    } catch (err) {
      console.error('[anagu/admin] Overview error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to fetch admin monitoring overview.' });
    }
  });

  app.patch('/api/admin/parcels/:id/verify', requireAdminAuth, async (req, res) => {
    try {
      const parcels = await listParcels();
      const target = parcels.find((p) => p.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      const tokenId = target.tokenId ?? Math.floor(4300 + Math.random() * 5000);
      const txHash =
        target.txHash ||
        '0x' + crypto.randomBytes(32).toString('hex');
      const blockNumber = target.blockNumber ?? Math.floor(1892100 + Math.random() * 1000);
      const issuanceTimestamp = target.issuanceTimestamp || new Date().toISOString();

      const updated = await mintParcelTitle(
        target.id,
        tokenId,
        txHash,
        blockNumber,
        issuanceTimestamp
      );
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }

      const session = (req as express.Request & { adminSession?: { email: string } }).adminSession;
      await createMqttMessage({
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic: 'land/title/issued',
        payload: {
          parcelId: updated.id,
          cadastralRef: updated.cadastralRef,
          tokenId,
          verifiedByAdmin: session?.email || 'admin',
          publishedToAccessLands: true
        },
        qos: 1,
        timestamp: new Date().toLocaleTimeString(),
        deliveryLatencyMs: 38,
        status: 'delivered'
      });

      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/admin] Verify parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to verify and publish parcel.' });
    }
  });

  app.patch('/api/admin/parcels/:id/reject', requireAdminAuth, async (req, res) => {
    try {
      const updated = await adminSetParcelStatus(req.params.id, 'rejected');
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      const session = (req as express.Request & { adminSession?: { email: string } }).adminSession;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      await createMqttMessage({
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic: 'land/registration/status',
        payload: {
          parcelId: updated.id,
          cadastralRef: updated.cadastralRef,
          status: 'rejected',
          rejectedByAdmin: session?.email || 'admin',
          reason: reason || 'Rejected during admin registry review'
        },
        qos: 1,
        timestamp: new Date().toLocaleTimeString(),
        deliveryLatencyMs: 41,
        status: 'delivered'
      });
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/admin] Reject parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to reject parcel.' });
    }
  });

  app.patch('/api/admin/parcels/:id/pending', requireAdminAuth, async (req, res) => {
    try {
      const updated = await adminSetParcelStatus(req.params.id, 'draft');
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/admin] Set pending error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to move parcel to pending verification.' });
    }
  });

  app.patch('/api/admin/parcels/:id/revoke', requireAdminAuth, async (req, res) => {
    try {
      const { ground, gazetteNumber, reason } = req.body ?? {};
      const validGround: RevocationGround =
        ground === 'BreachOfStatutoryCondition' ? 'BreachOfStatutoryCondition' : 'OverridingPublicInterest';
      const updated = await revokeParcelTitle(
        req.params.id,
        validGround,
        String(gazetteNumber || 'Federal Gazette Admin Notice'),
        String(reason || 'Statutory administrative revocation order')
      );
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      await createMqttMessage({
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic: 'land/title/revoked',
        payload: {
          parcelId: updated.id,
          cadastralRef: updated.cadastralRef,
          ground: validGround
        },
        qos: 2,
        timestamp: new Date().toLocaleTimeString(),
        deliveryLatencyMs: 45,
        status: 'delivered'
      });
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/admin] Revoke parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to revoke parcel title.' });
    }
  });

  app.delete('/api/admin/parcels/:id', requireAdminAuth, async (req, res) => {
    try {
      const deleted = await adminDeleteParcel(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[anagu/admin] Delete parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to delete parcel.' });
    }
  });

  app.patch('/api/admin/users/:id/role', requireAdminAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-write', 120, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrative write requests.' });
      }
      const role = req.body?.role;
      if (role !== 'citizen' && role !== 'surveyor' && role !== 'oracle') {
        return res.status(400).json({ error: 'Invalid role value. Allowed roles: citizen, surveyor, oracle.' });
      }
      const updated = await updateUserRole(req.params.id, role);
      if (!updated) {
        return res.status(404).json({ error: 'User not found.' });
      }
      return res.json({ user: updated });
    } catch (err) {
      console.error('[anagu/admin] Update user role error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to update user role.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAdminAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-write', 120, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrative write requests.' });
      }
      const deleted = await deleteUser(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'User not found.' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[anagu/admin] Delete user error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to remove user.' });
    }
  });

  app.delete('/api/admin/inquiries/:id', requireAdminAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req, 'admin-write', 120, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many administrative write requests.' });
      }
      const deleted = await deleteInquiry(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Inquiry record not found.' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[anagu/admin] Delete inquiry error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to remove inquiry.' });
    }
  });

  // OpenStreetMap Tile & Geocoding Proxy
  const osmTileCache = new Map<string, Buffer>();
  const geocodeCache = new Map<string, { lat: number; lng: number; displayName: string }>();
  const geocodeSearchCache = new Map<
    string,
    Array<{ lat: number; lng: number; displayName: string; name: string; type: string }>
  >();

  app.get('/api/osm-tile/:z/:x/:y', async (req, res) => {
    try {
      const rawY = req.params.y.replace(/\.png$/i, '');
      if (
        !/^\d+$/.test(req.params.z) ||
        !/^\d+$/.test(req.params.x) ||
        !/^\d+$/.test(rawY)
      ) {
        return res.status(400).send('Invalid tile coordinates');
      }
      const z = Number.parseInt(req.params.z, 10);
      const x = Number.parseInt(req.params.x, 10);
      const y = Number.parseInt(rawY, 10);
      if (
        !Number.isInteger(z) ||
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        z < 0 ||
        z > 19 ||
        x < 0 ||
        y < 0 ||
        x >= Math.pow(2, z) ||
        y >= Math.pow(2, z)
      ) {
        return res.status(400).send('Invalid tile coordinates');
      }

      const key = `${z}/${x}/${y}`;
      const cached = osmTileCache.get(key);
      if (cached) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(cached);
      }

      const mirrors = [
        `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
        `https://b.tile.openstreetmap.org/${z}/${x}/${y}.png`,
        `https://c.tile.openstreetmap.org/${z}/${x}/${y}.png`
      ];
      const startIdx = (x + y) % mirrors.length;
      let buf: Buffer | null = null;
      let lastStatus = 502;

      for (let attempt = 0; attempt < mirrors.length; attempt++) {
        const mirrorUrl = mirrors[(startIdx + attempt) % mirrors.length];
        try {
          const upstream = await fetch(mirrorUrl, {
            headers: {
              'User-Agent': 'AnaguLandAdministration/1.0 (+https://anagu.ng)'
            },
            signal: AbortSignal.timeout(5500)
          });
          lastStatus = upstream.status;
          if (upstream.ok) {
            const arrayBuf = await upstream.arrayBuffer();
            buf = Buffer.from(arrayBuf);
            break;
          }
        } catch {
          // Try next OSM mirror
        }
      }

      if (!buf) {
        return res.status(lastStatus).send('Upstream OSM tile unavailable');
      }

      if (osmTileCache.size > 2500) {
        const firstKey = osmTileCache.keys().next().value;
        if (firstKey) osmTileCache.delete(firstKey);
      }
      osmTileCache.set(key, buf);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    } catch (err) {
      console.warn('[anagu/osm] Tile proxy error:', err instanceof Error ? err.message : err);
      return res.status(502).send('Failed to fetch OpenStreetMap tile');
    }
  });

  type GeocodeItem = { lat: number; lng: number; displayName: string; name: string; type: string };

  async function searchOsmLandmarksUpstream(q: string, limit: number): Promise<GeocodeItem[]> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&countrycodes=ng&addressdetails=1`;
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'AnaguLandAdministration/1.0 (+https://anagu.ng)',
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(4500)
      });
      if (upstream.ok) {
        const raw = (await upstream.json()) as Array<{
          lat?: string;
          lon?: string;
          display_name?: string;
          name?: string;
          type?: string;
          addresstype?: string;
        }>;
        const parsed = (Array.isArray(raw) ? raw : [])
          .map((item) => {
            const lat = Number.parseFloat(item.lat || '');
            const lng = Number.parseFloat(item.lon || '');
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const displayName = item.display_name || q;
            return {
              lat,
              lng,
              displayName,
              name: item.name || displayName.split(',')[0].trim(),
              type: item.addresstype || item.type || 'place'
            };
          })
          .filter((r): r is GeocodeItem => r !== null);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to Photon OSM geocoder
    }

    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`;
      const upstream = await fetch(photonUrl, {
        headers: {
          'User-Agent': 'AnaguLandAdministration/1.0 (+https://anagu.ng)',
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(4500)
      });
      if (upstream.ok) {
        const data = (await upstream.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: {
              name?: string;
              street?: string;
              district?: string;
              city?: string;
              county?: string;
              state?: string;
              country?: string;
              countrycode?: string;
              osm_value?: string;
              type?: string;
            };
          }>;
        };
        const features = Array.isArray(data.features) ? data.features : [];
        const ngFeatures = features.filter(
          (f) => !f.properties?.countrycode || f.properties.countrycode.toUpperCase() === 'NG'
        );
        const list = ngFeatures.length > 0 ? ngFeatures : features;
        return list
          .map((f) => {
            const coords = f.geometry?.coordinates;
            if (!coords || coords.length < 2) return null;
            const [lng, lat] = coords;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const p = f.properties || {};
            const parts = [p.name, p.street, p.district, p.city || p.county, p.state, p.country].filter(
              (v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx
            );
            const displayName = parts.join(', ') || q;
            return {
              lat,
              lng,
              displayName,
              name: p.name || p.street || displayName.split(',')[0].trim(),
              type: p.osm_value || p.type || 'place'
            };
          })
          .filter((r): r is GeocodeItem => r !== null);
      }
    } catch {
      // Both failed
    }

    return [];
  }

  app.get('/api/geocode-search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }
      const cacheKey = q.toLowerCase();
      const cached = geocodeSearchCache.get(cacheKey);
      if (cached) {
        return res.json({ results: cached });
      }

      const results = await searchOsmLandmarksUpstream(q, 5);
      if (results.length > 0) {
        if (geocodeSearchCache.size > 300) {
          const firstKey = geocodeSearchCache.keys().next().value;
          if (firstKey) geocodeSearchCache.delete(firstKey);
        }
        geocodeSearchCache.set(cacheKey, results);
      }
      return res.json({ results });
    } catch (err) {
      console.warn('[anagu/osm] Geocode search error:', err instanceof Error ? err.message : err);
      return res.status(502).json({ error: 'Unable to search landmarks right now.' });
    }
  });

  app.get('/api/geocode', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }
      const cacheKey = q.toLowerCase();
      const cached = geocodeCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const results = await searchOsmLandmarksUpstream(q, 1);
      if (results.length === 0) {
        return res.status(404).json({ error: 'Location not found.' });
      }
      const payload = {
        lat: results[0].lat,
        lng: results[0].lng,
        displayName: results[0].displayName
      };
      if (geocodeCache.size > 300) {
        const firstKey = geocodeCache.keys().next().value;
        if (firstKey) geocodeCache.delete(firstKey);
      }
      geocodeCache.set(cacheKey, payload);
      return res.json(payload);
    } catch (err) {
      console.warn('[anagu/osm] Geocode error:', err instanceof Error ? err.message : err);
      return res.status(502).json({ error: 'Unable to geocode location right now.' });
    }
  });
}
