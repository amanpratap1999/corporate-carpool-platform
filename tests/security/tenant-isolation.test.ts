import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin } from '../../src/services/api-context';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { Organization, User, UserCapability } from '../../src/domain/types';

const orgId = '11111111-1111-4111-8111-111111111111';
const alexId = '22222222-2222-4222-8222-222222222222';
const sarahId = '33333333-3333-4333-8333-333333333333';
const marcusId = '66666666-6666-4666-8666-666666666666';

function makeStore(): DataStore {
  const store = new DataStore();

  const org: Organization = {
    id: orgId, name: 'Acme Corp', slug: 'acme-corp',
    allowed_email_domains: ['@acme.com', '@acme.corp'],
    settings: { max_detour_meters: 3000, auto_complete_hours_after: 4 },
    is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  store.organizations.set(org.id, org);

  const users: User[] = [
    {
      id: alexId, organization_id: orgId, full_name: 'Alex Rivera',
      email: 'alex.rivera@acme.com', phone_number: '+11234567890',
      status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: sarahId, organization_id: orgId, full_name: 'Sarah Chen',
      email: 'sarah.chen@acme.com', phone_number: '+10987654321',
      status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: marcusId, organization_id: orgId, full_name: 'Marcus Vance',
      email: 'marcus.vance@acme.com', phone_number: '+11111111111',
      status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  for (const u of users) store.users.set(u.id, u);

  const caps: UserCapability[] = [
    { id: alexId, user_id: alexId, organization_id: orgId, can_ride: true, can_drive: true, is_org_admin: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: sarahId, user_id: sarahId, organization_id: orgId, can_ride: true, can_drive: false, is_org_admin: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: marcusId, user_id: marcusId, organization_id: orgId, can_ride: true, can_drive: false, is_org_admin: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  for (const c of caps) store.userCapabilities.set(c.user_id, c);

  return store;
}

describe('Gate 1: Tenant Isolation & Authentication Security Tests', () => {
  const secret = 'isolation-test-secret-at-least-32-chars-long!';
  let jwtProvider: JwtAuthProvider;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'isolation-test');
    setAuthProvider(jwtProvider);
    // Inject fresh in-memory store — no DATABASE_URL needed
    setRepository(makeStore());
  });

  it('rejects unauthenticated requests with HTTP 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/me');
    const result = await requireAuth(req);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.code).toBe('ERR_UNAUTHORIZED');
    }
  });

  it('strictly ignores raw x-user-id headers and still requires Authorization header', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/me', {
      headers: {
        'x-user-id': alexId,
        'x-organization-id': orgId,
      },
    });

    const result = await requireAuth(req);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(401);
    }
  });

  it('authenticates valid Bearer token and returns verified RequestContext', async () => {
    const token = await jwtProvider.signToken({
      userId: alexId,
      organizationId: orgId,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/me', {
      headers: { authorization: `Bearer ${token}` },
    });

    const result = await requireAuth(req);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ctx.user.id).toBe(alexId);
      expect(result.ctx.org.id).toBe(orgId);
      expect(result.ctx.capabilities.can_drive).toBe(true);
    }
  });

  it('detects and blocks cross-tenant mismatch between user and token claims', async () => {
    const foreignOrgId = '99999999-9999-4999-8999-999999999999';

    const token = await jwtProvider.signToken({
      userId: alexId,
      organizationId: foreignOrgId,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/me', {
      headers: { authorization: `Bearer ${token}` },
    });

    const result = await requireAuth(req);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.code).toBe('ERR_TENANT_MISMATCH');
    }
  });

  it('enforces RBAC: non-admin receives 403 Forbidden on requireAdmin', async () => {
    const token = await jwtProvider.signToken({
      userId: sarahId,
      organizationId: orgId,
      email: 'sarah.chen@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: false },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/audit-logs', {
      headers: { authorization: `Bearer ${token}` },
    });

    const result = await requireAdmin(req);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.code).toBe('ERR_FORBIDDEN_NOT_ADMIN');
    }
  });

  it('allows organization administrators through requireAdmin', async () => {
    const token = await jwtProvider.signToken({
      userId: marcusId,
      organizationId: orgId,
      email: 'marcus.vance@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/audit-logs', {
      headers: { authorization: `Bearer ${token}` },
    });

    const result = await requireAdmin(req);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ctx.capabilities.is_org_admin).toBe(true);
    }
  });
});
