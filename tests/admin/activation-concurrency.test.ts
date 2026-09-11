import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { Organization, User, UserCapability } from '../../src/domain/types';

import { POST as inviteHandler } from '../../src/app/api/v1/admin/users/invite/route';
import { POST as activateHandler } from '../../src/app/api/v1/auth/activate/route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_2_ID = '33333333-3333-4333-8333-333333333333';

function makeStore(): DataStore {
  const store = new DataStore();

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    allowed_email_domains: ['@acme.com'],
    settings: {},
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  store.organizations.set(org.id, org);

  const adminUser: User = {
    id: ADMIN_ID,
    organization_id: ORG_ID,
    full_name: 'Primary Admin',
    email: 'admin@acme.com',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  const admin2User: User = {
    id: ADMIN_2_ID,
    organization_id: ORG_ID,
    full_name: 'Secondary Admin',
    email: 'admin2@acme.com',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  store.users.set(adminUser.id, adminUser);
  store.users.set(admin2User.id, admin2User);

  store.userCapabilities.set(ADMIN_ID, {
    id: ADMIN_ID,
    user_id: ADMIN_ID,
    organization_id: ORG_ID,
    can_ride: true,
    can_drive: false,
    is_org_admin: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  store.userCapabilities.set(ADMIN_2_ID, {
    id: ADMIN_2_ID,
    user_id: ADMIN_2_ID,
    organization_id: ORG_ID,
    can_ride: true,
    can_drive: false,
    is_org_admin: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });

  return store;
}

describe('Invitation Creation & Concurrency-Safe Activation', () => {
  const secret = 'activation-test-secret-at-least-32-chars!';
  let jwtProvider: JwtAuthProvider;
  let store: DataStore;
  let adminToken: string;

  beforeEach(async () => {
    jwtProvider = new JwtAuthProvider(secret, 'carpool-test');
    setAuthProvider(jwtProvider);
    store = makeStore();
    setRepository(store);

    adminToken = await jwtProvider.signToken({
      userId: ADMIN_ID,
      organizationId: ORG_ID,
      email: 'admin@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
    });
  });

  afterEach(() => {
    setRepository(null);
    setAuthProvider(null);
  });

  it('admin creates an invitation: stores SHA-256 hash and never raw token in DB or audit logs', async () => {
    const inviteReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'employee@acme.com',
        full_name: 'Jane Colleague',
        work_department: 'Engineering',
        can_drive: true,
      }),
    });

    const res = await inviteHandler(inviteReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invitation.token).toBeDefined();
    const rawToken = data.invitation.token;

    // Verify user in store
    const invitedUser = await store.getUser(data.user.id);
    expect(invitedUser).toBeDefined();
    expect(invitedUser?.status).toBe('PENDING_VERIFICATION');

    // Database must store SHA-256 hash, NOT the raw token
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expect(invitedUser?.invitation_token).toBe(expectedHash);
    expect(invitedUser?.invitation_token).not.toBe(rawToken);

    // Verify audit logs do not contain raw token
    const auditLogs = await store.getAllAuditLogs();
    for (const log of auditLogs) {
      const logStr = JSON.stringify(log);
      expect(logStr).not.toContain(rawToken);
    }
  });

  it('activates user successfully, clears tokens, and notifies all organization admins', async () => {
    // 1. Generate invitation
    const inviteReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'activateme@acme.com',
        full_name: 'Active User',
      }),
    });
    const inviteRes = await inviteHandler(inviteReq);
    const inviteData = await inviteRes.json();
    const rawToken = inviteData.invitation.token;
    const userId = inviteData.user.id;

    // Clear existing notifications
    store.notifications.clear();

    // 2. Activate user
    const actReq = new NextRequest('http://localhost:3000/api/v1/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        password: 'ValidSuperPassword123!',
      }),
    });
    const actRes = await activateHandler(actReq);
    expect(actRes.status).toBe(200);
    const actData = await actRes.json();
    expect(actData.token).toBeDefined();
    expect(actData.user.status).toBe('ACTIVE');

    // 3. User record state in store
    const updatedUser = await store.getUser(userId);
    expect(updatedUser?.status).toBe('ACTIVE');
    expect(updatedUser?.invitation_token).toBeUndefined();
    expect(updatedUser?.invitation_token_expires_at).toBeUndefined();
    expect(updatedUser?.password_hash).toBeDefined();

    // 4. Admin notifications created with USER_JOINED
    const allNotifs = Array.from(store.notifications.values());
    const admin1Notif = allNotifs.find((n) => n.user_id === ADMIN_ID && n.type === 'USER_JOINED');
    const admin2Notif = allNotifs.find((n) => n.user_id === ADMIN_2_ID && n.type === 'USER_JOINED');

    expect(admin1Notif).toBeDefined();
    expect(admin2Notif).toBeDefined();
    expect(admin1Notif?.title).toBe('New employee joined');
    expect(admin1Notif?.body).toContain('Active User');
  });

  it('rejects expired invitation token with HTTP 410 Gone', async () => {
    // Manually insert an expired invited user
    const rawToken = 'expired-token-1234567890';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiredUser: User = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      full_name: 'Expired Colleague',
      email: 'expired@acme.com',
      status: 'PENDING_VERIFICATION',
      invitation_token: tokenHash,
      invitation_token_expires_at: new Date(Date.now() - 3600 * 1000).toISOString(), // expired 1h ago
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    await store.setUser(expiredUser);

    const actReq = new NextRequest('http://localhost:3000/api/v1/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        password: 'ValidPassword123!',
      }),
    });
    const actRes = await activateHandler(actReq);
    expect(actRes.status).toBe(410);
    const body = await actRes.json();
    expect(body.code).toBe('ERR_TOKEN_EXPIRED');
  });

  it('rejects invalid or already-used token with HTTP 404', async () => {
    const actReq = new NextRequest('http://localhost:3000/api/v1/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'non-existent-token-xyz',
        password: 'ValidPassword123!',
      }),
    });
    const actRes = await activateHandler(actReq);
    expect(actRes.status).toBe(404);
  });

  it('atomic concurrency: multiple concurrent activation requests succeed exactly once', async () => {
    // 1. Generate invitation
    const inviteReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'racer@acme.com',
        full_name: 'Race Condition Test',
      }),
    });
    const inviteRes = await inviteHandler(inviteReq);
    const inviteData = await inviteRes.json();
    const rawToken = inviteData.invitation.token;

    // 2. Fire 5 concurrent activation requests with the identical token
    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/v1/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: 'ValidPassword123!',
        }),
      });

    const responses = await Promise.all([
      activateHandler(makeReq()),
      activateHandler(makeReq()),
      activateHandler(makeReq()),
      activateHandler(makeReq()),
      activateHandler(makeReq()),
    ]);

    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200);
    const failures = statuses.filter((s) => s === 404 || s === 409);

    // Exactly one must succeed
    expect(successes.length).toBe(1);
    // All others must fail
    expect(failures.length).toBe(4);
  });
});
