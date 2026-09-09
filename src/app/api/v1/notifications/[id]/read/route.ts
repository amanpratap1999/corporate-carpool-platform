import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);
  const { id } = await params;

  const notification = store.notifications.get(id);
  if (!notification || notification.user_id !== ctx.user.id) {
    return problemResponse(404, 'Notification Not Found', 'The notification was not found.', 'NOT_FOUND', `/api/v1/notifications/${id}/read`);
  }

  notification.read_at = new Date().toISOString();
  store.notifications.set(id, notification);

  return NextResponse.json({ notification });
}
