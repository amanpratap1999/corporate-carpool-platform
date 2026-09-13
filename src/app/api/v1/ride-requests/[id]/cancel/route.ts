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
  const { id: requestId } = await params;
  const store = getRepository();

  const request = await store.getRideRequest(requestId);
  // Cross-tenant IDOR protection: return 404 if not found in caller's tenant
  if (!request || request.organization_id !== ctx.org.id) {
    return problemResponse(404, 'Request Not Found', 'The requested ride request was not found.', 'NOT_FOUND', `/api/v1/ride-requests/${requestId}/cancel`);
  }

  const ride = await store.getRide(request.ride_id);
  if (!ride || ride.organization_id !== ctx.org.id) {
    return problemResponse(404, 'Ride Not Found', 'The associated ride was not found.', 'NOT_FOUND', `/api/v1/ride-requests/${requestId}/cancel`);
  }

  // Authorization check: only the passenger who requested it OR the driver hosting the ride can cancel
  if (request.passenger_id !== ctx.user.id && ride.driver_id !== ctx.user.id) {
    return problemResponse(403, 'Forbidden', 'Only the requesting passenger or host driver can cancel this booking.', 'FORBIDDEN', `/api/v1/ride-requests/${requestId}/cancel`);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason;

    const result = await store.cancelRideRequestWithPessimisticLock(requestId, ctx.user.id, reason);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(409, 'Cannot Cancel Request', errorMsg, 'INVALID_TRANSITION', `/api/v1/ride-requests/${requestId}/cancel`);
  }
}
