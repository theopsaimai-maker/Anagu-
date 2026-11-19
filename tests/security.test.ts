import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

// Isolate tests completely from live Supabase/PostgreSQL databases
process.env.NODE_ENV = 'test';
process.env.ANAGU_STORAGE_MODE = 'memory';
process.env.AUTH_TOKEN_SECRET = 'anagu-test-signing-secret-0123456789abcdef-secure';
process.env.ADMIN_INVITE_SECRET = 'anagu-test-admin-invite-code-987654321';
process.env.ALLOWED_ORIGINS = 'https://anagu.ng,https://admin.anagu.ng';
process.env.ALLOW_DEMO_ACCOUNTS = 'false';

import {
  getSigningSecret,
  resetSigningSecretCache,
  signAdminToken,
  signUserToken
} from '../server/auth.ts';
import { attachApiRoutes, resetRateLimitsForTests } from '../server/createApiApp.ts';
import { resetMemoryStoreForTests } from '../server/db.ts';

let server: Server;
let baseUrl = '';

async function apiFetch(
  route: string,
  init: RequestInit & { token?: string; origin?: string } = {}
): Promise<{ status: number; headers: Headers; body: Record<string, any> }> {
  const { token, origin, headers: extraHeaders, ...rest } = init;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string> | undefined)
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;

  const res = await fetch(`${baseUrl}${route}`, {
    ...rest,
    headers
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, headers: res.headers, body };
}

