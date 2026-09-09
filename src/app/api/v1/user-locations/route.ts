import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';
import { UserLocation } from '@/domain/types';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const locations = Array.from(store.userLocations.values()).filter(
    (l) => l.user_id === ctx.user.id && l.organization_id === ctx.org.id
  );

  return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  try {
    const body = await req.json();
    if (!body.label || !body.address_text || body.latitude === undefined || body.longitude === undefined) {
      return problemResponse(
        400,
        'Invalid Location Input',
        'label, address_text, latitude, and longitude are required.',
        'VALIDATION_ERROR',
        '/api/v1/user-locations'
      );
    }

    const location: UserLocation = {
      id: crypto.randomUUID(),
      user_id: ctx.user.id,
      organization_id: ctx.org.id,
      label: body.label,
      address_text: body.address_text,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      place_id: body.place_id,
      is_default_pickup: Boolean(body.is_default_pickup),
      is_default_drop: Boolean(body.is_default_drop),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.userLocations.set(location.id, location);

    return NextResponse.json(location, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/user-locations');
  }
}
