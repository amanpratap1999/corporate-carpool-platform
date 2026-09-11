import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const { id } = await params;
  const store = getRepository();

  const notification = await store.getNotification(id);
  if (!notification || notification.organization_id !== ctx.org.id || notification.user_id !== ctx.user.id) {
    return problemResponse(404, 'Notification Not Found', 'The notification was not found.', 'NOT_FOUND', `/api/v1/notifications/${id}/read`);
  }

  notification.read_at = new Date().toISOString();
  await store.setNotification(notification);

  return NextResponse.json({ notification });
}
