/**
 * API Context helper: extracts tenant and actor info
 * Supports X-User-Id and X-Organization-Id headers for role-switching in Web UI
 */

import { NextRequest } from 'next/server';
import { initializeSeedData } from './seed-data';
import { User, Organization, UserCapability } from '../domain/types';

export interface RequestContext {
  org: Organization;
  user: User;
  capabilities: UserCapability;
}

export function getRequestContext(req: NextRequest): RequestContext {
  const store = initializeSeedData();

  // Default to Alex Rivera if not specified
  const requestedUserId =
    req.headers.get('x-user-id') || '22222222-2222-4222-8222-222222222222';
  const requestedOrgId =
    req.headers.get('x-organization-id') || '11111111-1111-4111-8111-111111111111';

  let user = store.users.get(requestedUserId);
  if (!user) {
    user = Array.from(store.users.values())[0];
  }

  let org = store.organizations.get(requestedOrgId);
  if (!org) {
    org = Array.from(store.organizations.values())[0];
  }

  let capabilities = store.userCapabilities.get(user.id);
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

  return { org, user, capabilities };
}

export function problemResponse(
  status: number,
  title: string,
  detail: string,
  code: string,
  instance: string
) {
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
      headers: { 'Content-Type': 'application/problem+json' },
    }
  );
}
