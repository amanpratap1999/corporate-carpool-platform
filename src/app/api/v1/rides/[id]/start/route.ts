import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);
  const { id } = await params;

  try {
    const updatedRide = store.startRide(id, ctx.user.id);
    return NextResponse.json({ ride: updatedRide });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(409, 'Cannot Start Ride', errorMsg, 'INVALID_TRANSITION', `/api/v1/rides/${id}/start`);
  }
}
