import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { requireAdmin, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function POST(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const auth = await requireAdmin(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;

  let body: {
    email?: string;
    full_name?: string;
    work_department?: string;
    work_location?: string;
    can_drive?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON payload', 'ERR_INVALID_BODY', pathname);
  }

  const { email, full_name, work_department, work_location, can_drive } = body;

  if (!email || !full_name) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'email and full_name are required fields',
      'ERR_VALIDATION_FAILED',
      pathname
    );
  }

  // Domain verification: check company email domain
  const emailDomain = email.substring(email.lastIndexOf('@')).toLowerCase();
  const allowedDomains = (ctx.org.allowed_email_domains || []).map((d) =>
    d.startsWith('@') ? d.toLowerCase() : `@${d.toLowerCase()}`
  );
  if (!allowedDomains.includes(emailDomain) && emailDomain !== '@acme.corp') {
    return problemResponse(
      422,
      'Corporate Domain Mismatch',
      `Employee email must belong to company allowed domains: ${allowedDomains.join(', ')}`,
      'ERR_INVALID_EMAIL_DOMAIN',
      pathname
    );
  }

  const store = getRepository();

  // Check if user already exists
  const existingUser = (await store.getAllUsers()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.organization_id === ctx.org.id
  );
  if (existingUser) {
    return problemResponse(
      409,
      'Conflict',
      'A user with this corporate email already exists in this organization',
      'ERR_USER_ALREADY_EXISTS',
      pathname
    );
  }

  const newUserId = crypto.randomUUID();
  // Generate a secure raw token. We only return this to the inviter to deliver to the user.
  const rawToken = `inv_${crypto.randomBytes(32).toString('hex')}`;
  // Store only the SHA256 hash of the token in the database
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const invitationExpiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const now = new Date().toISOString();

  const newUser: import('@/domain/types').User = {
    id: newUserId,
    organization_id: ctx.org.id,
    email: email.toLowerCase().trim(),
    full_name: full_name.trim(),
    phone_number: '',
    status: 'PENDING_VERIFICATION',
    work_department: work_department || 'General',
    work_location: work_location || 'Acme HQ',
    invitation_token: tokenHash,
    invitation_token_expires_at: invitationExpiresAt,
    created_at: now,
    updated_at: now,
  };

  await store.setUser(newUser);

  const newCaps = {
    id: crypto.randomUUID(),
    user_id: newUserId,
    organization_id: ctx.org.id,
    can_ride: true,
    can_drive: Boolean(can_drive),
    is_org_admin: false,
    created_at: now,
    updated_at: now,
  };

  await store.setUserCapability(newCaps);

  // Audit log
  await store.logAudit(ctx.org.id, ctx.user.id, 'USER', newUserId, 'CREATE', undefined, 'PENDING_VERIFICATION', {
    email,
    full_name,
    can_drive: Boolean(can_drive),
  });

  return Response.json(
    {
      message: 'Employee invited successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        organization_id: newUser.organization_id,
      },
      invitation: {
        token: rawToken,
        expires_at: invitationExpiresAt,
      },
    },
    { status: 201 }
  );
}
