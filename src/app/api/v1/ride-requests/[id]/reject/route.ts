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
    return problemResponse(404, 'Request Not Found', 'The requested ride request was not found.', 'NOT_FOUND', `/api/v1/ride-requests/${requestId}/reject`);
  }

  const ride = await store.getRide(request.ride_id);
  if (!ride || ride.organization_id !== ctx.org.id) {
    return problemResponse(404, 'Ride Not Found', 'The associated ride was not found.', 'NOT_FOUND', `/api/v1/ride-requests/${requestId}/reject`);
  }

  // Driver authorization check: only ride host can reject requests
  if (ride.driver_id !== ctx.user.id) {
    return problemResponse(403, 'Forbidden', 'Only the ride host can reject seat requests.', 'FORBIDDEN', `/api/v1/ride-requests/${requestId}/reject`);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason;

    const updatedRequest = store.rejectRideRequest(requestId, ctx.user.id, reason);
    return NextResponse.json({ request: updatedRequest });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(409, 'Cannot Reject Request', errorMsg, 'INVALID_TRANSITION', `/api/v1/ride-requests/${requestId}/reject`);
  }
}