before(async () => {
  resetMemoryStoreForTests();
  resetRateLimitsForTests();
  const app = express();
  attachApiRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

beforeEach(() => {
  resetRateLimitsForTests();
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('ANAGU Phase 1 Security & Authentication Hardening', () => {
  it('1. Public users cannot create administrator accounts without admin auth or valid invite code', async () => {
    const publicAttempt = await apiFetch('/api/admin/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Unauthorized Actor',
        email: 'unauth.admin@example.ng',
        phone: '+234 803 000 0001',
        department: 'Registry',
        state: 'Lagos State',
        password: 'StrongPassword123!'
      })
    });
    assert.equal(publicAttempt.status, 403);

    const wrongInviteAttempt = await apiFetch('/api/admin/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Bad Invite Actor',
        email: 'badinvite@example.ng',
        phone: '+234 803 000 0002',
        department: 'Registry',
        state: 'Lagos State',
        password: 'StrongPassword123!',
        inviteCode: 'wrong-invite-code'
      })
    });
    assert.equal(wrongInviteAttempt.status, 403);

    // Authorized invite code succeeds
    const authorizedAdmin = await apiFetch('/api/admin/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Chief Registrar Alpha',
        email: 'chief.alpha@anagu.ng',
        phone: '+234 800 262 4800',
        department: 'Federal Land Registry',
        state: 'Federal Capital Territory (Abuja)',
        password: 'StrongAdminPassword123!',
        inviteCode: process.env.ADMIN_INVITE_SECRET
      })
    });
    assert.equal(authorizedAdmin.status, 201);
    assert.ok(authorizedAdmin.body.token);
    assert.equal(authorizedAdmin.body.admin.email, 'chief.alpha@anagu.ng');
  });

  it('2. Citizens cannot assign themselves surveyor privileges during public registration', async () => {
    const escalated = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Self Escalating Surveyor',
        email: 'fake.surveyor@example.ng',
        phone: '+234 803 111 2222',
        role: 'surveyor',
        state: 'Lagos State',
        credentialId: 'SURCON-FAKE-01',
        password: 'Password123!'
      })
    });
    assert.equal(escalated.status, 403);

    const normalSignup = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Standard Citizen',
        email: 'citizen.one@example.ng',
        phone: '+234 803 111 2223',
        state: 'Lagos State',
        credentialId: 'NIN-1111-2222-3333',
        password: 'Password123!'
      })
    });
    assert.equal(normalSignup.status, 201);
    assert.equal(normalSignup.body.user.role, 'citizen');
  });

  it('3. Citizens cannot assign themselves oracle (or admin) privileges during public registration', async () => {
    const oracleAttempt = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Self Escalating Oracle',
        email: 'fake.oracle@example.ng',
        phone: '+234 803 111 2224',
        role: 'oracle',
        state: 'Enugu State',
        credentialId: 'ELDER-FAKE-01',
        password: 'Password123!'
      })
    });
    assert.equal(oracleAttempt.status, 403);

    const adminRoleAttempt = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Self Escalating Admin',
        email: 'fake.adminrole@example.ng',
        phone: '+234 803 111 2225',
        role: 'admin',
        state: 'Enugu State',
        credentialId: 'ADMIN-FAKE-01',
        password: 'Password123!'
      })
    });
    assert.equal(adminRoleAttempt.status, 403);
  });

  it('4. Unauthenticated users cannot access protected administrative endpoints', async () => {
    const overview = await apiFetch('/api/admin/overview');
    assert.equal(overview.status, 401);

    const me = await apiFetch('/api/admin/auth/me');
    assert.equal(me.status, 401);

    const roleUpdate = await apiFetch('/api/admin/users/some-user/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'surveyor' })
    });
    assert.equal(roleUpdate.status, 401);

    const verifyParcel = await apiFetch('/api/admin/parcels/PAR-2026-0891/verify', {
      method: 'PATCH',
      body: JSON.stringify({})
    });
    assert.equal(verifyParcel.status, 401);

    const deleteParcel = await apiFetch('/api/admin/parcels/PAR-2026-0891', {
      method: 'DELETE'
    });
    assert.equal(deleteParcel.status, 401);
  });

  it('5. Expired tokens are rejected for both users and administrators', async () => {
    const expiredAdminToken = signAdminToken(
      {
        id: 'adm-expired',
        fullName: 'Expired Admin',
        email: 'expired.admin@anagu.ng',
        phone: '+234 800 000 0000',
        department: 'Registry',
        state: 'Lagos State',
        createdAt: '2026-01-01'
      },
      -5000
    );
    const adminRes = await apiFetch('/api/admin/overview', { token: expiredAdminToken });
    assert.equal(adminRes.status, 401);

    const expiredUserToken = signUserToken(
      { id: 'usr-expired', email: 'expired@example.ng', role: 'surveyor' },
      -5000
    );
    const userRes = await apiFetch('/api/parcels/PAR-2026-0891/spatial', {
      method: 'PATCH',
      token: expiredUserToken,
      body: JSON.stringify({})
    });
    assert.equal(userRes.status, 401);
  });

  it('6. Invalid and tampered tokens are rejected', async () => {
    const malformed = await apiFetch('/api/admin/overview', { token: 'not-a-valid-token' });
    assert.equal(malformed.status, 401);

    const validAdminToken = signAdminToken({
      id: 'adm-tamper',
      fullName: 'Valid Admin',
      email: 'valid.admin@anagu.ng',
      phone: '+234 800 000 0001',
      department: 'Registry',
      state: 'Lagos State',
      createdAt: '2026-01-01'
    });
    const tampered = `${validAdminToken.slice(0, -4)}AAAA`;
    const tamperedRes = await apiFetch('/api/admin/overview', { token: tampered });
    assert.equal(tamperedRes.status, 401);

    const validUserToken = signUserToken({
      id: 'usr-regular',
      email: 'regular@example.ng',
      role: 'citizen'
    });
    const userOnAdminRes = await apiFetch('/api/admin/overview', { token: validUserToken });
    assert.equal(userOnAdminRes.status, 403);
  });

  it('7. Only authorised administrators can approve user roles (and approved roles take effect server-side)', async () => {
    // Sign up a citizen
    const citizenSignup = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Applicant Surveyor',
        email: 'applicant.surveyor@example.ng',
        phone: '+234 803 222 3333',
        state: 'Federal Capital Territory (Abuja)',
        credentialId: 'SURCON-PENDING-99',
        password: 'Password123!'
      })
    });
    assert.equal(citizenSignup.status, 201);
    const userId = citizenSignup.body.user.id as string;
    const citizenToken = citizenSignup.body.token as string;

    // Citizen cannot promote themselves
    const selfPromote = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({ role: 'surveyor' })
    });
    assert.equal(selfPromote.status, 403);

    // Citizen cannot execute surveyor spatial clearance before approval
    const preApprovalSpatial = await apiFetch('/api/parcels/PAR-2026-0891/spatial', {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({})
    });
    assert.equal(preApprovalSpatial.status, 403);

    // Sign in as authorized admin created in test 1
    const adminLogin = await apiFetch('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'chief.alpha@anagu.ng',
        password: 'StrongAdminPassword123!'
      })
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.token as string;

    // Authorized admin approves surveyor role
    const approveRes = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ role: 'surveyor' })
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.user.role, 'surveyor');

    // Now the user's backend-verified role permits spatial verification
    const postApprovalSpatial = await apiFetch('/api/parcels/PAR-2026-0891/spatial', {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({})
    });
    assert.equal(postApprovalSpatial.status, 200);
    assert.equal(postApprovalSpatial.body.parcel.status, 'spatial_verified');
  });

  it('8. CORS rejects untrusted origins and allows explicitly trusted origins', async () => {
    const evilGet = await apiFetch('/api/parcels', {
      method: 'GET',
      origin: 'https://evil-attacker.example'
    });
    assert.equal(evilGet.status, 403);
    assert.equal(evilGet.headers.get('access-control-allow-origin'), null);

    const evilPreflight = await apiFetch('/api/auth/login', {
      method: 'OPTIONS',
      origin: 'https://evil-attacker.example'
    });
    assert.equal(evilPreflight.status, 403);
    assert.equal(evilPreflight.headers.get('access-control-allow-origin'), null);

    const trustedGet = await apiFetch('/api/parcels', {
      method: 'GET',
      origin: 'https://anagu.ng'
    });
    assert.equal(trustedGet.status, 200);
    assert.equal(trustedGet.headers.get('access-control-allow-origin'), 'https://anagu.ng');
  });

  it('9. Sensitive write endpoints enforce authentication and role requirements', async () => {
    // Unauthenticated parcel creation rejected
    const unauthParcel = await apiFetch('/api/parcels', {
      method: 'POST',
      body: JSON.stringify({
        parcel: {
          id: 'PAR-UNAUTH-01',
          cadastralRef: 'FCT/TEST/001',
          applicantName: 'Unauth User',
          applicantNin: 'NIN-000',
          state: 'Lagos State',
          lga: 'Ikeja',
          district: 'Alausa',
          areaSqm: 500,
          perimeterM: 90,
          coordinates: [],
          beacons: [],
          spatialHash: '',
          documentHash: '',
          surveyPlanRef: 'SP-01',
          intendedUse: 'Residential',
          status: 'registered'
        }
      })
    });
    assert.equal(unauthParcel.status, 401);

    // Unauthenticated MQTT event creation rejected
    const unauthMqtt = await apiFetch('/api/mqtt', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          id: 'msg-unauth-1',
          topic: 'land/registration/status',
          payload: { test: true },
          qos: 1
        }
      })
    });
    assert.equal(unauthMqtt.status, 401);

    // Demo login disabled when ALLOW_DEMO_ACCOUNTS is false
    const demoDisabled = await apiFetch('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ role: 'surveyor' })
    });
    assert.equal(demoDisabled.status, 403);

    // Authenticated citizen CAN create a draft parcel, but status is forced to draft
    const citizenLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'citizen.one@example.ng',
        password: 'Password123!'
      })
    });
    assert.equal(citizenLogin.status, 200);
    const citizenToken = citizenLogin.body.token as string;

    const authParcel = await apiFetch('/api/parcels', {
      method: 'POST',
      token: citizenToken,
      body: JSON.stringify({
        parcel: {
          id: 'PAR-AUTH-01',
          cadastralRef: 'FCT/TEST/002',
          applicantName: 'Standard Citizen',
          applicantNin: 'NIN-1111-2222-3333',
          state: 'Lagos State',
          lga: 'Ikeja',
          district: 'Alausa',
          areaSqm: 600,
          perimeterM: 100,
          coordinates: [[6.6, 3.35]],
          beacons: [],
          spatialHash: '0xabc',
          documentHash: '0xdef',
          surveyPlanRef: 'SP-02',
          intendedUse: 'Residential',
          status: 'registered'
        }
      })
    });
    assert.equal(authParcel.status, 201);
    assert.equal(authParcel.body.parcel.status, 'draft');

    // Citizen cannot publish admin-only MQTT topics
    const restrictedMqtt = await apiFetch('/api/mqtt', {
      method: 'POST',
      token: citizenToken,
      body: JSON.stringify({
        message: {
          id: 'msg-citizen-admin-topic',
          topic: 'land/title/issued',
          payload: { parcelId: 'PAR-AUTH-01' },
          qos: 2
        }
      })
    });
    assert.equal(restrictedMqtt.status, 403);

    // Citizen cannot mint or revoke titles
    const mintAttempt = await apiFetch('/api/parcels/PAR-AUTH-01/mint', {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({ tokenId: 9999, txHash: '0x1234' })
    });
    assert.equal(mintAttempt.status, 403);
  });

  it('10. Passwords are never stored in plaintext in localStorage and no default passwords are exposed in frontend', () => {
    const frontendFiles = [
      'src/App.tsx',
      'src/components/screens/ScreenAuth.tsx',
      'src/admin/AdminApp.tsx',
      'src/lib/api.ts',
      'src/lib/adminApi.ts'
    ];

    for (const relPath of frontendFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
      // Verify no hardcoded demo passwords appear in frontend source
      assert.doesNotMatch(content, /anagu-admin|anagu-citizen|anagu-surveyor|anagu-oracle/i, `${relPath} must not contain default passwords`);
      // Verify no plaintext password persistence in localStorage
      assert.doesNotMatch(
        content,
        /localStorage\.setItem\([^)]*USERS_STORAGE_KEY/,
        `${relPath} must not write user accounts to localStorage`
      );
      assert.doesNotMatch(
        content,
        /interface\s+StoredAuthAccount/,
        `${relPath} must not define StoredAuthAccount with plaintext password`
      );
      // Verify SUPABASE_SECRET_KEY / SERVICE_ROLE_KEY are never referenced in frontend
      assert.doesNotMatch(
        content,
        /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|AUTH_TOKEN_SECRET|ADMIN_TOKEN_SECRET/,
        `${relPath} must not reference backend secrets`
      );
    }

    // Verify App.tsx actively scrubs legacy anagu_users_v1 on startup
    const appContent = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.match(appContent, /localStorage\.removeItem\(LEGACY_USERS_STORAGE_KEY\)/);
  });

  it('11. Production auth fails safely when signing secret is missing and never falls back to SUPABASE_SECRET_KEY', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAuthSecret = process.env.AUTH_TOKEN_SECRET;
    const prevAdminSecret = process.env.ADMIN_TOKEN_SECRET;
    const prevSupaSecret = process.env.SUPABASE_SECRET_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.AUTH_TOKEN_SECRET;
      delete process.env.ADMIN_TOKEN_SECRET;
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_should_never_be_used_for_hmac_signing_123456';
      resetSigningSecretCache();

      assert.throws(
        () => getSigningSecret(),
        /AUTH_TOKEN_SECRET \(or ADMIN_TOKEN_SECRET\) must be set/
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      process.env.AUTH_TOKEN_SECRET = prevAuthSecret;
      process.env.ADMIN_TOKEN_SECRET = prevAdminSecret;
      if (prevSupaSecret === undefined) {
        delete process.env.SUPABASE_SECRET_KEY;
      } else {
        process.env.SUPABASE_SECRET_KEY = prevSupaSecret;
      }
      resetSigningSecretCache();
    }
  });
});
