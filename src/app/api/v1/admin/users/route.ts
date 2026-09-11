import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  try {
    const searchParams = req.nextUrl.searchParams;
    const statusFilter = searchParams.get('status')?.toUpperCase();
    const query = searchParams.get('q')?.toLowerCase() || searchParams.get('search')?.toLowerCase();

    const allUsers = await store.getAllUsers();
    // Enforce tenant isolation strictly: only return users for caller's organization
    let orgUsers = allUsers.filter((u) => u.organization_id === ctx.org.id);

    if (statusFilter) {
      orgUsers = orgUsers.filter((u) => u.status === statusFilter);
    }

    if (query) {
      orgUsers = orgUsers.filter(
        (u) =>
          u.full_name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (u.work_department && u.work_department.toLowerCase().includes(query))
      );
    }

    // Attach capabilities and strip all sensitive fields (no password_hash, no invitation_token)
    const safeUsers = await Promise.all(
      orgUsers.map(async (u) => {
        const cap = await store.getUserCapability(u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          status: u.status,
          department: u.work_department || 'General',
          location: u.work_location || 'HQ',
          created_at: u.created_at,
          updated_at: u.updated_at,
          is_org_admin: cap ? cap.is_org_admin : false,
          can_drive: cap ? cap.can_drive : false,
          can_ride: cap ? cap.can_ride : true,
        };
      })
    );

    return NextResponse.json({
      users: safeUsers,
      total: safeUsers.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve users';
    return problemResponse(500, 'Internal Server Error', errorMsg, 'ERR_INTERNAL_ERROR', req.nextUrl.pathname);
  }
}
