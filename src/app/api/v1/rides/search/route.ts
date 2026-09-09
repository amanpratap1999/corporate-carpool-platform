import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const searchParams = req.nextUrl.searchParams;
  const originLat = searchParams.get('origin_lat');
  const originLng = searchParams.get('origin_lng');
  const destLat = searchParams.get('dest_lat');
  const destLng = searchParams.get('dest_lng');
  const date = searchParams.get('date');
  const seatsNeeded = searchParams.get('seats_needed') || '1';
  const maxDetour = searchParams.get('max_detour_meters') || '3000';

  if (!originLat || !originLng || !destLat || !destLng || !date) {
    return problemResponse(
      400,
      'Missing Search Parameters',
      'origin_lat, origin_lng, dest_lat, dest_lng, and date are required.',
      'VALIDATION_ERROR',
      '/api/v1/rides/search'
    );
  }

  try {
    const results = store.searchCorridorRides({
      orgId: ctx.org.id,
      originLat: parseFloat(originLat),
      originLng: parseFloat(originLng),
      destLat: parseFloat(destLat),
      destLng: parseFloat(destLng),
      date,
      seatsNeeded: parseInt(seatsNeeded, 10),
      maxDetourMeters: parseInt(maxDetour, 10),
    });

    return NextResponse.json({
      query: {
        origin: { lat: parseFloat(originLat), lng: parseFloat(originLng) },
        destination: { lat: parseFloat(destLat), lng: parseFloat(destLng) },
        date,
        seats_needed: parseInt(seatsNeeded, 10),
      },
      match_count: results.length,
      rides: results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Search Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/rides/search');
  }
}
