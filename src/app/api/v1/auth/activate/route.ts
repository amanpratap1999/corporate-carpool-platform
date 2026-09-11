import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getRepository } from '@/services/repository-factory';
import { problemResponse } from '@/services/api-context';
import { getAuthProvider } from '@/infrastructure/auth/auth-factory';
import { createPasswordHash } from '@/lib/password';

import { ActivationError } from '@/services/repository.interface';

/**
 * POST /api/v1/auth/activate
 *
 * Activates a pending user account using a single-use invitation token.
 * Sets the user's password, marks them ACTIVE, clears the invitation token.
 * Concurrency-safe atomic activation with admin notification.
 *
 * Body: { token: string, password: string }
 */
export async function POST(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', pathname);
  }

  const { token, password } = body;

  if (!token || !password) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'token and password are required',
      'ERR_MISSING_FIELDS',
      pathname
    );
  }

  if (password.length < 10) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'Password must be at least 10 characters',
      'ERR_PASSWORD_TOO_SHORT',
      pathname
    );
  }

  const store = getRepository();

  try {
    // Hash the new password securely
    const password_hash = await createPasswordHash(password);

    // Atomically activate user using pessimistic locking / transaction
    const { user: activatedUser, capabilities: caps } = await store.activateUserWithPessimisticLock(
      token,
      password_hash
    );

    // Issue a token immediately so the user is logged in
    const authProvider = getAuthProvider();
    const jwtToken = await authProvider.signToken({
      userId: activatedUser.id,
      organizationId: activatedUser.organization_id,
      email: activatedUser.email,
      capabilities: {
        can_ride: caps.can_ride,
        can_drive: caps.can_drive,
        is_org_admin: caps.is_org_admin,
      },
    });

    const response = Response.json({
      message: 'Account activated successfully',
      token: jwtToken,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: activatedUser.id,
        email: activatedUser.email,
        full_name: activatedUser.full_name,
        status: activatedUser.status,
        organization_id: activatedUser.organization_id,
      },
    }, { status: 200 });

    response.headers.append(
      'Set-Cookie',
      `carpool_session=${jwtToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );

    return response;
  } catch (err: unknown) {
    if (err instanceof ActivationError) {
      return problemResponse(
        err.status,
        err.status === 410 ? 'Gone' : err.status === 409 ? 'Conflict' : 'Not Found',
        err.message,
        err.code,
        pathname
      );
    }
    const errorMsg = err instanceof Error ? err.message : 'Unknown activation error';
    return problemResponse(500, 'Internal Server Error', errorMsg, 'ERR_INTERNAL_ERROR', pathname);
  }
}
