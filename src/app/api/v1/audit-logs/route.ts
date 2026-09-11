import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  const logs = await Promise.all((await store.getAllAuditLogs())
    .filter((l) => l.organization_id === ctx.org.id)
    .map(async (l) => {
      const actor = l.actor_user_id ? await store.getUser(l.actor_user_id) : undefined;
      return {
        ...l,
        actor_name: actor ? actor.full_name : 'System',
        actor_email: actor ? actor.email : 'system@internal',
      };
    }));

  return NextResponse.json({ logs });
}
