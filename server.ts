import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccessRoleId, MqttMessage, ParcelRecord, RevocationGround } from './src/types/anagu.ts';
import {
  createInquiry,
  createMqttMessage,
  createParcel,
  getDatabaseHealth,
  listMqttMessages,
  listParcels,
  loginDemoRole,
  loginUser,
  mintParcelTitle,
  recordOracleAttestation,
  revokeParcelTitle,
  signupUser,
  updateParcelSpatial
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

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

  // Frontend Serving (Vite dev middlewares in development, dist/ static files in production)
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
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
