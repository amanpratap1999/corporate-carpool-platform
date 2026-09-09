import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const allUsers = Array.from(store.users.values()).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    work_department: u.work_department,
    capabilities: store.userCapabilities.get(u.id),
  }));

  return NextResponse.json({
    id: ctx.user.id,
    organization_id: ctx.org.id,
    organization_name: ctx.org.name,
    email: ctx.user.email,
    full_name: ctx.user.full_name,
    work_department: ctx.user.work_department,
    work_location: ctx.user.work_location,
    capabilities: ctx.capabilities,
    available_users: allUsers,
  });
}
