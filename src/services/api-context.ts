/**
 * API Context & Security Middleware: Extracts verified tenant and actor context
 * Validates cryptographically signed JWT or dev session tokens.
 * Client-controlled X-User-Id and X-Organization-Id headers are strictly rejected/ignored.
 */

import { NextRequest } from 'next/server';
import { getRepository } from './repository-factory';
import { User, Organization, UserCapability } from '../domain/types';
import { getAuthProvider } from '../infrastructure/auth/auth-factory';
import { rateLimiter } from '../infrastructure/security/rate-limiter';

export interface RequestContext {
  org: Organization;
  user: User;
  capabilities: UserCapability;
}

export type AuthResult =
  | { success: true; ctx: RequestContext }
  | { success: false; response: Response };

export function problemResponse(
  status: number,
  title: string,
  detail: string,
  code: string,
  instance: string,
  headers?: Record<string, string>
): Response {
  return Response.json(
    {
      type: `https://api.carpool.corp/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      code,
      instance,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        ...headers,
      },
    }
  );
}

/**
 * Extracts and cryptographically verifies the Bearer token from the request.
 * Enforces authentication and resolves the verified actor and tenant context.
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const pathname = req.nextUrl.pathname;

  // 1. Extract token from Authorization header or cookie
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies.has('carpool_session')) {
    token = req.cookies.get('carpool_session')?.value || null;
  }

  // 2. Reject unauthenticated requests
  if (!token) {
    return {
      success: false,
      response: problemResponse(
        401,
        'Unauthorized',
        'Valid cryptographic Bearer token or carpool_session cookie is required',
        'ERR_UNAUTHORIZED',
        pathname
      ),
    };
  }

  // 3. Cryptographically verify token claims
  const authProvider = getAuthProvider();
  const claims = await authProvider.verifyToken(token);

  if (!claims || !claims.userId || !claims.organizationId) {
    return {
      success: false,
      response: problemResponse(
        401,
        'Unauthorized',
        'Token signature verification failed or token has expired',
        'ERR_TOKEN_INVALID',
        pathname
      ),
    };
  }

  // 4. Rate limiting check per authenticated user (120 req/min general limit)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const userRateLimit = await rateLimiter.checkShared(`user:${claims.userId}`, 120, 60);
  if (!userRateLimit.allowed) {
    return {
      success: false,
      response: problemResponse(
        429,
        'Too Many Requests',
        `User rate limit exceeded. Retry in ${userRateLimit.resetSeconds}s`,
        'ERR_RATE_LIMIT_EXCEEDED',
        pathname,
        { 'Retry-After': String(userRateLimit.resetSeconds) }
      ),
    };
  }

  // 5. Resolve user and tenant from store
  const store = getRepository();
  const user = await store.getUser(claims.userId);
  if (!user) {
    return {
      success: false,
      response: problemResponse(
        401,
        'Unauthorized',
        'User account associated with this token was not found',
        'ERR_USER_NOT_FOUND',
        pathname
      ),
    };
  }

  // Cross-tenant verification: Ensure user belongs to the claimed organization
  if (user.organization_id !== claims.organizationId) {
    return {
      success: false,
      response: problemResponse(
        403,
        'Forbidden',
        'User does not belong to the claimed organization tenant',
        'ERR_TENANT_MISMATCH',
        pathname
      ),
    };
  }

  const org = await store.getOrganization(claims.organizationId);
  if (!org) {
    return {
      success: false,
      response: problemResponse(
        404,
        'Organization Not Found',
        'Claimed tenant organization does not exist',
        'ERR_ORG_NOT_FOUND',
        pathname
      ),
    };
  }

  // 6. Resolve capabilities from authoritative server-side store
  // NEVER trust client-provided claims or tokens for administrative privileges
  let capabilities = await store.getUserCapability(user.id);
  if (!capabilities) {
    capabilities = {
      id: crypto.randomUUID(),
      user_id: user.id,
      organization_id: org.id,
      can_ride: true,
      can_drive: false,
      is_org_admin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return {
    success: true,
    ctx: {
      org,
      user,
      capabilities,
    },
  };
}

/**
 * Enforces both authentication and administrator privileges (is_org_admin)
 * Authoritative capability check directly against the server-side database.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth;
  }

  // Authoritative capability check from already-verified context
  const cap = auth.ctx.capabilities;
  if (!cap || !cap.is_org_admin || cap.organization_id !== auth.ctx.org.id) {
    return {
      success: false,
      response: problemResponse(
        403,
        'Forbidden',
        'Organization administrator capability is required for this operation',
        'ERR_FORBIDDEN_NOT_ADMIN',
        req.nextUrl.pathname
      ),
    };
  }

  return auth;
}
