import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

const KNOWN_PRESETS: Record<string, { address: string; lat: number; lng: number; name: string }> = {
  'preset-acme-hq': {
    address: '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)',
    lat: 37.422,
    lng: -122.0841,
    name: 'Acme HQ',
  },
  'preset-sf-mission': {
    address: '450 Dolores St, San Francisco, CA (SF Mission Dolores)',
    lat: 37.7615,
    lng: -122.426,
    name: 'SF Mission Dolores',
  },
  'preset-san-mateo': {
    address: '300 S El Camino Real, San Mateo, CA (San Mateo Hub)',
    lat: 37.563,
    lng: -122.3255,
    name: 'San Mateo Hub',
  },
  'preset-palo-alto': {
    address: '340 University Ave, Palo Alto, CA (Palo Alto Station)',
    lat: 37.4445,
    lng: -122.1611,
    name: 'Palo Alto Station',
  },
  'preset-millbrae': {
    address: '100 California Dr, Millbrae, CA (Millbrae BART)',
    lat: 37.5997,
    lng: -122.3867,
    name: 'Millbrae BART',
  },
};

/**
 * GET /api/v1/routing/place-details?place_id=<id>
 *
 * Server-side proxy for Google Place Details.
 * Resolves coordinates and formatted address for a selected place_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;

  // Rate limiting: 60 place details queries per minute per user
  const detailsLimit = await rateLimiter.checkShared(`place-details:${auth.ctx.user.id}`, 60, 60);
  if (!detailsLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Place details rate limit exceeded. Retry in ${detailsLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(detailsLimit.resetSeconds) }
    );
  }

  const placeId = req.nextUrl.searchParams.get('place_id');
  if (!placeId || placeId.trim().length === 0) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'place_id query parameter is required',
      'ERR_MISSING_PLACE_ID',
      req.nextUrl.pathname
    );
  }

  const trimmedPlaceId = placeId.trim();

  // 1. Check known presets first (handles corporate presets deterministically)
  if (KNOWN_PRESETS[trimmedPlaceId]) {
    const preset = KNOWN_PRESETS[trimmedPlaceId];
    return NextResponse.json({
      place: {
        place_id: trimmedPlaceId,
        address: preset.address,
        lat: preset.lat,
        lng: preset.lng,
        name: preset.name,
      },
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return problemResponse(
      503,
      'Service Unavailable',
      'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in environment variables.',
      'ERR_GOOGLE_MAPS_NOT_CONFIGURED',
      req.nextUrl.pathname
    );
  }

  try {
    // 2. Try modern Places API (New)
    const newPlaceUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(trimmedPlaceId)}`;
    const newPlaceRes = await fetch(newPlaceUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types',
      },
    });

    if (newPlaceRes.ok) {
      const data = await newPlaceRes.json();
      if (
        data.location &&
        typeof data.location.latitude === 'number' &&
        typeof data.location.longitude === 'number'
      ) {
        return NextResponse.json({
          place: {
            place_id: data.id || trimmedPlaceId,
            address: data.formattedAddress || data.displayName?.text || 'Selected Location',
            lat: data.location.latitude,
            lng: data.location.longitude,
            name: data.displayName?.text,
            types: data.types,
          },
        });
      }
    }

    // 3. Fallback to legacy Google Place Details API
    const legacyUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    legacyUrl.searchParams.set('place_id', trimmedPlaceId);
    legacyUrl.searchParams.set('fields', 'place_id,name,formatted_address,geometry,types');
    legacyUrl.searchParams.set('key', apiKey);

    const legacyRes = await fetch(legacyUrl.toString());
    if (legacyRes.ok) {
      const data = await legacyRes.json();
      if (
        data.status === 'OK' &&
        data.result?.geometry?.location &&
        typeof data.result.geometry.location.lat === 'number' &&
        typeof data.result.geometry.location.lng === 'number'
      ) {
        return NextResponse.json({
          place: {
            place_id: data.result.place_id || trimmedPlaceId,
            address: data.result.formatted_address || data.result.name || 'Selected Location',
            lat: data.result.geometry.location.lat,
            lng: data.result.geometry.location.lng,
            name: data.result.name,
            types: data.result.types,
          },
        });
      }

      if (data.status && data.status !== 'OK') {
        return problemResponse(
          502,
          'Bad Gateway',
          `Google Place Details API returned: ${data.status}. ${data.error_message || ''}`,
          'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
          req.nextUrl.pathname
        );
      }
    }

    return problemResponse(
      502,
      'Bad Gateway',
      'Could not resolve coordinates for the requested place_id.',
      'ERR_PLACE_DETAILS_FAILED',
      req.nextUrl.pathname
    );
  } catch (err) {
    console.error('Place Details resolution error:', err);
    return problemResponse(
      502,
      'Bad Gateway',
      'Failed to contact Google Place Details API.',
      'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
      req.nextUrl.pathname
    );
  }
}
