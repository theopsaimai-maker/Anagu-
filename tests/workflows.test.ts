import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

// Strict isolation: never touch live Supabase/PostgreSQL records
process.env.NODE_ENV = 'test';
process.env.ANAGU_STORAGE_MODE = 'memory';
process.env.AUTH_TOKEN_SECRET = 'anagu-workflow-regression-secret-0123456789abcdef';
process.env.ADMIN_INVITE_SECRET = 'anagu-workflow-admin-invite-code-987654';
process.env.ALLOWED_ORIGINS = 'https://anagu.ng,https://admin.anagu.ng';
process.env.ALLOW_DEMO_ACCOUNTS = 'false';

import { signAdminToken, signUserToken } from '../server/auth.ts';
import { attachApiRoutes, resetRateLimitsForTests } from '../server/createApiApp.ts';
import { resetMemoryStoreForTests } from '../server/db.ts';

let server: Server;
let baseUrl = '';

// Shared state across sequential end-to-end lifecycle tests
let adminToken = '';
let citizenId = '';
let citizenToken = '';
let surveyorId = '';
let surveyorToken = '';
let oracleId = '';
let oracleToken = '';
const lifecycleParcelId = 'PAR-REG-2026-001';
const rejectParcelId = 'PAR-REG-2026-002';
let inquiryId = '';

