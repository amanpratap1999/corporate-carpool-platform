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

  const userNotifications = (await store.getAllNotifications())
    .filter((n) => n.user_id === ctx.user.id && n.organization_id === ctx.org.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const unreadCount = userNotifications.filter((n) => !n.read_at).length;

  return NextResponse.json({
    notifications: userNotifications,
    unread_count: unreadCount,
  });
}
