import { describe, it, expect, beforeEach } from 'vitest';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';

describe('Gate 1: JWT & Dev Authentication Provider Tests', () => {
  const secret = 'test-secret-key-that-is-at-least-32-characters-long!';
  let jwtProvider: JwtAuthProvider;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'test-issuer');
  });

  it('signs and cryptographically verifies a valid JWT', async () => {
    const claims = {
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: 'org-test-uuid',
      email: 'alex@acme.corp',
      capabilities: {
        can_ride: true,
        can_drive: true,
        is_org_admin: false,
      },
    };

    const token = await jwtProvider.signToken(claims, 3600);
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const verified = await jwtProvider.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(claims.userId);
    expect(verified?.organizationId).toBe(claims.organizationId);
    expect(verified?.email).toBe(claims.email);
    expect(verified?.capabilities.can_drive).toBe(true);
    expect(verified?.iss).toBe('test-issuer');
  });

  it('rejects a token with a tampered signature', async () => {
    const claims = {
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: 'org-test-uuid',
      email: 'alex@acme.corp',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    };

    const token = await jwtProvider.signToken(claims, 3600);
    const parts = token.split('.');
    // Tamper with the payload (middle part)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...claims, userId: 'hacked-admin-id' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const verified = await jwtProvider.verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it('rejects an expired token', async () => {
    const claims = {
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: 'org-test-uuid',
      email: 'alex@acme.corp',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    };

    // Issue token with negative expiration (-10 seconds)
    const token = await jwtProvider.signToken(claims, -10);
    const verified = await jwtProvider.verifyToken(token);
    expect(verified).toBeNull();
  });

  it('rejects a token signed with an invalid secret', async () => {
    const otherProvider = new JwtAuthProvider('wrong-secret-key-different-than-original-32-chars!');
    const claims = {
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: 'org-test-uuid',
      email: 'alex@acme.corp',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    };

    const token = await otherProvider.signToken(claims, 3600);
    const verified = await jwtProvider.verifyToken(token);
    expect(verified).toBeNull();
  });
});
