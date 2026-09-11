import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  // Tenant isolation: only return users belonging to the caller's organization
  const tenantUsers = await Promise.all((await store.getAllUsers())
    .filter((u) => u.organization_id === ctx.org.id)
    .map(async (u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      work_department: u.work_department,
      capabilities: await store.getUserCapability(u.id),
    })));

  return NextResponse.json({
    id: ctx.user.id,
    organization_id: ctx.org.id,
    organization_name: ctx.org.name,
    email: ctx.user.email,
    full_name: ctx.user.full_name,
    work_department: ctx.user.work_department,
    work_location: ctx.user.work_location,
    capabilities: ctx.capabilities,
    available_users: tenantUsers,
  });
}
