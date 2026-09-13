import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function POST(
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

  const ride = await store.getRide(id);
  // Cross-tenant IDOR protection: return 404 if not found in caller's tenant
  if (!ride || ride.organization_id !== ctx.org.id) {
    return problemResponse(404, 'Ride Not Found', 'The requested ride was not found.', 'NOT_FOUND', `/api/v1/rides/${id}/start`);
  }

  // Driver authorization check
  if (ride.driver_id !== ctx.user.id) {
    return problemResponse(403, 'Forbidden', 'Only the assigned driver can start this ride.', 'FORBIDDEN', `/api/v1/rides/${id}/start`);
  }

  try {
    const updatedRide = await store.startRideWithPessimisticLock(id, ctx.user.id);
    return NextResponse.json({ ride: updatedRide });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(409, 'Cannot Start Ride', errorMsg, 'INVALID_TRANSITION', `/api/v1/rides/${id}/start`);
  }
}
