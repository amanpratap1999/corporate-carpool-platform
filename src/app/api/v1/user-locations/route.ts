import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { UserLocation } from '@/domain/types';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  const locations = (await store.getAllUserLocations()).filter(
    (l) => l.user_id === ctx.user.id && l.organization_id === ctx.org.id
  );

  return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

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

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return problemResponse(
        400,
        'Invalid Coordinates',
        'latitude must be between -90 and 90, longitude between -180 and 180.',
        'VALIDATION_ERROR',
        '/api/v1/user-locations'
      );
    }

    const location: UserLocation = {
      id: crypto.randomUUID(),
      user_id: ctx.user.id,
      organization_id: ctx.org.id,
      label: String(body.label).trim(),
      address_text: String(body.address_text).trim(),
      latitude: lat,
      longitude: lng,
      place_id: body.place_id ? String(body.place_id) : undefined,
      is_default_pickup: Boolean(body.is_default_pickup),
      is_default_drop: Boolean(body.is_default_drop),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await store.setUserLocation(location);

    return NextResponse.json(location, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/user-locations');
  }
}
