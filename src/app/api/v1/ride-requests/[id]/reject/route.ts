import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);
  const { id: requestId } = await params;

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
