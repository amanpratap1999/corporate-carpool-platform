import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as searchRides } from '../../src/app/api/v1/rides/search/route';
import { POST as acceptRequest } from '../../src/app/api/v1/ride-requests/[id]/accept/route';
import { POST as inviteUser } from '../../src/app/api/v1/admin/users/invite/route';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { setupTestRepository, SARAH_ID, MARCUS_ID, ORG_ID } from '../helpers/seed-fixture';

describe('Gate 1: PII Masking, IDOR Defense, and Corporate Domain Tests', () => {
  const secret = 'pii-idor-test-secret-at-least-32-chars-long!';
  let jwtProvider: JwtAuthProvider;
  let store: ReturnType<typeof setupTestRepository>;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'pii-test');
    setAuthProvider(jwtProvider);
    store = setupTestRepository();
  });

  it('masks driver phone number and email in public search results', async () => {
    const token = await jwtProvider.signToken({
      userId: SARAH_ID,
      organizationId: ORG_ID,
      email: 'sarah.chen@acme.corp',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: false },
    });

    // Search for tomorrow's rides on the seeded SF→MV corridor
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const url = `http://localhost:3000/api/v1/rides/search?origin_lat=37.7749&origin_lng=-122.4194&dest_lat=37.422&dest_lng=-122.0841&date=${tomorrowStr}`;
    const req = new NextRequest(url, {
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await searchRides(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rides).toBeDefined();
    if (data.rides.length > 0) {
      const firstResult = data.rides[0];
      // Phone number must NOT be exposed in search results
      expect(firstResult.driver.phone_number).toBeUndefined();
      // Email must be masked
      expect(firstResult.driver.email).toContain('***');
    }
  });

  it('returns HTTP 404 on cross-tenant IDOR attempts (preventing ID enumeration)', async () => {
    // Add a foreign org and user directly to the store
    const foreignOrgId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const foreignUserId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    store.organizations.set(foreignOrgId, {
      id: foreignOrgId, name: 'Globex Inc', slug: 'globex',
      allowed_email_domains: ['globex.com'], settings: {},
      is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });

    store.users.set(foreignUserId, {
      id: foreignUserId, organization_id: foreignOrgId,
      email: 'hacker@globex.com', full_name: 'Foreign User',
      status: 'ACTIVE', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });

    const token = await jwtProvider.signToken({
      userId: foreignUserId,
      organizationId: foreignOrgId,
      email: 'hacker@globex.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    // Grab a request belonging to Acme Corp (seeded)
    const acmeRequest = Array.from(store.rideRequests.values())[0];
    expect(acmeRequest).toBeDefined();

    const req = new NextRequest(`http://localhost:3000/api/v1/ride-requests/${acmeRequest.id}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await acceptRequest(req, {
      params: Promise.resolve({ id: acmeRequest.id }),
    });

    // Must return 404, not 403 or 200, to prevent ID enumeration
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('validates corporate email domain during employee invitation', async () => {
    const token = await jwtProvider.signToken({
      userId: MARCUS_ID,
      organizationId: ORG_ID,
      email: 'marcus.vance@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
    });

    // 1. Attempt to invite with invalid public domain (e.g. gmail.com)
    const invalidReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'attacker@gmail.com',
        full_name: 'Attacker Impersonator',
      }),
    });

    const invalidRes = await inviteUser(invalidReq);
    expect(invalidRes.status).toBe(422);
    const invalidBody = await invalidRes.json();
    expect(invalidBody.code).toBe('ERR_INVALID_EMAIL_DOMAIN');

    // 2. Invite with valid corporate domain
    const validReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'new.engineer@acme.corp',
        full_name: 'New Engineer',
        work_department: 'Engineering',
      }),
    });

    const validRes = await inviteUser(validReq);
    expect(validRes.status).toBe(201);
    const validBody = await validRes.json();
    expect(validBody.invitation.token).toBeDefined();
    expect(validBody.user.email).toBe('new.engineer@acme.corp');
  });
});
