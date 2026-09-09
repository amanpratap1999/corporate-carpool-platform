import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const logs = store.auditLogs
    .filter((l) => l.organization_id === ctx.org.id)
    .map((l) => {
      const actor = l.actor_user_id ? store.users.get(l.actor_user_id) : undefined;
      return {
        ...l,
        actor_name: actor ? actor.full_name : 'System',
        actor_email: actor ? actor.email : 'system@internal',
      };
    });

  return NextResponse.json({ logs });
}
