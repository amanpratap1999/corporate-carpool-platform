import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { Organization, User, UserCapability, Vehicle } from '../../src/domain/types';

import { POST as inviteHandler } from '../../src/app/api/v1/admin/users/invite/route';
import { GET as getUsersHandler } from '../../src/app/api/v1/admin/users/route';
import { GET as getVehiclesHandler } from '../../src/app/api/v1/admin/vehicles/route';
import { DELETE as deleteVehicleHandler } from '../../src/app/api/v1/admin/vehicles/[id]/route';
import { GET as getAuditLogsHandler } from '../../src/app/api/v1/audit-logs/route';

const ORG_A_ID = '11111111-1111-4111-8111-111111111111';
const ORG_B_ID = '22222222-2222-4222-8222-222222222222';

const ADMIN_A_ID = '33333333-3333-4333-8333-333333333333';
const RIDER_A_ID = '44444444-4444-4444-8444-444444444444';
const USER_B_ID  = '55555555-5555-4555-8555-555555555555';

const VEHICLE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeStore(): DataStore {
  const store = new DataStore();

  const orgA: Organization = {
    id: ORG_A_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    allowed_email_domains: ['@acme.com', '@acme.corp'],
    settings: { max_detour_meters: 3000 },
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const orgB: Organization = {
    id: ORG_B_ID,
    name: 'Beta Industries',
    slug: 'beta-ind',
    allowed_email_domains: ['@beta.com'],
    settings: { max_detour_meters: 3000 },
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  store.organizations.set(orgA.id, orgA);
  store.organizations.set(orgB.id, orgB);

  const users: User[] = [
    {
      id: ADMIN_A_ID,
      organization_id: ORG_A_ID,
      full_name: 'Marcus Vance',
      email: 'marcus.vance@acme.com',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: RIDER_A_ID,
      organization_id: ORG_A_ID,
      full_name: 'Sarah Chen',
      email: 'sarah.chen@acme.com',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: USER_B_ID,
      organization_id: ORG_B_ID,
      full_name: 'Bob Beta',
      email: 'bob@beta.com',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  for (const u of users) store.users.set(u.id, u);

  const caps: UserCapability[] = [
    {
      id: ADMIN_A_ID,
      user_id: ADMIN_A_ID,
      organization_id: ORG_A_ID,
      can_ride: true,
      can_drive: false,
      is_org_admin: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: RIDER_A_ID,
      user_id: RIDER_A_ID,
      organization_id: ORG_A_ID,
      can_ride: true,
      can_drive: false,
      is_org_admin: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: USER_B_ID,
      user_id: USER_B_ID,
      organization_id: ORG_B_ID,
      can_ride: true,
      can_drive: true,
      is_org_admin: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  for (const c of caps) store.userCapabilities.set(c.user_id, c);

  const vehicleA: Vehicle = {
    id: VEHICLE_A_ID,
    organization_id: ORG_A_ID,
    owner_id: ADMIN_A_ID,
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    color: 'White',
    license_plate: 'TESLA1',
    total_seats: 5,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const vehicleB: Vehicle = {
    id: VEHICLE_B_ID,
    organization_id: ORG_B_ID,
    owner_id: USER_B_ID,
    make: 'Honda',
    model: 'Civic',
    year: 2021,
    color: 'Blue',
    license_plate: 'BETA99',
    total_seats: 5,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  store.vehicles.set(vehicleA.id, vehicleA);
  store.vehicles.set(vehicleB.id, vehicleB);

  store.auditLogs.push({
    id: 'audit-org-a',
    organization_id: ORG_A_ID,
    actor_user_id: ADMIN_A_ID,
    entity_type: 'USER',
    entity_id: ADMIN_A_ID,
    action: 'CREATE',
    metadata_json: {},
    created_at: '2026-01-01T00:00:00Z',
  });
  store.auditLogs.push({
    id: 'audit-org-b',
    organization_id: ORG_B_ID,
    actor_user_id: USER_B_ID,
    entity_type: 'USER',
    entity_id: USER_B_ID,
    action: 'CREATE',
    metadata_json: {},
    created_at: '2026-01-01T00:00:00Z',
  });

  return store;
}

describe('Admin Authorization & Tenant Security', () => {
  const secret = 'admin-test-secret-at-least-32-chars-long!';
  let jwtProvider: JwtAuthProvider;
  let store: DataStore;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'carpool-test');
    setAuthProvider(jwtProvider);
    store = makeStore();
    setRepository(store);
  });

  afterEach(() => {
    setRepository(null);
    setAuthProvider(null);
  });

  // --------------------------------------------------------------------------
  // 1. Unauthenticated Requests (HTTP 401)
  // --------------------------------------------------------------------------
  describe('Unauthenticated access', () => {
    it('returns 401 for unauthenticated POST /api/v1/admin/users/invite', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@acme.com', full_name: 'New Colleague' }),
      });
      const res = await inviteHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/v1/admin/users', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users');
      const res = await getUsersHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/v1/admin/vehicles', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/vehicles');
      const res = await getVehiclesHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated DELETE /api/v1/admin/vehicles/:id', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_A_ID}`, {
        method: 'DELETE',
      });
      const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_A_ID }) });
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/v1/audit-logs', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-logs');
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Non-Admin Authenticated Requests (HTTP 403)
  // --------------------------------------------------------------------------
  describe('Non-admin forbidden access', () => {
    let riderToken: string;

    beforeEach(async () => {
      riderToken = await jwtProvider.signToken({
        userId: RIDER_A_ID,
        organizationId: ORG_A_ID,
        email: 'sarah.chen@acme.com',
        capabilities: { can_ride: true, can_drive: false, is_org_admin: false },
      });
    });

    it('returns 403 for non-admin POST /api/v1/admin/users/invite', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${riderToken}`,
        },
        body: JSON.stringify({ email: 'new@acme.com', full_name: 'New Colleague' }),
      });
      const res = await inviteHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('ERR_FORBIDDEN_NOT_ADMIN');
    });

    it('returns 403 for non-admin GET /api/v1/admin/users', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${riderToken}` },
      });
      const res = await getUsersHandler(req);
      expect(res.status).toBe(403);
    });

    it('returns 403 for non-admin GET /api/v1/admin/vehicles', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/vehicles', {
        headers: { Authorization: `Bearer ${riderToken}` },
      });
      const res = await getVehiclesHandler(req);
      expect(res.status).toBe(403);
    });

    it('returns 403 for non-admin DELETE /api/v1/admin/vehicles/:id', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_A_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${riderToken}` },
      });
      const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_A_ID }) });
      expect(res.status).toBe(403);
    });

    it('returns 403 for non-admin GET /api/v1/audit-logs', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-logs', {
        headers: { Authorization: `Bearer ${riderToken}` },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Capability Spoofing Protection (Database capability verification)
  // --------------------------------------------------------------------------
  describe('Capability spoofing protection', () => {
    it('rejects caller whose JWT claims is_org_admin: true but DB has is_org_admin: false', async () => {
      // Sarah Chen has is_org_admin: false in DB, but attacker forged JWT claim
      const spoofedToken = await jwtProvider.signToken({
        userId: RIDER_A_ID,
        organizationId: ORG_A_ID,
        email: 'sarah.chen@acme.com',
        capabilities: { can_ride: true, can_drive: false, is_org_admin: true }, // forged claim!
      });

      const req = new NextRequest('http://localhost:3000/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${spoofedToken}` },
      });
      const res = await getUsersHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('ERR_FORBIDDEN_NOT_ADMIN');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Tenant Isolation Enforcement
  // --------------------------------------------------------------------------
  describe('Tenant isolation on admin endpoints', () => {
    let adminToken: string;

    beforeEach(async () => {
      adminToken = await jwtProvider.signToken({
        userId: ADMIN_A_ID,
        organizationId: ORG_A_ID,
        email: 'marcus.vance@acme.com',
        capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
      });
    });

    it('only returns users for the admin tenant in GET /api/v1/admin/users', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await getUsersHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users.length).toBe(2);
      expect(data.users.every((u: any) => u.email.endsWith('@acme.com'))).toBe(true);
      expect(data.users.some((u: any) => u.email === 'bob@beta.com')).toBe(false);
    });

    it('only returns vehicles for the admin tenant in GET /api/v1/admin/vehicles', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/vehicles', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await getVehiclesHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.vehicles.length).toBe(1);
      expect(data.vehicles[0].id).toBe(VEHICLE_A_ID);
      expect(data.vehicles.some((v: any) => v.id === VEHICLE_B_ID)).toBe(false);
    });

    it('only returns audit logs for the admin tenant in GET /api/v1/audit-logs', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await getAuditLogsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs.length).toBe(1);
      expect(data.logs[0].id).toBe('audit-org-a');
      expect(data.logs.some((l: any) => l.organization_id === ORG_B_ID)).toBe(false);
    });

    it('returns 404 when admin tries to delete a vehicle belonging to another tenant', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_B_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_B_ID }) });
      expect(res.status).toBe(404);
      // Ensure vehicle B is still active
      const vehB = await store.getVehicle(VEHICLE_B_ID);
      expect(vehB?.status).toBe('ACTIVE');
    });

    it('ignores client-provided organization_id in POST /api/v1/admin/users/invite', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email: 'newbie@acme.com',
          full_name: 'Newbie Acme',
          organization_id: ORG_B_ID, // attempted cross-tenant injection!
        }),
      });
      const res = await inviteHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user.organization_id).toBe(ORG_A_ID); // strictly bound to admin's tenant
    });
  });
});
