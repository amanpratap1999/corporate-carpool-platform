import { NextRequest } from 'next/server';
import { getRepository } from '@/services/repository-factory';
import { problemResponse } from '@/services/api-context';
import { getAuthProvider } from '@/infrastructure/auth/auth-factory';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';
import { verifyPassword } from '@/lib/password';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Strict rate limit (5 attempts / min per IP)
  const rateLimit = rateLimiter.check(`login:${clientIp}`, 5, 60);
  if (!rateLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Login rate limit exceeded. Retry in ${rateLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      pathname,
      { 'Retry-After': String(rateLimit.resetSeconds) }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', pathname);
  }

  const { email, password } = body;

  if (!email || !password) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'email and password are required',
      'ERR_MISSING_CREDENTIALS',
      pathname
    );
  }

  const store = getRepository();
  const allUsers = await store.getAllUsers();
  const matchedUser = allUsers.find(
    (u) => u.email.toLowerCase() === email.toLowerCase().trim()
  );

  // Use a constant-time path for both "user not found" and "bad password"
  // to prevent user enumeration attacks.
  if (!matchedUser) {
    await verifyPassword(password, 'deadbeef:deadbeef');
    return problemResponse(401, 'Unauthorized', 'Invalid credentials', 'ERR_INVALID_CREDENTIALS', pathname);
  }

  if (!matchedUser.password_hash) {
    return problemResponse(
      401,
      'Unauthorized',
      'Account is not activated. Please use the invitation link to set your password first.',
      'ERR_ACCOUNT_NOT_ACTIVATED',
      pathname
    );
  }

  const valid = await verifyPassword(password, matchedUser.password_hash);
  if (!valid) {
    return problemResponse(401, 'Unauthorized', 'Invalid credentials', 'ERR_INVALID_CREDENTIALS', pathname);
  }

  if (matchedUser.status !== 'ACTIVE') {
    return problemResponse(
      403,
      'Forbidden',
      `Account is ${matchedUser.status.toLowerCase()}. Contact your organization administrator.`,
      'ERR_ACCOUNT_INACTIVE',
      pathname
    );
  }

  const caps = await store.getUserCapability(matchedUser.id) || {
    id: crypto.randomUUID(),
    user_id: matchedUser.id,
    organization_id: matchedUser.organization_id,
    can_ride: true,
    can_drive: false,
    is_org_admin: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const authProvider = getAuthProvider();
  const token = await authProvider.signToken({
    userId: matchedUser.id,
    organizationId: matchedUser.organization_id,
    email: matchedUser.email,
    capabilities: {
      can_ride: caps.can_ride,
      can_drive: caps.can_drive,
      is_org_admin: caps.is_org_admin,
    },
  });

  const response = Response.json({
    token,
    token_type: 'Bearer',
    expires_in: 86400,
    user: {
      id: matchedUser.id,
      email: matchedUser.email,
      full_name: matchedUser.full_name,
      status: matchedUser.status,
      work_department: matchedUser.work_department,
      organization_id: matchedUser.organization_id,
    },
    capabilities: {
      can_ride: caps.can_ride,
      can_drive: caps.can_drive,
      is_org_admin: caps.is_org_admin,
    },
  });

  response.headers.append(
    'Set-Cookie',
    `carpool_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );

  return response;
}
