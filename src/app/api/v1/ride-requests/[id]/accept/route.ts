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
    const result = store.acceptRideRequest(requestId, ctx.user.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(409, 'Cannot Accept Request', errorMsg, 'CONCURRENCY_OR_CAPACITY_ERROR', `/api/v1/ride-requests/${requestId}/accept`);
  }
}
