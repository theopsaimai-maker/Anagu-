import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
import {
  adminSetParcelStatus,
  createParcel,
  listParcels,
  ParcelGeometryImmutableError,
  resetMemoryStoreForTests
} from '../server/db.ts';
import {
  findNearbyParcels,
  formatDistanceLabel,
  getParcelUtmInfo
} from '../src/lib/spatialUtils.ts';
import { mergeParcelLists } from '../src/lib/parcelMerge.ts';

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
    ] as [number, number][],
    beacons: [
      { id: 'B1', name: 'PB 1', lat: 9.0121, lng: 7.5123, northing: 996100, easting: 336200, elevation: 512.0 }
    ],
    spatialHash: '0x9a8b7c6d5e4f3a2b1c0d',
    documentHash: '0x1f2e3d4c5b6a79887766',
    surveyPlanRef: 'FCT/SURV/2026/8841',
    intendedUse: 'Residential' as const,
    priceUsd: 85000,
    sellerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    status: 'draft' as const
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

    // Approved Surveyor succeeds on draft parcel
    const surveyorApprove = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(surveyorApprove.status, 200);
    assert.equal(surveyorApprove.body.parcel.status, 'spatial_verified');
    assert.equal(surveyorApprove.body.spatial.persisted, true);
    assert.equal(surveyorApprove.body.spatial.persistenceRefused, false);

    // Re-verifying an already spatial_verified parcel remains eligible
    const surveyorReverify = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(surveyorReverify.status, 200);
    assert.equal(surveyorReverify.body.parcel.status, 'spatial_verified');
    assert.equal(surveyorReverify.body.spatial.persisted, true);
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

    // Lifecycle protection: Surveyor cannot downgrade an oracle_verified parcel back to spatial_verified
    const downgradeOracle = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(downgradeOracle.status, 409);
    assert.equal(downgradeOracle.body.spatial.persisted, false);
    assert.equal(downgradeOracle.body.spatial.persistenceRefused, true);
    assert.equal(downgradeOracle.body.spatial.status, 'oracle_verified');

    // Read-only spatial analysis remains permitted on oracle_verified parcels without modifying status
    const analyzeOracle = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial/analyze`, {
      method: 'POST',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(analyzeOracle.status, 200);
    assert.equal(analyzeOracle.body.parcel.status, 'oracle_verified');
    assert.equal(analyzeOracle.body.spatial.persisted, false);
    assert.equal(analyzeOracle.body.spatial.persistenceRefused, false);
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

    // Lifecycle protection: rejected parcel cannot be overwritten by spatial approval
    const downgradeRejected = await apiFetch(`/api/parcels/${rejectParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(downgradeRejected.status, 409);
    assert.equal(downgradeRejected.body.spatial.persisted, false);
    assert.equal(downgradeRejected.body.spatial.persistenceRefused, true);
    assert.equal(downgradeRejected.body.spatial.status, 'rejected');

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

    // Lifecycle protection: registered title cannot be downgraded back to spatial_verified
    const downgradeRegistered = await apiFetch(`/api/parcels/${lifecycleParcelId}/spatial`, {
      method: 'PATCH',
      token: surveyorToken,
      body: JSON.stringify({})
    });
    assert.equal(downgradeRegistered.status, 409);
    assert.equal(downgradeRegistered.body.spatial.persisted, false);
    assert.equal(downgradeRegistered.body.spatial.persistenceRefused, true);
    assert.equal(downgradeRegistered.body.spatial.status, 'registered');
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

    // Unauthenticated GET /api/mqtt is rejected with 401 (protects audit telemetry & PII payloads)
    const unauthListMqtt = await apiFetch('/api/mqtt');
    assert.equal(unauthListMqtt.status, 401);

    // Authenticated GET /api/mqtt retrieves persisted events for valid user & admin sessions
    const listMqtt = await apiFetch('/api/mqtt', { token: citizenToken });
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

  it('Phase 2.2.3: Finalized parcel coordinates are immutable while draft/spatial_verified corrections follow lifecycle rules', async () => {
    const finalizedStatuses = [
      'oracle_verified',
      'legal_approved',
      'registered',
      'revoked',
      'rejected'
    ] as const;

    for (let i = 0; i < finalizedStatuses.length; i++) {
      const status = finalizedStatuses[i];
      const parcelId = `PAR-IMMUT-2026-00${i + 1}`;
      const originalCoords: [number, number][] = [
        [9.05 + i * 0.01, 7.55],
        [9.051 + i * 0.01, 7.551],
        [9.05 + i * 0.01, 7.552]
      ];
      const tamperedCoords: [number, number][] = [
        [9.06 + i * 0.01, 7.56],
        [9.061 + i * 0.01, 7.561],
        [9.06 + i * 0.01, 7.562]
      ];

      const base = {
        ...buildSampleParcel(parcelId, `FCT/IMMUT/2026-00${i + 1}`, 'Immutability Test Holder'),
        coordinates: originalCoords,
        status: 'draft' as const
      };
      await createParcel(base);
      await adminSetParcelStatus(parcelId, status);

      // Direct data-layer coordinate mutation on finalized parcel must throw ParcelGeometryImmutableError
      await assert.rejects(
        () =>
          createParcel({
            ...base,
            coordinates: tamperedCoords,
            status
          }),
        (err: unknown) => {
          assert.ok(err instanceof ParcelGeometryImmutableError);
          assert.equal(err.parcelId, parcelId);
          assert.equal(err.status, status);
          return true;
        }
      );

      // API POST /api/parcels overwrite attempt on finalized parcel must also return 409
      const apiOverwrite = await apiFetch('/api/parcels', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          parcel: {
            ...base,
            coordinates: tamperedCoords
          }
        })
      });
      assert.equal(apiOverwrite.status, 409);

      // Original coordinates and finalized status remain intact
      const stored = (await listParcels()).find((p) => p.id === parcelId);
      assert.ok(stored);
      assert.equal(stored.status, status);
      assert.deepEqual(stored.coordinates, originalCoords);
    }

    // Eligible parcel in draft & spatial_verified states:
    const editableId = 'PAR-EDIT-2026-001';
    const initialCoords: [number, number][] = [
      [9.12, 7.62],
      [9.121, 7.621],
      [9.12, 7.622]
    ];
    const correctedCoords: [number, number][] = [
      [9.1202, 7.6202],
      [9.1212, 7.6212],
      [9.1202, 7.6222]
    ];
    const editable = {
      ...buildSampleParcel(editableId, 'FCT/EDIT/2026-001', 'Editable Parcel Holder'),
      coordinates: initialCoords,
      status: 'draft' as const
    };
    await createParcel(editable);

    // Promote to spatial_verified
    const sv = await adminSetParcelStatus(editableId, 'spatial_verified');
    assert.equal(sv?.status, 'spatial_verified');

    // Identical coordinates update does NOT invalidate spatial_verified
    const noopUpdate = await createParcel({
      ...editable,
      coordinates: initialCoords,
      status: 'spatial_verified'
    });
    assert.equal(noopUpdate.status, 'spatial_verified');

    // Phase 2.2.4 bypass test 1: spatial_verified + changed coordinates + requested legal_approved must NOT become legal_approved
    const bypassLegalCoords: [number, number][] = [
      [9.1201, 7.6201],
      [9.1211, 7.6211],
      [9.1201, 7.6221]
    ];
    const blockedLegalAdvance = await createParcel({
      ...editable,
      coordinates: bypassLegalCoords,
      status: 'legal_approved'
    });
    assert.notEqual(blockedLegalAdvance.status, 'legal_approved');
    assert.equal(blockedLegalAdvance.status, 'draft');
    assert.deepEqual(blockedLegalAdvance.coordinates, bypassLegalCoords);

    // Phase 2.2.4 bypass test 2: draft + changed coordinates + requested registered must NOT become registered
    const bypassRegCoords: [number, number][] = [
      [9.1203, 7.6203],
      [9.1213, 7.6213],
      [9.1203, 7.6223]
    ];
    const blockedRegAdvance = await createParcel({
      ...editable,
      coordinates: bypassRegCoords,
      status: 'registered'
    });
    assert.notEqual(blockedRegAdvance.status, 'registered');
    assert.equal(blockedRegAdvance.status, 'draft');
    assert.deepEqual(blockedRegAdvance.coordinates, bypassRegCoords);

    // Promote back to spatial_verified, then perform a normal coordinate correction -> returns to draft
    const svAgain = await adminSetParcelStatus(editableId, 'spatial_verified');
    assert.equal(svAgain?.status, 'spatial_verified');
    const corrected = await createParcel({
      ...editable,
      coordinates: correctedCoords,
      status: 'spatial_verified'
    });
    assert.equal(corrected.status, 'draft');
    assert.deepEqual(corrected.coordinates, correctedCoords);
  });

  it('Phase 2.2.3/2.2.4/2.2.5: PostGIS migration SQL enforces geometry integrity, NULL-to-geom coordinate derivation, finalized immutability, and lifecycle safeguards', async () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/001_postgis_spatial.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Trigger binding & finalized status guards (including spatial audit columns)
    assert.match(
      sql,
      /BEFORE INSERT OR UPDATE OF[\s\S]*coordinates,[\s\S]*geom,[\s\S]*spatial_valid,[\s\S]*spatial_verified_at,[\s\S]*spatial_conflicts[\s\S]*ON public\.anagu_parcels/
    );
    assert.match(sql, /OLD\.status IN \('oracle_verified', 'legal_approved', 'registered', 'revoked', 'rejected'\)/);
    assert.match(sql, /RAISE EXCEPTION[\s\S]*Coordinate modification rejected[\s\S]*ERRCODE = '23514'/);
    assert.match(sql, /RAISE EXCEPTION[\s\S]*Geometry modification rejected: parcel "%" is in finalized lifecycle state "%"[\s\S]*ERRCODE = '23514'/);

    // Phase 2.2.7: Custom GUC authorization MUST NOT exist (ordinary sessions can set custom GUCs)
    assert.doesNotMatch(sql, /anagu\.allow_spatial_audit_write/);
    assert.doesNotMatch(sql, /set_config\s*\(/i);
    assert.doesNotMatch(sql, /current_setting\s*\(/i);

    // Phase 2.2.7: Owner-only private schema & single-use transaction/parcel grant table
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS anagu_internal;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS anagu_internal\.spatial_audit_write_grants/);
    assert.match(sql, /REVOKE ALL ON SCHEMA anagu_internal FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON SCHEMA anagu_internal FROM anon;/);
    assert.match(sql, /REVOKE ALL ON SCHEMA anagu_internal FROM authenticated;/);
    assert.match(sql, /REVOKE ALL ON SCHEMA anagu_internal FROM service_role;/);
    assert.match(sql, /REVOKE ALL ON TABLE anagu_internal\.spatial_audit_write_grants FROM service_role;/);
    assert.match(sql, /INSERT INTO anagu_internal\.spatial_audit_write_grants \(txid, parcel_id\)\s+VALUES \(pg_catalog\.txid_current\(\), p_parcel_id\)/);
    assert.match(sql, /DELETE FROM anagu_internal\.spatial_audit_write_grants\s+WHERE txid = pg_catalog\.txid_current\(\)\s+AND parcel_id = OLD\.id;/);
    assert.match(sql, /v_update_found := FOUND;[\s\S]*DELETE FROM anagu_internal\.spatial_audit_write_grants[\s\S]*IF v_update_found THEN/);
    assert.match(sql, /RAISE EXCEPTION[\s\S]*Spatial audit modification rejected[\s\S]*ERRCODE = '23514'/);

    // Phase 2.2.7: Backend-only RLS & direct table privilege revocation on public.anagu_parcels
    assert.match(sql, /ALTER TABLE public\.anagu_parcels ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.anagu_parcels FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.anagu_parcels FROM anon;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.anagu_parcels FROM authenticated;/);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.anagu_parcels TO service_role;/);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*ON public\.anagu_parcels/i);

    // Phase 2.2.9: Existing PostGIS 3.3.7 in schema `public` — NEVER reinstall, relocate, drop, or upgrade PostGIS
    assert.doesNotMatch(sql, /\bCREATE\s+EXTENSION\b/i);
    assert.doesNotMatch(sql, /\bALTER\s+EXTENSION\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+EXTENSION\b/i);
    assert.doesNotMatch(sql, /\bextensions\./);
    assert.match(sql, /FROM pg_catalog\.pg_extension e[\s\S]*WHERE e\.extname = 'postgis'/);
    assert.match(sql, /ELSIF v_postgis_schema <> 'public' THEN[\s\S]*RAISE EXCEPTION/);
    assert.match(sql, /SELECT pg_catalog\.format_type\(a\.atttypid, a\.atttypmod\)[\s\S]*c\.relname = 'anagu_parcels'[\s\S]*a\.attname = 'id'/);
    assert.match(sql, /ELSIF v_parcel_id_type NOT IN \('text', 'character varying'\) THEN[\s\S]*RAISE EXCEPTION/);

    // Phase 2.2.8/2.2.9: No persistent session-level SET search_path; explicit public GiST operator classes; ownership & public CREATE hardening
    assert.doesNotMatch(sql, /^\s*SET\s+search_path\s+TO\b/im);
    assert.match(sql, /USING GIST \(geom public\.gist_geometry_ops_2d\)/);
    assert.match(sql, /USING GIST \(\(geom::public\.geography\) public\.gist_geography_ops\)/);
    assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM PUBLIC;/);
    assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM anon;/);
    assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM authenticated;/);
    assert.match(sql, /Ownership mismatch detected between anagu_internal\.spatial_audit_write_grants and SECURITY DEFINER spatial functions/);
    assert.match(sql, /IF v_owner_name IN \('anon', 'authenticated', 'service_role'\) THEN[\s\S]*RAISE EXCEPTION/);

    // Phase 2.2.6/2.2.7/2.2.9: Explicit public schema qualification in DDL & backfill
    assert.match(sql, /ADD COLUMN IF NOT EXISTS geom public\.geometry\(Polygon, 4326\)/);
    assert.match(sql, /public\.ST_Area\(calc\.g::public\.geography\)/);

    // Phase 2.2.8/2.2.9: Rollback-safe PostgreSQL integration test suite validates PostGIS 3.3.7 in public and ends in ROLLBACK
    const pgTestSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/tests/001_postgis_spatial_integration.sql'),
      'utf8'
    );
    assert.match(pgTestSql, /^\s*BEGIN;/m);
    assert.match(pgTestSql, /\bROLLBACK;\s*$/);
    assert.match(pgTestSql, /IF v_postgis_schema <> 'public' THEN/);
    assert.match(pgTestSql, /Expected PostGIS 3\.3\.7 or compatible/);
    assert.doesNotMatch(pgTestSql, /\bextensions\./);
    assert.match(pgTestSql, /anagu_verify_parcel_spatial/);
    assert.match(pgTestSql, /anagu_check_parcel_overlaps/);
    assert.match(pgTestSql, /SQLSTATE '23514'/);

    // Phase 2.2.5: Must NOT short-circuit when OLD.geom IS NULL and NEW.geom IS NOT NULL
    assert.doesNotMatch(sql, /ELSIF OLD\.geom IS NOT NULL OR NEW\.geom IS NOT NULL THEN/);

    // Phase 2.2.5: Identical-coordinate no-op only returns early when OLD.geom IS NOT NULL and EWKB is identical
    assert.match(
      sql,
      /IF OLD\.geom IS NOT NULL THEN[\s\S]*IF public\.ST_AsEWKB\(NEW\.geom\) IS NOT DISTINCT FROM public\.ST_AsEWKB\(OLD\.geom\) THEN[\s\S]*RETURN NEW;/
    );

    // Phase 2.2.5: NULL-to-geometry backfill derives v_geom from NEW.coordinates, rejects mismatched finalized geom, and never trusts caller-supplied NEW.geom
    assert.match(
      sql,
      /ELSE[\s\S]*v_geom := public\.anagu_coords_jsonb_to_polygon\(NEW\.coordinates\);[\s\S]*v_geom_computed := TRUE;[\s\S]*IF NEW\.geom IS NOT NULL[\s\S]*public\.ST_AsEWKB\(NEW\.geom\) IS DISTINCT FROM public\.ST_AsEWKB\(v_geom\)[\s\S]*RAISE EXCEPTION[\s\S]*supplied geometry does not match authoritative coordinates[\s\S]*ERRCODE = '23514'/
    );

    // Phase 2.2.5: Section 6 legitimate NULL-to-geometry backfill derives geom from coordinates
    assert.match(
      sql,
      /SELECT id, public\.anagu_coords_jsonb_to_polygon\(coordinates\) AS g\s+FROM public\.anagu_parcels\s+WHERE geom IS NULL/
    );

    // Phase 2.2.4: Unconditional draft reset on coordinate change for editable parcels
    assert.match(sql, /IF OLD\.status IN \('draft', 'spatial_verified'\) THEN\s+NEW\.status := 'draft';\s+END IF;/);
    assert.doesNotMatch(sql, /AND NEW\.status = 'spatial_verified'/);

    // Phase 2.2.1/2.2.2/2.2.9 preserved safeguards
    assert.match(sql, /public\.ST_ForcePolygonCCW/);
    assert.match(sql, /public\.ST_CollectionExtract\(/);
    assert.match(sql, /NOT public\.ST_IsEmpty\(/);
    assert.match(sql, /ROUND\(EXTRACT\(EPOCH FROM \(clock_timestamp\(\) - v_started_at\)\) \* 1000\)::INTEGER/);
    assert.match(sql, /SET search_path = pg_catalog, public, pg_temp/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.trg_fn_anagu_sync_parcel_geom\(\) FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.anagu_verify_parcel_spatial\(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN\) FROM anon/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.anagu_verify_parcel_spatial\(TEXT, DOUBLE PRECISION, BOOLEAN, BOOLEAN\) FROM authenticated/);

    // API defense-in-depth: caller-supplied geom & spatial audit fields on POST /api/parcels are ignored/stripped
    const geomSpoofId = 'PAR-SPOOF-GEOM-2026-001';
    const spoofRes = await apiFetch('/api/parcels', {
      method: 'POST',
      token: surveyorToken,
      body: JSON.stringify({
        parcel: {
          ...buildSampleParcel(geomSpoofId, 'FCT/SPOOF/2026-001', 'Spoof Guard Test'),
          coordinates: [
            [9.18, 7.68],
            [9.181, 7.681],
            [9.18, 7.682]
          ],
          geom: 'SRID=4326;POLYGON((0 0,0 1,1 1,1 0,0 0))',
          spatial_valid: true,
          spatial_verified_at: '2026-01-01T00:00:00Z',
          spatial_buffer_m: 0.1,
          spatial_conflicts: [],
          postgis_area_sqm: 999999
        }
      })
    });
    assert.equal(spoofRes.status, 201);
    assert.equal(spoofRes.body.parcel.geom, undefined);
    assert.equal(spoofRes.body.parcel.spatial_valid, undefined);
    assert.equal(spoofRes.body.parcel.spatial_verified_at, undefined);
    assert.equal(spoofRes.body.parcel.status, 'draft');

    // Unauthorized citizen cannot invoke spatial analysis or verification
    const citizenAnalyze = await apiFetch(`/api/parcels/${geomSpoofId}/spatial/analyze`, {
      method: 'POST',
      token: citizenToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(citizenAnalyze.status, 403);

    // Legitimate authorized spatial analysis & approval transitions draft -> spatial_verified
    // (Note: surveyorId was intentionally demoted to citizen in Test 11, so adminToken exercises requireRoleOrAdmin(['surveyor']))
    const legitAnalyze = await apiFetch(`/api/parcels/${geomSpoofId}/spatial/analyze`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(legitAnalyze.status, 200);
    assert.equal(legitAnalyze.body.spatial.passed, true);

    const legitApprove = await apiFetch(`/api/parcels/${geomSpoofId}/spatial`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(legitApprove.status, 200);
    assert.equal(legitApprove.body.parcel.status, 'spatial_verified');
  });

  it('Phase 2.3: Nigeria UTM zone computation (EPSG:4326 storage), nearby parcel proximity, and Surveyor GIS screen wiring', () => {
    // Lagos (~3.48°E -> Zone 31N)
    const lagos = getParcelUtmInfo([
      [6.44, 3.48],
      [6.441, 3.481],
      [6.44, 3.482]
    ]);
    assert.equal(lagos.zoneCode, '31N');
    assert.equal(lagos.epsgCode, 'EPSG:32631');
    assert.equal(lagos.storageCrs, 'EPSG:4326');
    assert.equal(lagos.isNigeriaZone, true);

    // Abuja (~7.45°E -> Zone 32N)
    const abuja = getParcelUtmInfo([
      [9.07, 7.45],
      [9.071, 7.451],
      [9.07, 7.452]
    ]);
    assert.equal(abuja.zoneCode, '32N');
    assert.equal(abuja.epsgCode, 'EPSG:32632');
    assert.equal(abuja.storageCrs, 'EPSG:4326');
    assert.equal(abuja.isNigeriaZone, true);

    // Maiduguri (~13.15°E -> Zone 33N)
    const maiduguri = getParcelUtmInfo([
      [11.83, 13.15],
      [11.831, 13.151],
      [11.83, 13.152]
    ]);
    assert.equal(maiduguri.zoneCode, '33N');
    assert.equal(maiduguri.epsgCode, 'EPSG:32633');
    assert.equal(maiduguri.storageCrs, 'EPSG:4326');
    assert.equal(maiduguri.isNigeriaZone, true);

    // Legacy Paris test record (~2.35°E, 48.85°N -> Zone 31N, outside Nigeria bounds)
    const paris = getParcelUtmInfo([
      [48.85, 2.35],
      [48.851, 2.351],
      [48.85, 2.352]
    ]);
    assert.equal(paris.zoneCode, '31N');
    assert.equal(paris.isNigeriaZone, false);
    assert.equal(paris.storageCrs, 'EPSG:4326');

    // Nearby parcels sorted by real geodesic distance and never includes activeParcel itself
    const active = buildSampleParcel('PAR-NEAR-0', 'FCT/NEAR/0', 'Origin');
    const close = {
      ...buildSampleParcel('PAR-NEAR-1', 'FCT/NEAR/1', 'Close Neighbor'),
      coordinates: [
        [9.072, 7.452],
        [9.073, 7.453],
        [9.072, 7.454]
      ] as [number, number][]
    };
    const far = {
      ...buildSampleParcel('PAR-NEAR-2', 'LAG/FAR/2', 'Far Parcel'),
      coordinates: [
        [6.44, 3.48],
        [6.441, 3.481],
        [6.44, 3.482]
      ] as [number, number][]
    };
    const nearby = findNearbyParcels(active, [active, far, close], 5);
    assert.equal(nearby.length, 2);
    assert.equal(nearby[0].parcel.id, 'PAR-NEAR-1');
    assert.equal(nearby[1].parcel.id, 'PAR-NEAR-2');
    assert.ok(nearby[0].distanceMeters < nearby[1].distanceMeters);
    assert.match(formatDistanceLabel(240.4), /240\.4 m/);
    assert.match(formatDistanceLabel(5400), /5\.40 km/);

    // Verify ScreenSurveyorCadastral uses real apiAnalyzeSpatial and removed fabricated GIS mocks
    const gisScreenSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/screens/ScreenSurveyorCadastral.tsx'),
      'utf8'
    );
    assert.match(gisScreenSrc, /apiAnalyzeSpatial/);
    assert.match(gisScreenSrc, /getParcelUtmInfo/);
    assert.match(gisScreenSrc, /findNearbyParcels/);
    assert.doesNotMatch(gisScreenSrc, /LAG-0881/);
    assert.doesNotMatch(gisScreenSrc, /LAG-0899/);
    assert.doesNotMatch(gisScreenSrc, /14\.2 m² Overlap/);
    assert.doesNotMatch(gisScreenSrc, /simulateCollision/);
    assert.doesNotMatch(gisScreenSrc, /Query Runtime: 412ms/);
  });

  it('Phase 2.4: Authoritative Express/Supabase parcel precedence overrides stale Firestore snapshots in Admin & Client', () => {
    const expressVerified = {
      ...buildSampleParcel('PAR-AUTH-001', 'FCT/AUTH/001', 'Verified Owner'),
      status: 'spatial_verified' as const
    };
    const staleFirestoreDraft = {
      ...buildSampleParcel('PAR-AUTH-001', 'FCT/AUTH/001', 'Verified Owner'),
      status: 'draft' as const
    };
    const firestoreFallbackOnly = {
      ...buildSampleParcel('PAR-CLOUD-ONLY-002', 'LAG/CLOUD/002', 'Fallback Record'),
      status: 'draft' as const
    };

    // Express passed first MUST win for colliding IDs while preserving Firestore-only fallback records
    const merged = mergeParcelLists(
      [expressVerified],
      [staleFirestoreDraft, firestoreFallbackOnly]
    );
    assert.equal(merged.length, 2);
    const mergedAuth = merged.find((p) => p.id === 'PAR-AUTH-001');
    const mergedFallback = merged.find((p) => p.id === 'PAR-CLOUD-ONLY-002');
    assert.equal(mergedAuth?.status, 'spatial_verified');
    assert.equal(mergedFallback?.status, 'draft');

    // Static verification that AdminApp prioritizes Express over Firestore and surfaces fallback warning transparently
    const adminSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/admin/AdminApp.tsx'),
      'utf8'
    );
    assert.match(adminSrc, /mergeParcelLists\(expressList, cloudList\)/);
    assert.doesNotMatch(adminSrc, /mergeParcelLists\(cloudList, expressList\)/);
    assert.match(adminSrc, /isUsingFirestoreFallback/);
    assert.match(adminSrc, /Authoritative Express\/Supabase Registry Unreachable/);
    assert.match(adminSrc, /hasActiveExpressAdminToken/);
  });

  it('Phase 2.5: Migration 002 hardens all five base tables with default-deny RLS, least-privilege service_role grants, zero browser Supabase access, and no password hash leaks', async () => {
    const mig002Path = path.resolve(process.cwd(), 'supabase/migrations/002_base_tables_rls.sql');
    const mig002 = fs.readFileSync(mig002Path, 'utf8');
    const pgTest002Path = path.resolve(
      process.cwd(),
      'supabase/tests/002_base_tables_rls_integration.sql'
    );
    const pgTest002 = fs.readFileSync(pgTest002Path, 'utf8');

    const fiveTables = [
      'anagu_users',
      'anagu_admins',
      'anagu_oracle_attestations',
      'anagu_mqtt_events',
      'anagu_inquiries'
    ];

    // Atomic transaction wrapper & PostgREST cache reload
    assert.match(mig002, /^\s*BEGIN;/m);
    assert.match(mig002, /\bCOMMIT;\s*$/);
    assert.match(mig002, /NOTIFY pgrst, 'reload schema';/);

    // RLS enabled and PUBLIC/anon/authenticated privileges revoked on all five tables
    for (const tbl of fiveTables) {
      assert.match(mig002, new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY;`));
      assert.match(mig002, new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM PUBLIC;`));
      assert.match(mig002, new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM anon;`));
      assert.match(mig002, new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM authenticated;`));
      assert.match(mig002, new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM service_role;`));
    }

    // Exact least-privilege service_role grant matrix matching server/db.ts
    assert.match(mig002, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.anagu_users TO service_role;/);
    assert.match(mig002, /GRANT SELECT, INSERT ON TABLE public\.anagu_admins TO service_role;/);
    assert.match(mig002, /GRANT SELECT, INSERT ON TABLE public\.anagu_oracle_attestations TO service_role;/);
    assert.match(mig002, /GRANT SELECT, INSERT ON TABLE public\.anagu_mqtt_events TO service_role;/);
    assert.match(mig002, /GRANT SELECT, INSERT, DELETE ON TABLE public\.anagu_inquiries TO service_role;/);

    // Schema public CREATE revoked from PUBLIC, anon, authenticated, and service_role
    assert.match(mig002, /REVOKE CREATE ON SCHEMA public FROM PUBLIC;/);
    assert.match(mig002, /REVOKE CREATE ON SCHEMA public FROM anon;/);
    assert.match(mig002, /REVOKE CREATE ON SCHEMA public FROM authenticated;/);
    assert.match(mig002, /REVOKE CREATE ON SCHEMA public FROM service_role;/);

    // Strip single-line SQL comments before checking executable SQL statements
    const mig002Code = mig002.replace(/--.*$/gm, '');

    // No Supabase Auth policies, no permissive policies, no destructive DDL, no silent policy drops
    assert.doesNotMatch(mig002Code, /\bCREATE\s+POLICY\b/i);
    assert.doesNotMatch(mig002Code, /\bDROP\s+POLICY\b/i);
    assert.doesNotMatch(mig002Code, /\bauth\.uid\s*\(/i);
    assert.doesNotMatch(mig002Code, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(mig002Code, /\bTRUNCATE\s+(?:TABLE\s+)?public\./i);
    assert.doesNotMatch(mig002Code, /\bDELETE\s+FROM\b/i);

    // Must not modify migration 001's parcel table, internal schema, or PostGIS extension
    assert.doesNotMatch(mig002Code, /ALTER\s+TABLE\s+public\.anagu_parcels/i);
    assert.doesNotMatch(mig002Code, /ON\s+TABLE\s+public\.anagu_parcels/i);
    assert.doesNotMatch(mig002Code, /\banagu_internal\b/);
    assert.doesNotMatch(mig002Code, /\bCREATE\s+EXTENSION\b/i);

    // Pre-flight guards: ownership check + existing policy conflict guard
    assert.match(mig002, /FROM pg_catalog\.pg_policies/);
    assert.match(mig002, /pre-existing RLS policies detected on target tables/);
    assert.match(mig002, /IF current_user IN \('anon', 'authenticated', 'service_role'\) THEN/);

    // Companion PostgreSQL integration test is rollback-safe and tests all 5 tables + 42501 denial
    assert.match(pgTest002, /^\s*BEGIN;/m);
    assert.match(pgTest002, /\bROLLBACK;\s*$/);
    assert.match(pgTest002, /SET LOCAL ROLE anon/);
    assert.match(pgTest002, /SET LOCAL ROLE authenticated/);
    assert.match(pgTest002, /SET LOCAL ROLE service_role/);
    assert.match(pgTest002, /SQLSTATE '42501'/);

    // Verify ZERO frontend browser files import Supabase client or reference service_role/PostgREST directly
    const walkTsFiles = (dir: string): string[] => {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...walkTsFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    };
    const srcFiles = walkTsFiles(path.resolve(process.cwd(), 'src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /@supabase\/supabase-js/, `Browser file must not import supabase-js: ${file}`);
      assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, `Browser file must not reference service_role secret: ${file}`);
      assert.doesNotMatch(content, /\/rest\/v1\//, `Browser file must not query PostgREST directly: ${file}`);
    }

    // Verify Express admin overview returns users/admins without leaking password_hash
    const overview = await apiFetch('/api/admin/overview', { token: adminToken });
    assert.equal(overview.status, 200);
    assert.ok(Array.isArray(overview.body.users) && overview.body.users.length > 0);
    assert.ok(Array.isArray(overview.body.admins) && overview.body.admins.length > 0);
    for (const u of overview.body.users) {
      assert.equal('password_hash' in u, false);
      assert.equal('passwordHash' in u, false);
      assert.equal('password' in u, false);
    }
    for (const a of overview.body.admins) {
      assert.equal('password_hash' in a, false);
      assert.equal('passwordHash' in a, false);
      assert.equal('password' in a, false);
    }
  });

  it('Phase 2.6: End-to-end spatial verification rejects invalid geometry and true overlaps while accepting shared boundaries', async () => {
    // 1. Invalid self-intersecting bowtie polygon -> analyze fails & PATCH /spatial returns 409 (never fake success)
    const invalidId = 'PAR-SPATIAL-INVALID-2026';
    await createParcel({
      ...buildSampleParcel(invalidId, 'FCT/SPAT/INV-01', 'Invalid Geom Claimant'),
      coordinates: [
        [9.4000, 7.7000],
        [9.4010, 7.7010],
        [9.4000, 7.7010],
        [9.4010, 7.7000]
      ],
      status: 'draft'
    });

    const invalidAnalyze = await apiFetch(`/api/parcels/${invalidId}/spatial/analyze`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(invalidAnalyze.status, 200);
    assert.equal(invalidAnalyze.body.spatial.isValid, false);
    assert.equal(invalidAnalyze.body.spatial.passed, false);

    const invalidApprove = await apiFetch(`/api/parcels/${invalidId}/spatial`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(invalidApprove.status, 409);

    // 2. Two adjacent parcels sharing an exact boundary edge -> accepted (boundaryContactCount >= 1, trueOverlapCount = 0)
    const adjAId = 'PAR-SPATIAL-ADJ-A-2026';
    const adjBId = 'PAR-SPATIAL-ADJ-B-2026';
    await createParcel({
      ...buildSampleParcel(adjAId, 'FCT/SPAT/ADJ-A', 'Neighbor Alpha'),
      coordinates: [
        [9.5000, 7.8000],
        [9.5010, 7.8000],
        [9.5010, 7.8010],
        [9.5000, 7.8010]
      ],
      status: 'draft'
    });
    await createParcel({
      ...buildSampleParcel(adjBId, 'FCT/SPAT/ADJ-B', 'Neighbor Beta'),
      coordinates: [
        [9.5000, 7.8010],
        [9.5010, 7.8010],
        [9.5010, 7.8020],
        [9.5000, 7.8020]
      ],
      status: 'registered'
    });

    const adjApprove = await apiFetch(`/api/parcels/${adjAId}/spatial`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(adjApprove.status, 200);
    assert.equal(adjApprove.body.spatial.passed, true);
    assert.equal(adjApprove.body.spatial.trueOverlapCount, 0);
    assert.ok(adjApprove.body.spatial.boundaryContactCount >= 1);
    assert.equal(adjApprove.body.parcel.status, 'spatial_verified');

    // 3. True interior overlapping parcel -> rejected with 409 and never marked spatial_verified
    const overlapId = 'PAR-SPATIAL-OV-2026';
    await createParcel({
      ...buildSampleParcel(overlapId, 'FCT/SPAT/OV-01', 'Overlapping Claimant'),
      coordinates: [
        [9.5005, 7.8005],
        [9.5015, 7.8005],
        [9.5015, 7.8015],
        [9.5005, 7.8015]
      ],
      status: 'draft'
    });

    const ovApprove = await apiFetch(`/api/parcels/${overlapId}/spatial`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({ bufferMeters: 0.5 })
    });
    assert.equal(ovApprove.status, 409);
    assert.equal(ovApprove.body.spatial.hasTrueOverlap, true);
    assert.ok(ovApprove.body.spatial.trueOverlapCount >= 1);
    assert.equal(ovApprove.body.spatial.passed, false);
  });
});
