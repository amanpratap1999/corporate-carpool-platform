import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const userNotifications = Array.from(store.notifications.values())
    .filter((n) => n.user_id === ctx.user.id && n.organization_id === ctx.org.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const unreadCount = userNotifications.filter((n) => !n.read_at).length;

  return NextResponse.json({
    notifications: userNotifications,
    unread_count: unreadCount,
  });
}
