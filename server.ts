import 'dotenv/config';
import crypto from 'node:crypto';
import dns from 'node:dns';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dns.setDefaultResultOrder('ipv4first');
import type {
  AccessRoleId,
  AdminUser,
  MqttMessage,
  ParcelRecord,
  RevocationGround
} from './src/types/anagu.ts';
import {
  adminDeleteParcel,
  adminSetParcelStatus,
  createInquiry,
  createMqttMessage,
  createParcel,
  deleteInquiry,
  deleteUser,
  getDatabaseHealth,
  listAdmins,
  listInquiries,
  listMqttMessages,
  listParcels,
  listUsers,
  loginAdmin,
  loginDemoRole,
  loginUser,
  mintParcelTitle,
  recordOracleAttestation,
  revokeParcelTitle,
  signupAdmin,
  signupUser,
  updateParcelSpatial,
  updateUserRole
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.DATABASE_URL ||
  'anagu-admin-local-hmac-key-2026';

function signAdminToken(admin: AdminUser): string {
  const payload = {
    sub: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    department: admin.department,
    state: admin.state,
    exp: Date.now() + 24 * 60 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminToken(token: string): { sub: string; email: string; fullName: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_TOKEN_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      fullName?: string;
      exp?: number;
    };
    if (!payload.sub || !payload.email || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return { sub: payload.sub, email: payload.email, fullName: payload.fullName || payload.email };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

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
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      const result = await loginUser(email, password);
      if (result.error || !result.user) {
        return res.status(401).json({ error: result.error || 'Authentication failed.' });
      }
      return res.json({ user: result.user });
    } catch (err) {
      console.error('[anagu/api] Login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to sign in right now.' });
    }
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { fullName, email, phone, role, state, credentialId, password } = req.body ?? {};
      if (
        typeof fullName !== 'string' ||
        typeof email !== 'string' ||
        typeof phone !== 'string' ||
        typeof credentialId !== 'string' ||
        typeof password !== 'string' ||
        !fullName.trim() ||
        !email.trim() ||
        !phone.trim() ||
        !credentialId.trim() ||
        password.length < 6
      ) {
        return res.status(400).json({ error: 'All required statutory registration fields and a valid password are required.' });
      }
      const validRole: AccessRoleId = role === 'surveyor' || role === 'oracle' ? role : 'citizen';
      const result = await signupUser({
        fullName,
        email,
        phone,
        role: validRole,
        state: typeof state === 'string' && state.trim() ? state.trim() : 'Federal Capital Territory (Abuja)',
        credentialId,
        password
      });
      if (result.error || !result.user) {
        return res.status(409).json({ error: result.error || 'Could not create account.' });
      }
      return res.status(201).json({ user: result.user });
    } catch (err) {
      console.error('[anagu/api] Signup error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/demo', async (req, res) => {
    try {
      const roleParam = req.body?.role;
      const validRole: AccessRoleId = roleParam === 'surveyor' || roleParam === 'oracle' ? roleParam : 'citizen';
      const user = await loginDemoRole(validRole);
      return res.json({ user });
    } catch (err) {
      console.error('[anagu/api] Demo login error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Unable to sign in with sample profile.' });
    }
  });

  // Parcel Registry Routes
  app.get('/api/parcels', async (_req, res) => {
    try {
      const parcels = await listParcels();
      res.json({ parcels });
    } catch (err) {
      console.error('[anagu/api] List parcels error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Failed to load parcel records.' });
    }
  });

  app.post('/api/parcels', async (req, res) => {
    try {
      const parcel = req.body?.parcel as ParcelRecord | undefined;
      const userId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
      if (!parcel || !parcel.id || !parcel.cadastralRef || !parcel.applicantName) {
        return res.status(400).json({ error: 'Invalid parcel payload.' });
      }
      const created = await createParcel(parcel, userId);
      return res.status(201).json({ parcel: created });
    } catch (err) {
      console.error('[anagu/api] Create parcel error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to persist land parcel application.' });
    }
  });

  app.patch('/api/parcels/:id/spatial', async (req, res) => {
    try {
      const updated = await updateParcelSpatial(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: 'Parcel not found.' });
      }
      return res.json({ parcel: updated });
    } catch (err) {
      console.error('[anagu/api] Spatial approval error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to update spatial verification status.' });
    }
  });

  app.patch('/api/parcels/:id/oracle', async (req, res) => {
    try {
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

  app.patch('/api/parcels/:id/mint', async (req, res) => {
    try {
      const { tokenId, txHash, blockNumber, issuanceTimestamp } = req.body ?? {};
      if (typeof tokenId !== 'number' || typeof txHash !== 'string') {
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

  app.patch('/api/parcels/:id/revoke', async (req, res) => {
    try {
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

  // MQTT Event Telemetry Routes
  app.get('/api/mqtt', async (_req, res) => {
    try {
      const messages = await listMqttMessages();
      res.json({ messages });
    } catch (err) {
      console.error('[anagu/api] List MQTT error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Failed to fetch MQTT events.' });
    }
  });

  app.post('/api/mqtt', async (req, res) => {
    try {
      const message = req.body?.message as MqttMessage | undefined;
      if (!message || !message.id || !message.topic) {
        return res.status(400).json({ error: 'Invalid MQTT event payload.' });
      }
      const saved = await createMqttMessage(message);
      return res.status(201).json({ message: saved });
    } catch (err) {
      console.error('[anagu/api] Create MQTT error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to log MQTT event.' });
    }
  });

  // Landing Page Contact Inquiries
  app.post('/api/inquiries', async (req, res) => {
    try {
      const { name, phone, email, state, message } = req.body ?? {};
      if (typeof name !== 'string' || typeof phone !== 'string' || !name.trim() || !phone.trim()) {
        return res.status(400).json({ error: 'Full name and phone number are required.' });
      }
      const saved = await createInquiry({
        name: name.trim(),
        phone: phone.trim(),
        email: typeof email === 'string' && email.trim() ? email.trim() : undefined,
        state: typeof state === 'string' && state.trim() ? state.trim() : 'Federal Capital Territory (Abuja)',
        message: typeof message === 'string' && message.trim() ? message.trim() : undefined
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
  const requireAdminAuth: express.RequestHandler = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const decoded = token ? verifyAdminToken(token) : null;
    if (!decoded) {
      return res.status(401).json({ error: 'Admin authentication required. Please sign in.' });
    }
    (req as express.Request & { adminSession?: typeof decoded }).adminSession = decoded;
    return next();
  };

  app.post('/api/admin/auth/signup', async (req, res) => {
    try {
      const { fullName, email, phone, department, state, password } = req.body ?? {};
      if (
        typeof fullName !== 'string' ||
        typeof email !== 'string' ||
        typeof phone !== 'string' ||
        typeof password !== 'string' ||
        !fullName.trim() ||
        !email.trim() ||
        !phone.trim() ||
        password.length < 6
      ) {
        return res
          .status(400)
          .json({ error: 'Full name, email, phone, and a password (min 6 chars) are required.' });
      }
      const result = await signupAdmin({
        fullName,
        email,
        phone,
        department:
          typeof department === 'string' && department.trim()
            ? department.trim()
            : 'Land Registry Administration',
        state:
          typeof state === 'string' && state.trim()
            ? state.trim()
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
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
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
      const role = req.body?.role;
      if (role !== 'citizen' && role !== 'surveyor' && role !== 'oracle') {
        return res.status(400).json({ error: 'Invalid role value.' });
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

  // OpenStreetMap Tile & Geocoding Proxy (same-origin for canvas screenshots & Leaflet)
  const osmTileCache = new Map<string, Buffer>();
  const geocodeCache = new Map<string, { lat: number; lng: number; displayName: string }>();
  const geocodeSearchCache = new Map<
    string,
    Array<{ lat: number; lng: number; displayName: string; name: string; type: string }>
  >();

  app.get('/api/osm-tile/:z/:x/:y', async (req, res) => {
    try {
      const z = Number.parseInt(req.params.z, 10);
      const x = Number.parseInt(req.params.x, 10);
      const y = Number.parseInt(req.params.y.replace(/\.png$/i, ''), 10);
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

      const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
        headers: {
          'User-Agent': 'AnaguLandAdministration/1.0 (+https://anagu.ng)'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!upstream.ok) {
        return res.status(upstream.status).send('Upstream OSM tile unavailable');
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (osmTileCache.size > 500) {
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
    // 1. Try OpenStreetMap Nominatim
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

    // 2. Fallback to Photon (OpenStreetMap-powered)
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

  // Frontend Serving (Vite dev middlewares in development, dist/ static files in production)
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    // Route /admin and /admin/* to the separate standalone admin.html entry point
    app.use((req, _res, next) => {
      if (
        req.method === 'GET' &&
        (req.path === '/admin' || req.path === '/admin/' || req.path.startsWith('/admin/'))
      ) {
        req.url = '/admin.html';
      }
      next();
    });

    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {}
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${parsed.search ? '&' + parsed.search.slice(1) : ''}\${parsed.hash || ''}\`;
}
export class ErrorOverlay extends HTMLElement {}
`);
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(['/admin', '/admin/', '/admin/*'], (_req, res) => {
      return res.sendFile(path.join(distDir, 'admin.html'));
    });
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found.' });
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Anagu Land Administration server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Anagu server:', err);
  process.exit(1);
});