async function apiFetch(
  route: string,
  init: RequestInit & { token?: string } = {}
): Promise<{ status: number; body: Record<string, any> }> {
  const { token, headers: extraHeaders, ...rest } = init;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string> | undefined)
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${route}`, { ...rest, headers });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function buildSampleParcel(id: string, cadastralRef: string, applicantName: string) {
  return {
    id,
    cadastralRef,
    applicantName,
    applicantNin: 'NIN-7744-8822-1199',
    state: 'Federal Capital Territory (Abuja)',
    lga: 'Abuja Municipal (AMAC)',
    district: 'Guzape Diplomatic Sector',
    areaSqm: 1450,
    perimeterM: 156,
    coordinates: [
      [9.0121, 7.5123],
      [9.0125, 7.5128],
      [9.0119, 7.5131]
    ],
    beacons: [
      { id: 'B1', lat: 9.0121, lng: 7.5123, northing: 996100, easting: 336200 }
    ],
    spatialHash: '0x9a8b7c6d5e4f3a2b1c0d',
    documentHash: '0x1f2e3d4c5b6a79887766',
    surveyPlanRef: 'FCT/SURV/2026/8841',
    intendedUse: 'Residential',
    priceUsd: 85000,
    sellerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    status: 'draft'
  };
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

describe('ANAGU Phase 1.1 Application Workflow Regression Suite', () => {
  it('Workflow 1: Citizen registration, login, session verification (/api/auth/me), and admin denial', async () => {
    const signup = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Amina Bello',
        email: 'amina.citizen@anagu.test',
        phone: '+234 803 555 0101',
        state: 'Federal Capital Territory (Abuja)',
        credentialId: 'NIN-7744-8822-1199',
        password: 'CitizenPassword123!'
      })
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.role, 'citizen');
    assert.ok(signup.body.token);
    citizenId = signup.body.user.id;

    // Login with wrong password fails
    const badLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'amina.citizen@anagu.test',
        password: 'WrongPassword!'
      })
    });
    assert.equal(badLogin.status, 401);

    // Login with valid password succeeds
    const login = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'amina.citizen@anagu.test',
        password: 'CitizenPassword123!'
      })
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, 'amina.citizen@anagu.test');
    citizenToken = login.body.token;

    // /api/auth/me verifies active citizen session
    const me = await apiFetch('/api/auth/me', { token: citizenToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, citizenId);
    assert.equal(me.body.user.role, 'citizen');

    // Citizen cannot access admin endpoints
    const adminOverview = await apiFetch('/api/admin/overview', { token: citizenToken });
    assert.equal(adminOverview.status, 403);
  });

  it('Workflow 2: Administrator onboarding (invite code), login, /api/admin/auth/me, overview, and secondary admin creation', async () => {
    const adminSignup = await apiFetch('/api/admin/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Registrar General Ibrahim',
        email: 'registrar.ibrahim@anagu.test',
        phone: '+234 800 262 4800',
        department: 'Federal Land Registry',
        state: 'Federal Capital Territory (Abuja)',
        password: 'AdminPassword123!',
        inviteCode: process.env.ADMIN_INVITE_SECRET
      })
    });
    assert.equal(adminSignup.status, 201);
    assert.ok(adminSignup.body.token);

    const adminLogin = await apiFetch('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'registrar.ibrahim@anagu.test',
        password: 'AdminPassword123!'
      })
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.body.token;

    const adminMe = await apiFetch('/api/admin/auth/me', { token: adminToken });
    assert.equal(adminMe.status, 200);
    assert.equal(adminMe.body.admin.email, 'registrar.ibrahim@anagu.test');

    // Existing admin can also create a second admin operator via Bearer auth (without inviteCode)
    const deputySignup = await apiFetch('/api/admin/auth/signup', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        fullName: 'Deputy Registrar Ngozi',
        email: 'deputy.ngozi@anagu.test',
        phone: '+234 800 262 4801',
        department: 'Cadastral Operations',
        state: 'Lagos State',
        password: 'DeputyPassword123!'
      })
    });
    assert.equal(deputySignup.status, 201);

    const overview = await apiFetch('/api/admin/overview', { token: adminToken });
    assert.equal(overview.status, 200);
    assert.ok(Array.isArray(overview.body.parcels));
    assert.ok(Array.isArray(overview.body.users));
    assert.ok(Array.isArray(overview.body.admins));
    assert.ok(overview.body.admins.length >= 2);
  });

  it('Workflow 3: Surveyor & Oracle onboarding via Admin role approval + Surveyor parcel registration', async () => {
    // Register surveyor & oracle applicants (always start as citizen)
    const survReg = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Surv. Tunde Adeyemi',
        email: 'tunde.surveyor@anagu.test',
        phone: '+234 805 555 0202',
        state: 'Federal Capital Territory (Abuja)',
        credentialId: 'SURCON-NIS-9012',
        password: 'SurveyorPassword123!'
      })
    });
    assert.equal(survReg.status, 201);
    assert.equal(survReg.body.user.role, 'citizen');
    surveyorId = survReg.body.user.id;
    surveyorToken = survReg.body.token;

    const oracleReg = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Chief Emeka Okafor',
        email: 'emeka.oracle@anagu.test',
        phone: '+234 809 555 0303',
        state: 'Enugu State',
        credentialId: 'Traditional Council · Enugu North',
        password: 'OraclePassword123!'
      })
    });
    assert.equal(oracleReg.status, 201);
    assert.equal(oracleReg.body.user.role, 'citizen');
    oracleId = oracleReg.body.user.id;
    oracleToken = oracleReg.body.token;

    // Admin approves surveyor & oracle roles
    const approveSurv = await apiFetch(`/api/admin/users/${encodeURIComponent(surveyorId)}/role`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ role: 'surveyor' })
    });
    assert.equal(approveSurv.status, 200);
    assert.equal(approveSurv.body.user.role, 'surveyor');

    const approveOracle = await apiFetch(`/api/admin/users/${encodeURIComponent(oracleId)}/role`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ role: 'oracle' })
    });
    assert.equal(approveOracle.status, 200);
    assert.equal(approveOracle.body.user.role, 'oracle');

    // Surveyor registers two land parcels (one for full approval/mint/revoke, one for rejection)
    const p1 = await apiFetch('/api/parcels', {
      method: 'POST',
      token: surveyorToken,
      body: JSON.stringify({
        parcel: buildSampleParcel(lifecycleParcelId, 'FCT/AMAC/GUZ/2026-001', 'Amina Bello')
      })
    });
    assert.equal(p1.status, 201);
    assert.equal(p1.body.parcel.id, lifecycleParcelId);
    assert.equal(p1.body.parcel.status, 'draft');

    const p2 = await apiFetch('/api/parcels', {
      method: 'POST',
      token: citizenToken,
      body: JSON.stringify({
        parcel: {
          ...buildSampleParcel(rejectParcelId, 'FCT/AMAC/GUZ/2026-002', 'Amina Bello'),
          coordinates: [
            [9.0221, 7.5223],
            [9.0225, 7.5228],
            [9.0219, 7.5231]
          ]
        }
      })
    });
    assert.equal(p2.status, 201);
    assert.equal(p2.body.parcel.status, 'draft');

    // Public read returns newly created parcels
    const listRes = await apiFetch('/api/parcels');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.parcels.some((p: { id: string }) => p.id === lifecycleParcelId));
  });

  it('Workflow 4: Surveyor spatial verification enforces surveyor-only role boundaries', async () => {
    // Citizen and Oracle cannot perform spatial verification
    const citizenAttempt = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({})
    });
    assert.equal(citizenAttempt.status, 403);

    const oracleAttempt = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: oracleToken,
      body: JSON.stringify({})
    });
    assert.equal(oracleAttempt.status, 403);

    // Approved Surveyor succeeds
    const surveyorApprove = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(surveyorApprove.status, 200);
    assert.equal(surveyorApprove.body.parcel.status, 'spatial_verified');
  });

  it('Workflow 5: Community Oracle ownership verification enforces oracle-only role boundaries', async () => {
    // Citizen and Surveyor cannot perform oracle attestation
    const citizenAttempt = await apiFetch(`/api/parcels/${lifecycleParcelId}/oracle`, {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({ affidavitRef: 'AFF-FAKE' })
    });
    assert.equal(citizenAttempt.status, 403);

    const surveyorAttempt = await apiFetch(`/api/parcels/${lifecycleParcelId}/oracle`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({ affidavitRef: 'AFF-SURV' })
    });
    assert.equal(surveyorAttempt.status, 403);

    // Approved Oracle Elder succeeds
    const oracleApprove = await apiFetch(`/api/parcels/${lifecycleParcelId}/oracle`, {
      method: 'PATCH',
      token: oracleToken,
      body: JSON.stringify({
        affidavitRef: 'AFF-ENUGU-2026-44',
        familyWitness: 'Alhaji Musa Bello',
        witnessNotes: 'Uncontested customary family title verified by 3 elders',
        quorumPercent: 100
      })
    });
    assert.equal(oracleApprove.status, 200);
    assert.equal(oracleApprove.body.parcel.status, 'oracle_verified');
  });

  it('Workflow 6: Registrar parcel approval, rejection, and pending transition (admin only)', async () => {
    // Non-admin surveyor cannot approve or reject parcels via admin endpoints
    const survReject = await apiFetch(`/api/admin/parcels/${rejectParcelId}/reject`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({ reason: 'Unauthorized' })
    });
    assert.equal(survReject.status, 403);

    // Admin rejects rejectParcelId
    const rejectRes = await apiFetch(`/api/admin/parcels/${rejectParcelId}/reject`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ reason: 'Incomplete beacon survey plan' })
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.parcel.status, 'rejected');

    // Admin moves rejected parcel back to pending (draft)
    const pendingRes = await apiFetch(`/api/admin/parcels/${rejectParcelId}/pending`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({})
    });
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingRes.body.parcel.status, 'draft');

    // Admin verifies & publishes rejectParcelId (Registrar approval)
    const verifyRes = await apiFetch(`/api/admin/parcels/${rejectParcelId}/verify`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({})
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.parcel.status, 'registered');
    assert.ok(typeof verifyRes.body.parcel.tokenId === 'number');
    assert.ok(typeof verifyRes.body.parcel.txHash === 'string');
  });

  it('Workflow 7: Blockchain title minting workflow enforces admin authorization and persists title metadata', async () => {
    // Surveyor and Oracle cannot mint titles
    const survMint = await apiFetch(`/api/parcels/${lifecycleParcelId}/mint`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({
        tokenId: 7001,
        txHash: '0x' + 'a'.repeat(64)
      })
    });
    assert.equal(survMint.status, 403);

    const oracleMint = await apiFetch(`/api/parcels/${lifecycleParcelId}/mint`, {
      method: 'PATCH',
      token: oracleToken,
      body: JSON.stringify({
        tokenId: 7001,
        txHash: '0x' + 'a'.repeat(64)
      })
    });
    assert.equal(oracleMint.status, 403);

    // Authorized Admin/Registrar mints title
    const txHash = '0x' + 'ab'.repeat(32);
    const mintRes = await apiFetch(`/api/parcels/${lifecycleParcelId}/mint`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({
        tokenId: 7001,
        txHash,
        blockNumber: 1895001,
        issuanceTimestamp: '2026-11-19T10:00:00.000Z'
      })
    });
    assert.equal(mintRes.status, 200);
    assert.equal(mintRes.body.parcel.status, 'registered');
    assert.equal(mintRes.body.parcel.tokenId, 7001);
    assert.equal(mintRes.body.parcel.txHash, txHash);
    assert.equal(mintRes.body.parcel.blockNumber, 1895001);
  });

  it('Workflow 8: Governor statutory revocation workflow (Section 28) enforces admin authorization', async () => {
    // Citizen and Surveyor cannot revoke titles
    const citizenRevoke = await apiFetch(`/api/parcels/${lifecycleParcelId}/revoke`, {
      method: 'PATCH',
      token: citizenToken,
      body: JSON.stringify({
        ground: 'OverridingPublicInterest',
        gazetteNumber: 'FG-FAKE-01',
        reason: 'Unauthorized'
      })
    });
    assert.equal(citizenRevoke.status, 403);

    // Authorized Admin/Governor executes Section 28 revocation
    const revokeRes = await apiFetch(`/api/parcels/${lifecycleParcelId}/revoke`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({
        ground: 'OverridingPublicInterest',
        gazetteNumber: 'FCT-GAZETTE-2026-88',
        reason: 'Public highway corridor expansion under LUA Section 28'
      })
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.parcel.status, 'revoked');
    assert.equal(revokeRes.body.parcel.revocationData.ground, 'OverridingPublicInterest');
    assert.equal(revokeRes.body.parcel.revocationData.gazetteNumber, 'FCT-GAZETTE-2026-88');

    // Admin portal revocation route also works
    const adminRevoke = await apiFetch(`/api/admin/parcels/${rejectParcelId}/revoke`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({
        ground: 'BreachOfStatutoryCondition',
        gazetteNumber: 'FCT-GAZETTE-2026-89',
        reason: 'Statutory breach verified'
      })
    });
    assert.equal(adminRevoke.status, 200);
    assert.equal(adminRevoke.body.parcel.status, 'revoked');
  });

  it('Workflow 9: MQTT event creation and public retrieval enforce topic authorization', async () => {
    // Unauthenticated MQTT post rejected
    const unauth = await apiFetch('/api/mqtt', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          id: 'msg-reg-unauth',
          topic: 'land/registration/status',
          payload: { parcelId: lifecycleParcelId },
          qos: 1
        }
      })
    });
    assert.equal(unauth.status, 401);

    // Authenticated Surveyor can publish operational topic
    const survEvent = await apiFetch('/api/mqtt', {
      method: 'POST',
      token: surveyorToken,
      body: JSON.stringify({
        message: {
          id: 'msg-reg-survey-01',
          topic: 'land/registration/status',
          payload: { parcelId: lifecycleParcelId, stage: 'spatial_verified' },
          qos: 1
        }
      })
    });
    assert.equal(survEvent.status, 201);
    assert.equal(survEvent.body.message.id, 'msg-reg-survey-01');

    // Surveyor cannot publish admin-only title revocation topic
    const forbiddenTopic = await apiFetch('/api/mqtt', {
      method: 'POST',
      token: surveyorToken,
      body: JSON.stringify({
        message: {
          id: 'msg-reg-forbidden',
          topic: 'land/title/revoked',
          payload: { parcelId: lifecycleParcelId },
          qos: 2
        }
      })
    });
    assert.equal(forbiddenTopic.status, 403);

    // Admin can publish title issued/revoked topics
    const adminEvent = await apiFetch('/api/mqtt', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        message: {
          id: 'msg-reg-admin-01',
          topic: 'land/title/revoked',
          payload: { parcelId: lifecycleParcelId, ground: 'OverridingPublicInterest' },
          qos: 2
        }
      })
    });
    assert.equal(adminEvent.status, 201);

    // Public GET /api/mqtt retrieves persisted events
    const listMqtt = await apiFetch('/api/mqtt');
    assert.equal(listMqtt.status, 200);
    const ids = listMqtt.body.messages.map((m: { id: string }) => m.id);
    assert.ok(ids.includes('msg-reg-survey-01'));
    assert.ok(ids.includes('msg-reg-admin-01'));
  });

  it('Workflow 10: Citizen land inquiry submission, validation, admin retrieval, and admin deletion', async () => {
    // Invalid inquiry payload rejected with 400
    const badInquiry = await apiFetch('/api/inquiries', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A',
        phone: 'invalid',
        email: 'not-an-email'
      })
    });
    assert.equal(badInquiry.status, 400);

    // Valid public/citizen inquiry succeeds
    const created = await apiFetch('/api/inquiries', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Chinedu Okafor',
        phone: '+234 803 777 8899',
        email: 'chinedu.buyer@example.ng',
        state: 'Federal Capital Territory (Abuja)',
        message: 'Interested in verified Guzape Diplomatic Sector parcel'
      })
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.inquiry.id);
    inquiryId = created.body.inquiry.id;

    // Admin sees inquiry in overview
    const overview = await apiFetch('/api/admin/overview', { token: adminToken });
    assert.equal(overview.status, 200);
    assert.ok(overview.body.inquiries.some((i: { id: string }) => i.id === inquiryId));

    // Citizen cannot delete inquiry
    const citizenDelete = await apiFetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, {
      method: 'DELETE',
      token: citizenToken
    });
    assert.equal(citizenDelete.status, 403);

    // Admin can delete inquiry
    const adminDelete = await apiFetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, {
      method: 'DELETE',
      token: adminToken
    });
    assert.equal(adminDelete.status, 200);
  });

  it('Task 2 Regression: Role demotion revokes surveyor access immediately and expired/invalid sessions never fall back', async () => {
    // Demote surveyor back to citizen
    const demote = await apiFetch(`/api/admin/users/${encodeURIComponent(surveyorId)}/role`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ role: 'citizen' })
    });
    assert.equal(demote.status, 200);
    assert.equal(demote.body.user.role, 'citizen');

    // Old surveyor token can NO LONGER perform spatial verification
    const blockedSpatial = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(blockedSpatial.status, 403);

    // Expired user & admin sessions rejected across protected workflows
    const expiredUser = signUserToken({ id: citizenId, email: 'amina.citizen@anagu.test', role: 'citizen' }, -1000);
    const expiredMe = await apiFetch('/api/auth/me', { token: expiredUser });
    assert.equal(expiredMe.status, 401);

    const expiredAdmin = signAdminToken(
      {
        id: 'adm-exp',
        fullName: 'Expired',
        email: 'registrar.ibrahim@anagu.test',
        phone: '+234 800 262 4800',
        department: 'Registry',
        state: 'FCT',
        createdAt: '2026-01-01'
      },
      -1000
    );
    const expiredOverview = await apiFetch('/api/admin/overview', { token: expiredAdmin });
    assert.equal(expiredOverview.status, 401);
  });
});
